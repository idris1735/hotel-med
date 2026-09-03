// POST /api/bookings/create
//
// Called by the booking form BEFORE the Paystack popup opens. Validates the
// request, computes the real price server-side (never trusts a client-sent
// amount), writes a 'pending' booking row, and hands back everything the
// frontend needs to open PaystackPop: the reference, the amount in kobo,
// and the Paystack PUBLIC key (safe to expose — this is the one place the
// frontend learns it, so it never has to be hardcoded into static HTML).
//
// The actual validation/insert logic lives in ../_lib/create-booking.js,
// shared with Vesper's create_booking tool in api/chat.js so both paths
// (human form, AI concierge) can never enforce different rules.
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
