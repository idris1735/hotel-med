// GET /api/rates -- live exchange rates, for DISPLAY purposes only.
//
// The hotel is actually paid in NGN or USD, at the two independent FIXED
// prices in api/_lib/rooms.js -- deliberately never derived from a live
// rate, so a guest paying in USD or NGN always pays exactly the quoted
// amount regardless of what FX markets do that day (see the comment at the
// top of rooms.js). This endpoint exists purely so a browsing guest can see
// roughly what a room costs in a currency they actually think in (GBP, EUR,
// ...); the real checkout amount is always fixed NGN or USD, and the
// frontend is responsible for making that distinction clear rather than
// implying these converted figures are what gets charged.
//
// Source: open.er-api.com -- free, no API key, ~166 currencies (confirmed
// NGN/GBP/EUR are covered by testing, not assumed), rates refresh roughly
// daily. Cached at the edge for an hour so ordinary traffic never re-hits
// the upstream API, and this endpoint stays fast either way.
const DISPLAY_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR'];

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await resp.json();
    if (json.result !== 'success' || !json.rates) {
      throw new Error('upstream response missing rates');
    }
    const rates = {};
    for (const code of DISPLAY_CURRENCIES) {
      if (typeof json.rates[code] === 'number') rates[code] = json.rates[code];
    }
    // Edge-cached (s-maxage) so repeat visits don't each hit the upstream
    // API; stale-while-revalidate keeps serving a slightly-old cached
    // response instantly while a fresh one is fetched in the background,
    // rather than ever making a guest wait on this specific call.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ base: 'USD', rates, updatedAt: json.time_last_update_utc || null });
  } catch (err) {
    console.error('rates fetch failed', err);
    return res.status(502).json({ error: 'Could not fetch live rates' });
  }
};
