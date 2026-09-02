// Paystack signs the webhook payload's exact raw bytes with HMAC-SHA512.
// If we let Vercel auto-parse the JSON body first, we lose those exact
// bytes (re-serializing req.body to JSON can produce a byte-for-byte
// different string — different key order, spacing, number formatting —
// which would make the signature check fail even for a genuine event).
// So the webhook function disables the default body parser (see its
// `config.api.bodyParser = false` export) and reads the raw stream here.
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = { getRawBody };
