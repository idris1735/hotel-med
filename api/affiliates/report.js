// GET  /api/affiliates/report?token=...           -- view who's owed what
// POST /api/affiliates/report?token=...            -- record a payout
//   body: { affiliateId, currency, amountSubunit, note? }
//
// There's no staff login on this site, so AFFILIATE_REPORT_TOKEN (a long
// random value, set in env vars, shared only with whoever runs payouts) is
// the access control for this whole page -- gates both reading the report
// and recording that a payout happened. Treat that token like a password.
const crypto = require('crypto');
const { sql } = require('../_lib/db');
const { buildCommissionReport, escapeHtml, MIN_PAYOUT_SUBUNIT_NGN } = require('../_lib/affiliates');

// Plain !== leaks timing info byte-by-byte; irrelevant against most
// attackers but free to close off. Both sides must be equal-length for
// timingSafeEqual, so a length mismatch is just treated as "wrong".
function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function formatAmount(subunit, currency) {
  const major = (subunit / 100).toLocaleString(currency === 'USD' ? 'en-US' : 'en-NG');
  return (currency === 'USD' ? '$' : '₦') + major;
}

function renderReportHtml(report) {
  const rows = report.map((a) => {
    const owedEntries = Object.entries(a.owed);
    const owedText = owedEntries.length
      ? owedEntries.map(([cur, amt]) => formatAmount(amt, cur)).join(' + ')
      : '—';
    return `
      <tr>
        <td>${escapeHtml(a.name)}</td>
        <td><code>${escapeHtml(a.referralCode)}</code></td>
        <td>${a.bookingCount}</td>
        <td>${owedText}</td>
        <td>${a.meetsMinimum ? '<span class="ready">Ready to pay</span>' : '<span class="wait">Below minimum</span>'}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Affiliate report</title>
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; background: #faf8f3; color: #171512; padding: 2.5rem 1.5rem; max-width: 900px; margin: 0 auto; }
    h1 { font-family: Georgia, serif; font-weight: 400; }
    .note { color: rgba(23,21,18,0.6); font-size: 0.88rem; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { text-align: left; padding: 0.7em 0.9em; border-bottom: 1px solid rgba(0,0,0,0.08); font-size: 0.92rem; }
    th { font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(23,21,18,0.5); }
    code { background: rgba(0,0,0,0.05); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.85em; }
    .ready { color: #4b6a3a; font-weight: 600; }
    .wait { color: rgba(23,21,18,0.4); }
  </style></head><body>
    <h1>Affiliate commissions</h1>
    <p class="note">10% commission on paid bookings · ${formatAmount(MIN_PAYOUT_SUBUNIT_NGN, 'NGN')} minimum before payout · paid on the 15th of each month. Figures shown are owed since each affiliate's last recorded payout.</p>
    <table>
      <thead><tr><th>Affiliate</th><th>Code</th><th>Bookings</th><th>Owed</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No approved affiliates yet.</td></tr>'}</tbody>
    </table>
  </body></html>`;
}

module.exports = async (req, res) => {
  // This token lives in a URL (no login system on this site), so the
  // cheap hardening that fits a GET-driven page like this one: never
  // cache it, never leak it onward via Referer, and compare it without a
  // timing side-channel. It does not get a POST+cookie login flow -- that
  // would need building an actual login UI, out of proportion for a
  // single-person, occasionally-used internal report.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  const token = (req.query && req.query.token) || '';
  const expected = process.env.AFFILIATE_REPORT_TOKEN;
  if (!tokenMatches(token, expected)) {
    return res.status(404).send('Not found');
  }

  if (req.method === 'GET') {
    const report = await buildCommissionReport();
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(renderReportHtml(report));
  }

  if (req.method === 'POST') {
    const { affiliateId, currency, amountSubunit, note } = req.body || {};
    if (!affiliateId || !['NGN', 'USD'].includes(currency) || !Number.isFinite(Number(amountSubunit)) || Number(amountSubunit) <= 0) {
      return res.status(400).json({ error: 'affiliateId, a valid currency, and a positive amountSubunit are required' });
    }
    try {
      await sql`
        INSERT INTO affiliate_payouts (affiliate_id, amount_subunit, currency, covers_through, note)
        VALUES (${affiliateId}, ${Math.round(Number(amountSubunit))}, ${currency}, now(), ${note || null})
      `;
    } catch (err) {
      console.error('recording affiliate payout failed', err);
      return res.status(500).json({ error: 'Could not record payout' });
    }
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
