// Shared core of "create a pending booking" -- used by both
// api/bookings/create.js (the HTTP endpoint the booking forms call) and
// api/chat.js (Vesper's create_booking tool). Pulled out so the AI path
// can't drift from the validation/pricing the human-form path already
// enforces -- there is exactly one place a booking row gets written.
const { sql } = require('./db');
const {
  getRoom,
  isValidRoomType,
  isValidCurrency,
  pricePerNightForCurrency,
  nightsBetween,
} = require('./rooms');
const { generateReference } = require('./reference');

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns { ok: true, data } or { ok: false, error } -- never throws for a
// validation failure, only for an actual DB error, so callers (HTTP or AI
// tool) can both turn `error` into a message without a try/catch of their own.
async function createBookingRecord({
  roomType,
  currency,
  checkIn,
  checkOut,
  adults,
  children,
  guestName,
  guestEmail,
  guestPhone,
  specialRequests,
}) {
  if (!isValidRoomType(roomType)) {
    return { ok: false, error: 'Invalid or missing roomType' };
  }
  if (currency !== undefined && !isValidCurrency(currency)) {
    return { ok: false, error: 'Invalid currency' };
  }
  const resolvedCurrency = currency || 'NGN';
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) {
    return { ok: false, error: 'checkIn and checkOut must be YYYY-MM-DD' };
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (!Number.isFinite(nights) || nights < 1) {
    return { ok: false, error: 'checkOut must be at least one night after checkIn' };
  }
  const adultsNum = Number.parseInt(adults, 10) || 1;
  const childrenNum = Number.parseInt(children, 10) || 0;
  if (adultsNum < 1 || adultsNum > 10 || childrenNum < 0 || childrenNum > 10) {
    return { ok: false, error: 'Invalid guest count' };
  }
  if (!guestName || typeof guestName !== 'string' || guestName.trim().length < 2 || guestName.length > 120) {
    return { ok: false, error: 'guestName is required' };
  }
  if (!guestEmail || guestEmail.length > 254 || !EMAIL_RE.test(guestEmail)) {
    return { ok: false, error: 'A valid guestEmail is required' };
  }
  if (guestPhone && (typeof guestPhone !== 'string' || guestPhone.length > 32)) {
    return { ok: false, error: 'Invalid guestPhone' };
  }
  if (specialRequests && (typeof specialRequests !== 'string' || specialRequests.length > 2000)) {
    return { ok: false, error: 'specialRequests is too long' };
  }

  const room = getRoom(roomType);
  const pricePerNight = pricePerNightForCurrency(room, resolvedCurrency);
  const amountMajor = pricePerNight * nights;
  const amountSubunit = amountMajor * 100;
  const reference = generateReference();

  try {
    await sql`
      INSERT INTO bookings (
        reference, room_type, check_in, check_out, adults, children,
        guest_name, guest_email, guest_phone, special_requests, currency, amount_subunit, status
      ) VALUES (
        ${reference}, ${roomType}, ${checkIn}, ${checkOut}, ${adultsNum}, ${childrenNum},
        ${guestName.trim()}, ${guestEmail.trim()}, ${guestPhone || null}, ${specialRequests || null},
        ${resolvedCurrency}, ${amountSubunit}, 'pending'
      )
    `;
  } catch (err) {
    console.error('createBookingRecord insert failed', err);
    return { ok: false, error: 'Could not create booking' };
  }

  return {
    ok: true,
    data: {
      reference,
      currency: resolvedCurrency,
      amountSubunit,
      amountMajor,
      nights,
      roomName: room.name,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    },
  };
}

module.exports = { createBookingRecord };
