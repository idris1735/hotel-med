// POST /api/bookings/create
//
// Called by the booking form BEFORE the Paystack popup opens. Validates the
// request, computes the real price server-side (never trusts a client-sent
// amount), writes a 'pending' booking row, and hands back everything the
// frontend needs to open PaystackPop: the reference, the amount in kobo,
// and the Paystack PUBLIC key (safe to expose — this is the one place the
// frontend learns it, so it never has to be hardcoded into static HTML).
const { sql } = require('../_lib/db');
const {
  getRoom,
  isValidRoomType,
  isValidCurrency,
  pricePerNightForCurrency,
  nightsBetween,
} = require('../_lib/rooms');
const { generateReference } = require('../_lib/reference');

// Excludes HTML-special characters explicitly, not just whitespace/@ — this
// data gets echoed back into the booking confirmation UI and (per the
// client's brief) will eventually feed an admin dashboard other staff view,
// so it's validated here too rather than relying solely on client-side
// escaping downstream.
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const {
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
  } = body;

  if (!isValidRoomType(roomType)) {
    return res.status(400).json({ error: 'Invalid or missing roomType' });
  }
  // An omitted currency defaults to NGN (keeps any caller that predates the
  // currency toggle working); an explicitly wrong one is rejected outright
  // rather than silently coerced -- a mistyped currency should never result
  // in charging someone a different amount than they thought they agreed to.
  if (currency !== undefined && !isValidCurrency(currency)) {
    return res.status(400).json({ error: 'Invalid currency' });
  }
  const resolvedCurrency = currency || 'NGN';
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) {
    return res.status(400).json({ error: 'checkIn and checkOut must be YYYY-MM-DD' });
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (!Number.isFinite(nights) || nights < 1) {
    return res.status(400).json({ error: 'checkOut must be at least one night after checkIn' });
  }
  const adultsNum = Number.parseInt(adults, 10) || 1;
  const childrenNum = Number.parseInt(children, 10) || 0;
  if (adultsNum < 1 || adultsNum > 10 || childrenNum < 0 || childrenNum > 10) {
    return res.status(400).json({ error: 'Invalid guest count' });
  }
  if (!guestName || typeof guestName !== 'string' || guestName.trim().length < 2 || guestName.length > 120) {
    return res.status(400).json({ error: 'guestName is required' });
  }
  if (!guestEmail || guestEmail.length > 254 || !EMAIL_RE.test(guestEmail)) {
    return res.status(400).json({ error: 'A valid guestEmail is required' });
  }
  if (guestPhone && (typeof guestPhone !== 'string' || guestPhone.length > 32)) {
    return res.status(400).json({ error: 'Invalid guestPhone' });
  }
  if (specialRequests && (typeof specialRequests !== 'string' || specialRequests.length > 2000)) {
    return res.status(400).json({ error: 'specialRequests is too long' });
  }

  const room = getRoom(roomType);
  const pricePerNight = pricePerNightForCurrency(room, resolvedCurrency);
  const amountMajor = pricePerNight * nights;
  const amountSubunit = amountMajor * 100; // kobo for NGN, cents for USD
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
    console.error('bookings/create insert failed', err);
    return res.status(500).json({ error: 'Could not create booking' });
  }

  return res.status(200).json({
    reference,
    currency: resolvedCurrency,
    amountSubunit,
    amountMajor,
    nights,
    roomName: room.name,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
  });
};
