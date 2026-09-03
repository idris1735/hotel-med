// Sends the booking confirmation/receipt email via Resend's REST API
// directly (no SDK — same pattern as the Paystack calls elsewhere in this
// project, one less dependency to track).
//
// Called from both api/paystack/webhook.js and api/paystack/verify.js, at
// the exact point each one transitions a booking's status to 'paid' for
// the first time. Both are already guarded against re-processing an
// already-paid booking (idempotency check on booking.status), so whichever
// of the two "wins the race" for a given booking is also the only one that
// will ever call this — no risk of sending the email twice.
//
// Failure here must never break the booking/payment flow itself: if Resend
// is down, unconfigured, or the domain isn't verified yet, the booking
// still gets correctly marked paid. This is a courtesy notification, not
// part of the critical path.
const { getRoom } = require('./rooms');

function formatAmount(amountSubunit, currency) {
  const major = Math.round(amountSubunit / 100);
  if (currency === 'USD') return '$' + major.toLocaleString('en-US');
  return '₦' + major.toLocaleString('en-NG');
}

// `value` here is whatever the `postgres` client hands back for a DATE
// column, which is a native JS Date object (confirmed by testing), NOT a
// string -- template-literal-concatenating a suffix onto it (the previous
// approach) silently stringified it via toString() into something like
// "Tue Dec 15 2026 01:00:00 GMT+0100 (West Africa Standard Time)T00:00:00Z",
// which Date() can't parse, producing the literal text "Invalid Date" in
// the email. Passing the value straight into `new Date()` handles a Date
// instance, a full ISO datetime string, or a plain "YYYY-MM-DD" string
// correctly, since it doesn't assume a specific shape going in.
function formatDate(value) {
  const d = new Date(value);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function nightsBetween(checkIn, checkOut) {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendBookingConfirmationEmail(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping confirmation email');
    return;
  }

  const room = getRoom(booking.room_type);
  const roomName = room ? room.name : booking.room_type;
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Hotel Medallion <onboarding@resend.dev>';
  // Needs to be an absolute URL -- email clients can't resolve a relative
  // "assets/logo-icon.png" the way a browser on the live site can. Update
  // this once a real domain replaces the Vercel one.
  const siteUrl = process.env.SITE_URL || 'https://hotel-med.vercel.app';
  const logoUrl = `${siteUrl}/assets/logo-icon.png`;

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const guestCount = [
    `${booking.adults} adult${Number(booking.adults) === 1 ? '' : 's'}`,
    Number(booking.children) > 0 ? `${booking.children} child${Number(booking.children) === 1 ? '' : 'ren'}` : null,
  ].filter(Boolean).join(', ');
  const amount = formatAmount(booking.amount_subunit, booking.currency);
  const firstName = (booking.guest_name || '').trim().split(/\s+/)[0] || 'there';

  const detailRow = (label, value) =>
    `<tr><td style="padding: 10px 0; border-top: 1px solid rgba(23,21,18,0.12); color: rgba(23,21,18,0.55);">${label}</td><td style="padding: 10px 0; border-top: 1px solid rgba(23,21,18,0.12); text-align: right;">${value}</td></tr>`;

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; background: #faf8f3; color: #171512; padding: 40px 24px; max-width: 520px; margin: 0 auto;">
      <img src="${logoUrl}" alt="Hotel Medallion" width="40" height="40" style="display: block; margin: 0 0 16px;">
      <p style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #a9821f; margin: 0 0 24px;">Hotel Medallion</p>
      <h1 style="font-size: 26px; font-weight: 400; margin: 0 0 8px;">Reservation Confirmed</h1>
      <p style="font-size: 14px; color: rgba(23,21,18,0.65); margin: 0 0 8px;">Thank you, ${escapeHtml(firstName)} — here are your details.</p>
      <p style="font-size: 12px; letter-spacing: 0.5px; color: rgba(23,21,18,0.4); margin: 0 0 32px;">Reference: ${escapeHtml(booking.reference)}</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 32px;">
        ${detailRow('Guest', escapeHtml(booking.guest_name || ''))}
        ${detailRow('Room', escapeHtml(roomName))}
        ${detailRow('Arrival', formatDate(booking.check_in))}
        ${detailRow('Departure', formatDate(booking.check_out))}
        ${detailRow('Length of stay', `${nights} night${nights === 1 ? '' : 's'}`)}
        ${detailRow('Guests', escapeHtml(guestCount))}
        ${booking.guest_phone ? detailRow('Phone on file', escapeHtml(booking.guest_phone)) : ''}
        <tr><td style="padding: 10px 0; border-top: 1px solid rgba(23,21,18,0.12); border-bottom: 1px solid rgba(23,21,18,0.12); color: rgba(23,21,18,0.55);">Amount paid</td><td style="padding: 10px 0; border-top: 1px solid rgba(23,21,18,0.12); border-bottom: 1px solid rgba(23,21,18,0.12); text-align: right; font-weight: bold;">${amount}</td></tr>
      </table>
      <p style="font-size: 14px; line-height: 1.7; color: rgba(23,21,18,0.75);">We look forward to welcoming you. For any changes to this reservation, reply to this email or call 09060006382.</p>
      <p style="font-size: 12px; color: rgba(23,21,18,0.4); margin-top: 32px;">Hotel Medallion — Plot 61, Babatunde Anjous Avenue, off Admiralty Way, Lekki Phase 1, Lagos</p>
    </div>
  `;

  // A plain-text alternative alongside the HTML is a real, if modest,
  // deliverability signal — HTML-only mail (especially from a shared
  // sandbox sending domain) reads as more spam-like to most filters than a
  // proper multipart message. The bigger lever is verifying a real sending
  // domain (see the RESEND_FROM_EMAIL note in .env.example) — this alone
  // won't fix a spam-folder landing on its own, but it's a real, free
  // improvement to make regardless.
  const text = [
    'HOTEL MEDALLION — Reservation Confirmed',
    '',
    `Thank you, ${firstName} — here are your details.`,
    `Reference: ${booking.reference}`,
    '',
    `Guest: ${booking.guest_name || ''}`,
    `Room: ${roomName}`,
    `Arrival: ${formatDate(booking.check_in)}`,
    `Departure: ${formatDate(booking.check_out)}`,
    `Length of stay: ${nights} night${nights === 1 ? '' : 's'}`,
    `Guests: ${guestCount}`,
    booking.guest_phone ? `Phone on file: ${booking.guest_phone}` : null,
    `Amount paid: ${amount}`,
    '',
    'We look forward to welcoming you. For any changes to this reservation, reply to this email or call 09060006382.',
    '',
    'Hotel Medallion — Plot 61, Babatunde Anjous Avenue, off Admiralty Way, Lekki Phase 1, Lagos',
  ].filter((line) => line !== null).join('\n');

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: booking.guest_email,
        reply_to: 'info@hotelmedallion.com',
        subject: `Reservation Confirmed — ${roomName}`,
        html,
        text,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`Resend send failed (${resp.status}) for ${booking.reference}:`, body);
    }
  } catch (err) {
    console.error(`Resend send threw for ${booking.reference}:`, err.message);
  }
}

module.exports = { sendBookingConfirmationEmail };
