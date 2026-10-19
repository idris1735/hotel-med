// POST /api/bookings/create
//
// Compatibility endpoint for older cached pages. It never creates a record;
// callers are handed to the live Hotel OS booking engine instead.
const { createBookingRecord } = require('../_lib/create-booking');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await createBookingRecord(req.body || {});
  if (!result.ok) {
    const status = result.error === 'Could not create booking' ? 500 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.status(200).json(result.data);
};
