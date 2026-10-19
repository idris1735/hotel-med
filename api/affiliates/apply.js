// POST /api/affiliates/apply -- public, no auth. Anyone can submit an
// application; nothing is auto-approved. Notifies the hotel's own inbox
// with single-use approve/decline links (see api/affiliates/respond.js).
const { applyAsAffiliate } = require('../_lib/affiliates');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const result = await applyAsAffiliate({
    name: body.name,
    email: body.email,
    phone: body.phone,
    promotionChannel: body.promotionChannel,
  });

  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(200).json({ success: true });
};
