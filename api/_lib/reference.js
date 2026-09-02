// This reference is functionally a bearer token: /api/paystack/verify looks
// up a booking by reference alone, with no other auth. Date.now() + Math.random()
// was both weak (Math.random is not a CSPRNG) and guessable (the timestamp
// prefix narrows the search space to whoever knows roughly when a booking
// was created) — an attacker could realistically enumerate references and
// pull other guests' booking details. crypto.randomBytes(16) gives 128 bits
// of real entropy, making that infeasible to brute-force.
const crypto = require('crypto');

function generateReference() {
  // Hex, not base64url: fixed-length, alphanumeric-only, and safely within
  // whatever character set Paystack's `reference` field accepts — no risk
  // of '-'/'_' either getting rejected or (if stripped) quietly shrinking
  // the entropy below what randomBytes(16) actually produced.
  const rand = crypto.randomBytes(16).toString('hex').toUpperCase();
  return `HM-${rand}`;
}

module.exports = { generateReference };
