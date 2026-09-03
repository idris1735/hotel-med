// GET /api/paystack/verify?reference=XXX
//
// Called by the frontend right after PaystackPop's onSuccess fires. That
// client-side callback is a UX signal, not proof of payment — this endpoint
// re-checks directly against Paystack's API before the page shows a
// confirmed booking. It also updates the DB itself rather than only relying
// on the webhook, since the webhook can lag a few seconds and we want the
// guest to see confirmation immediately.
const { sql } = require('../_lib/db');
const { getRoom } = require('../_lib/rooms');
const { sendBookingConfirmationEmail } = require('../_lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const reference = req.query && req.query.reference;
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'reference is required' });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('PAYSTACK_SECRET_KEY is not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let paystackData;
  try {
    const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = await resp.json();
    if (!resp.ok || !json.status) {
      return res.status(502).json({ error: 'Could not verify transaction with Paystack' });
    }
    paystackData = json.data;
  } catch (err) {
    console.error('Paystack verify call failed', err);
    return res.status(502).json({ error: 'Could not reach Paystack' });
  }

  // guest_name/guest_email/guest_phone ARE selected here (needed
  // server-side to send the confirmation email below) but must NEVER be
  // put into the JSON response at the bottom of this function — this
  // endpoint takes only a reference, with no other auth, so anything in
  // the response is effectively public to anyone who has (or guesses) a
  // reference.
  // `postgres` (unlike @vercel/postgres) resolves the tagged template to
  // the rows array directly, not `{ rows }` -- no destructuring here.
  const rows = await sql`
    SELECT reference, room_type, check_in, check_out, currency, amount_subunit, status,
      guest_name, guest_email, guest_phone, adults, children
    FROM bookings WHERE reference = ${reference}
  `;
  const booking = rows[0];
  if (!booking) {
    return res.status(404).json({ error: 'Unknown booking reference' });
  }

  // Both amount AND currency must match — see the identical check in
  // api/paystack/webhook.js for why a numeric-only match isn't sufficient.
  const paid =
    paystackData.status === 'success' &&
    Number(paystackData.amount) === Number(booking.amount_subunit) &&
    paystackData.currency === booking.currency;

  if (paid && booking.status !== 'paid') {
    await sql`UPDATE bookings SET status = 'paid', updated_at = now() WHERE reference = ${reference}`;
    // Must be awaited, not fire-and-forget: this is a standard Node
    // serverless function (not an Edge Function with waitUntil), so once
    // the response below is sent, Vercel can freeze this execution before
    // an un-awaited call finishes -- silently dropping the email. The
    // small added latency here is worth the email actually sending
    // reliably. sendBookingConfirmationEmail already swallows its own
    // errors internally, so a Resend outage still can't break this response.
    await sendBookingConfirmationEmail(booking);
  } else if (!paid && booking.status === 'pending') {
    await sql`UPDATE bookings SET status = 'failed', updated_at = now() WHERE reference = ${reference}`;
  }

  const room = getRoom(booking.room_type);

  return res.status(200).json({
    reference: booking.reference,
    roomType: booking.room_type,
    roomName: room ? room.name : booking.room_type,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    currency: booking.currency,
    amountSubunit: Number(booking.amount_subunit),
    status: paid ? 'paid' : booking.status,
  });
};
