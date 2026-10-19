// Core affiliate-program logic, shared by the application/approval/report
// endpoints. Design intentionally matches what the client actually
// confirmed rather than a generic template: 10% commission on completed,
// fully-paid room stays, ₦10,000 minimum before a payout is worth
// processing, paid on the 15th of each month, approved by the hotel
// directly (not a dashboard -- a single-use link emailed to them, since
// there's no staff login system on this site to gate an approval UI
// behind).
const crypto = require('crypto');
const { sql } = require('./db');
const { sendEmail } = require('./email');

const COMMISSION_RATE = 0.10;
const MIN_PAYOUT_SUBUNIT_NGN = 10000 * 100; // ₦10,000, in kobo

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const SITE_URL = process.env.SITE_URL || 'https://hotelmedallion.com';
const HOTEL_INBOX = process.env.AFFILIATE_APPROVER_EMAIL || 'info@hotelmedallion.com';

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

// A short, shareable code derived from the applicant's own name (so a
// partner can recognise their own link at a glance) plus a random suffix
// for uniqueness -- e.g. "JANE482". Retried on the rare collision rather
// than trusting a single draw, since the DB enforces uniqueness anyway.
function buildReferralCode(name) {
  const base = (name || '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 6) || 'PARTNER';
  const suffix = crypto.randomInt(100, 999);
  return `${base}${suffix}`;
}

async function applyAsAffiliate({ name, email, phone, promotionChannel }) {
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.length > 120) {
    return { ok: false, error: 'Please enter your name.' };
  }
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (phone && (typeof phone !== 'string' || phone.length > 32)) {
    return { ok: false, error: 'Invalid phone number.' };
  }
  if (promotionChannel && (typeof promotionChannel !== 'string' || promotionChannel.length > 1000)) {
    return { ok: false, error: 'That description is too long.' };
  }

  const token = randomToken();
  let row;
  try {
    const rows = await sql`
      INSERT INTO affiliates (name, email, phone, promotion_channel, approval_token)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${phone || null}, ${promotionChannel || null}, ${token})
      RETURNING id
    `;
    row = rows[0];
  } catch (err) {
    // Most likely the UNIQUE constraint on email -- a real person applying
    // twice, not an attack, so a plain honest message is fine here.
    if (String(err.message || '').includes('affiliates_email_key')) {
      return { ok: false, error: 'An application with this email already exists.' };
    }
    console.error('applyAsAffiliate insert failed', err);
    return { ok: false, error: 'Could not submit your application. Please try again.' };
  }

  const approveUrl = `${SITE_URL}/api/affiliates/respond?id=${row.id}&token=${token}&action=approve`;
  const declineUrl = `${SITE_URL}/api/affiliates/respond?id=${row.id}&token=${token}&action=decline`;
  await sendEmail({
    to: HOTEL_INBOX,
    subject: `New affiliate application — ${name.trim()}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 480px;">
        <h2 style="margin:0 0 1rem;">New affiliate application</h2>
        <p><b>Name:</b> ${escapeHtml(name)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        ${phone ? `<p><b>Phone:</b> ${escapeHtml(phone)}</p>` : ''}
        ${promotionChannel ? `<p><b>How they plan to promote:</b> ${escapeHtml(promotionChannel)}</p>` : ''}
        <p style="margin-top:2rem;">
          <a href="${approveUrl}" style="background:#C9A227;color:#0a0a0f;padding:0.8em 1.6em;text-decoration:none;border-radius:4px;font-weight:600;margin-right:0.8em;">Approve</a>
          <a href="${declineUrl}" style="color:#999;text-decoration:underline;">Decline</a>
        </p>
      </div>
    `,
    text: `New affiliate application\n\nName: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ''}${promotionChannel ? `\nPromotion plan: ${promotionChannel}` : ''}\n\nApprove: ${approveUrl}\nDecline: ${declineUrl}`,
  });

  return { ok: true };
}

// Read-only lookup for the GET confirmation page -- deliberately does NOT
// touch the row. Email security scanners (Outlook Safe Links, Gmail's
// link-checking proxy, corporate gateways) prefetch GET links in emails
// before a human ever clicks, so the actual approve/decline must only ever
// happen on a POST a person submits from the confirmation page.
async function getPendingApplication({ id, token }) {
  if (!id || !token) return null;
  const rows = await sql`SELECT * FROM affiliates WHERE id = ${id}`;
  const affiliate = rows[0];
  if (!affiliate || !affiliate.approval_token || affiliate.approval_token !== token) return null;
  return affiliate;
}

