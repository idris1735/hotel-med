// POST /api/paystack/webhook
//
// Register this URL (https://yourdomain.com/api/paystack/webhook) in the
// Paystack dashboard under Settings -> API Keys & Webhooks. This is the
// SOURCE OF TRUTH for "did the guest actually pay" — the frontend's own
// PaystackPop onSuccess callback can be spoofed by a modified client, so
// a booking is only ever marked paid here (or via the belt-and-braces
// /api/paystack/verify check), never from client-reported success alone.
const crypto = require('crypto');
const { sql } = require('../_lib/db');
const { getRawBody } = require('../_lib/raw-body');
const { sendBookingConfirmationEmail } = require('../_lib/email');

module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error('PAYSTACK_SECRET_KEY is not set');
    return res.status(500).send('Server misconfigured');
  }

  const rawBody = await getRawBody(req);

  const expectedSignature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const signature = req.headers['x-paystack-signature'];

  // Plain string comparison (!==) short-circuits on the first mismatched
  // character, so its timing leaks how many leading bytes of a guess were
  // correct — a real (if slow, over a network) side channel for forging a
  // signature byte-by-byte. timingSafeEqual takes the same time regardless
  // of where the mismatch is. It throws on unequal-length buffers rather
  // than returning false, so that's checked explicitly first.
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  const signatureBuf = Buffer.from(String(signature || ''), 'hex');
  const validSignature =
    signatureBuf.length === expectedBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);

  if (!signature || !validSignature) {
    console.warn('Paystack webhook signature mismatch — rejecting');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).send('Invalid JSON');
  }

  // Acknowledge immediately for events we don't act on — Paystack retries
  // on non-2xx, we don't want retries for events that aren't charge.success.
  if (event.event !== 'charge.success') {
    return res.status(200).send('ok');
  }

  const data = event.data || {};
  const reference = data.reference;
  const paidAmountSubunit = data.amount;
  const paidCurrency = data.currency;

  if (!reference) {
    return res.status(200).send('ok');
  }

  try {
    // `postgres` resolves to the rows array directly, not `{ rows }`.
    const rows = await sql`
      SELECT amount_subunit, currency, status, room_type, check_in, check_out,
        guest_name, guest_email, guest_phone, adults, children
      FROM bookings WHERE reference = ${reference}
    `;
    const booking = rows[0];

    if (!booking) {
      console.warn(`Webhook for unknown reference: ${reference}`);
      return res.status(200).send('ok');
    }
    if (booking.status === 'paid') {
      return res.status(200).send('ok'); // already processed — idempotent
    }
    // Both amount AND currency must match what we quoted — a numeric match
    // alone isn't enough (10000 kobo NGN and 10000 cents USD are wildly
    // different real values).
    const amountMatches = Number(booking.amount_subunit) === Number(paidAmountSubunit);
    const currencyMatches = booking.currency === paidCurrency;
    if (!amountMatches || !currencyMatches) {
      console.error(
        `Payment mismatch for ${reference}: expected ${booking.amount_subunit} ${booking.currency}, got ${paidAmountSubunit} ${paidCurrency}`
      );
      // sql.json(...) is required here: unlike @vercel/postgres, the
      // `postgres` client doesn't infer a plain JS object as JSON for a
      // JSONB column on its own -- without this it errors instead of
      // silently miscoding, but wrapping it explicitly is the documented,
      // correct way rather than relying on that failure to catch it.
      await sql`
        UPDATE bookings SET status = 'failed', paystack_event_data = ${sql.json(event)}, updated_at = now()
        WHERE reference = ${reference}
      `;
      return res.status(200).send('ok');
    }

    await sql`
      UPDATE bookings SET status = 'paid', paystack_event_data = ${sql.json(event)}, updated_at = now()
      WHERE reference = ${reference}
    `;
    // This is the only one of the two possible "first to mark paid" paths
    // that fired for this booking (see the idempotency check above) — the
    // other (api/paystack/verify.js) will see status already 'paid' and
    // skip sending its own copy.
    await sendBookingConfirmationEmail({ ...booking, reference });
  } catch (err) {
    console.error('webhook processing failed', err);
    // Still 200 — we don't want Paystack hammering retries for our own DB
    // hiccup; /api/paystack/verify is the fallback safety net for this case.
    return res.status(200).send('ok');
  }

  return res.status(200).send('ok');
};
