// GET  /api/affiliates/respond?id=...&token=...&action=approve|decline
//   Renders a confirmation page only -- makes NO state change. This is the
//   link clicked directly from the notification email, and email security
//   scanners (Outlook Safe Links, Gmail's link-checking proxy, corporate
//   gateways) prefetch GET links before a human ever opens the message, so
//   a GET here must stay a no-op or the scanner silently burns the
//   single-use token before the hotel ever sees the email.
// POST /api/affiliates/respond   body: { id, token, action }
//   The confirmation page's own form submits here -- this is the only path
//   that actually calls respondToApplication. Still no login: the random
//   token *is* the auth, same as before, just no longer triggered by GET.
const { getPendingApplication, respondToApplication, escapeHtml } = require('../_lib/affiliates');

function page(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; background: #faf8f3; color: #171512;
      display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 2rem; }
    .card { max-width: 420px; text-align: center; }
    h1 { font-weight: 400; font-size: 1.6rem; }
    p { color: rgba(23,21,18,0.7); line-height: 1.6; }
    code { background: rgba(0,0,0,0.05); padding: 0.2em 0.5em; border-radius: 4px; }
    .actions { display: flex; gap: 0.8rem; justify-content: center; margin-top: 1.6rem; }
    button { font-family: inherit; font-size: 0.95rem; padding: 0.7em 1.6em; border-radius: 6px; cursor: pointer; border: none; }
    .approve { background: #c9a227; color: #171512; font-weight: 600; }
    .decline { background: transparent; color: rgba(23,21,18,0.55); text-decoration: underline; }
  </style></head><body><div class="card">${body}</div></body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'GET') {
    const { id, token } = req.query || {};
    const affiliate = await getPendingApplication({ id, token });
    if (!affiliate) {
      return res.status(400).send(page('Affiliate application', `<h1>That link didn't work</h1><p>This application has already been decided, or the link is invalid.</p>`));
    }
    const body = `
      <h1>Affiliate application</h1>
      <p><b>${escapeHtml(affiliate.name)}</b> (${escapeHtml(affiliate.email)}) has applied to the affiliate program.</p>
      ${affiliate.promotion_channel ? `<p>"${escapeHtml(affiliate.promotion_channel)}"</p>` : ''}
      <form method="POST" action="/api/affiliates/respond">
        <input type="hidden" name="id" value="${escapeHtml(String(id))}">
        <input type="hidden" name="token" value="${escapeHtml(String(token))}">
        <div class="actions">
          <button class="approve" name="action" value="approve" type="submit">Approve</button>
          <button class="decline" name="action" value="decline" type="submit">Decline</button>
        </div>
      </form>
    `;
    return res.status(200).send(page('Affiliate application', body));
  }

  if (req.method === 'POST') {
    const { id, token, action } = req.body || {};
    const result = await respondToApplication({ id, token, action });

    if (!result.ok) {
      return res.status(400).send(page('Affiliate application', `<h1>That link didn't work</h1><p>${escapeHtml(result.error)}</p>`));
    }
    if (result.status === 'declined') {
      return res.status(200).send(page('Application declined', `<h1>Declined</h1><p>${escapeHtml(result.name)}'s application has been marked declined. No email was sent telling them why — let them know directly if you'd like to.</p>`));
    }
    return res.status(200).send(page('Application approved', `<h1>Approved</h1><p>${escapeHtml(result.name)} is now a Hotel Medallion affiliate with referral code <code>${escapeHtml(result.code)}</code>. They've been emailed their link.</p>`));
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method not allowed');
};