// Called from the POST a human submits on the confirmation page (never
// directly from the GET email link -- see getPendingApplication above).
async function respondToApplication({ id, token, action }) {
  if (!id || !token || !['approve', 'decline'].includes(action)) {
    return { ok: false, error: 'Invalid link.' };
  }
  const rows = await sql`SELECT * FROM affiliates WHERE id = ${id}`;
  const affiliate = rows[0];
  if (!affiliate) return { ok: false, error: 'Application not found.' };
  if (!affiliate.approval_token || affiliate.approval_token !== token) {
    // Either already acted on (token cleared) or someone guessing ids.
    return { ok: false, error: 'This link has already been used or is invalid.' };
  }

  if (action === 'decline') {
    await sql`UPDATE affiliates SET status = 'declined', approval_token = NULL, decided_at = now() WHERE id = ${id}`;
    return { ok: true, status: 'declined', name: affiliate.name };
  }

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = buildReferralCode(affiliate.name);
    try {
      await sql`
        UPDATE affiliates
        SET status = 'approved', referral_code = ${code}, approval_token = NULL, decided_at = now()
        WHERE id = ${id}
      `;
      break;
    } catch (err) {
      if (String(err.message || '').includes('affiliates_referral_code_key') && attempt < 4) {
        continue; // collision on the random suffix -- retry with a new one
      }
      console.error('respondToApplication approve failed', err);
      return { ok: false, error: 'Could not approve this application. Please try again.' };
    }
  }

  const link = `${SITE_URL}/?ref=${code}`;
  await sendEmail({
    to: affiliate.email,
    subject: "You're approved — Hotel Medallion Affiliate Program",
    html: `
      <div style="font-family: Georgia, serif; max-width: 480px;">
        <h2 style="margin:0 0 1rem;">Welcome aboard, ${escapeHtml(affiliate.name.split(' ')[0])}.</h2>
        <p>You're approved as a Hotel Medallion affiliate. Here's your personal link — share it however you like:</p>
        <p style="background:#f5f0e8;padding:1em;border-radius:6px;font-family:monospace;word-break:break-all;">${link}</p>
        <p>Every guest who books within 30 days of clicking it is tracked back to you automatically. You'll earn ${COMMISSION_RATE * 100}% commission on their completed, fully-paid stay. Payouts run on the 15th of each month once you cross ₦10,000 in commission.</p>
      </div>
    `,
    text: `Welcome aboard, ${affiliate.name.split(' ')[0]}.\n\nYou're approved as a Hotel Medallion affiliate. Your link:\n${link}\n\nEvery guest who books within 30 days of clicking it is tracked back to you automatically. You'll earn ${COMMISSION_RATE * 100}% commission on their completed, fully-paid stay. Payouts run on the 15th of each month once you cross ₦10,000 in commission.`,
  });

  return { ok: true, status: 'approved', name: affiliate.name, code };
}

// Looks up an affiliate by referral code -- used when a booking is created
// to decide whether (and to whom) to attribute it. Only 'approved'
// affiliates' codes are valid, so a declined/pending applicant's code
// (which was never actually issued, but defensively) can't attach to a
// booking.
async function findApprovedAffiliateByCode(code) {
  if (!code || typeof code !== 'string') return null;
  const rows = await sql`SELECT id, name, referral_code FROM affiliates WHERE referral_code = ${code} AND status = 'approved'`;
  return rows[0] || null;
}

// Commission report: for every approved affiliate, how much they've
// earned from paid bookings since their last payout's watermark (or ever,
// if they've never been paid), and whether that crosses the ₦10,000
// minimum. Computed live from bookings rather than stored, so it's always
// correct even if a booking's payment status changes after the fact.
async function buildCommissionReport() {
  const affiliates = await sql`SELECT id, name, email, referral_code, created_at FROM affiliates WHERE status = 'approved' ORDER BY name`;
  const report = [];
  for (const aff of affiliates) {
    const lastPayout = await sql`
      SELECT covers_through FROM affiliate_payouts WHERE affiliate_id = ${aff.id} ORDER BY covers_through DESC LIMIT 1
    `;
    const since = lastPayout[0] ? lastPayout[0].covers_through : aff.created_at;
    const bookings = await sql`
      SELECT currency, amount_subunit, created_at FROM bookings
      WHERE affiliate_code = ${aff.referral_code} AND status = 'paid' AND created_at > ${since}
    `;
    const totals = {}; // currency -> subunit owed
    for (const b of bookings) {
      const commission = Math.round(Number(b.amount_subunit) * COMMISSION_RATE);
      totals[b.currency] = (totals[b.currency] || 0) + commission;
    }
    // The client only set a ₦10,000 minimum -- no USD figure was given.
    // Rather than invent an FX-derived threshold, USD commission just has
    // to be >0 to show as payable; flag this to the client if a real USD
    // minimum should apply too.
    const meetsMinimum = Object.entries(totals).some(([cur, amt]) =>
      cur === 'NGN' ? amt >= MIN_PAYOUT_SUBUNIT_NGN : amt > 0
    );
    report.push({
      id: aff.id,
      name: aff.name,
      email: aff.email,
      referralCode: aff.referral_code,
      bookingCount: bookings.length,
      owed: totals, // e.g. { NGN: 20400000 } (subunit)
      meetsMinimum,
    });
  }
  return report;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  COMMISSION_RATE,
  MIN_PAYOUT_SUBUNIT_NGN,
  applyAsAffiliate,
  getPendingApplication,
  respondToApplication,
  findApprovedAffiliateByCode,
  buildCommissionReport,
  escapeHtml,
};
