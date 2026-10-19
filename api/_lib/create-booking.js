// Compatibility handoff for the old form and Vesper call sites. The public
// website must not maintain a second booking database or calculate a second
// price. Hotel OS is the only booking source of truth.
const BOOKING_URL = 'https://app.hotelmedallion.com/book/medallion';

async function createBookingRecord() {
  return { ok: true, data: { bookingUrl: BOOKING_URL, created: false } };
}

module.exports = { createBookingRecord };
