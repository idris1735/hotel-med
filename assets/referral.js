// Affiliate referral tracking. Loaded on every page, same pattern as
// checkout.js/vesper.js. The first time someone arrives on a link like
// "/?ref=JANE482", stores that code in a cookie for 30 days (the
// attribution window from the affiliate program proposal) -- so if they
// close the tab and come back to book later, the referral still counts.
// A later visit with no "?ref=" param doesn't touch an existing cookie,
// so the original referrer keeps credit for the whole window.
(function () {
  'use strict';

  const COOKIE_NAME = 'medallion_ref';
  const COOKIE_DAYS = 30;

  function setCookie(name, value, days) {
    try {
      const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
    } catch (err) {
      // Cookies blocked (strict privacy mode, etc.) -- booking still works,
      // it just won't carry attribution. Not worth failing anything over.
    }
  }

  function getCookie(name) {
    try {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (err) {
      return null;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  // A real code is short and alphanumeric (see buildReferralCode in
  // api/_lib/affiliates.js) -- a basic shape check here is just to avoid
  // storing obvious garbage, not real validation (the booking endpoint
  // looks the code up server-side regardless and ignores anything that
  // doesn't match an approved affiliate).
  if (ref && /^[A-Za-z0-9]{3,20}$/.test(ref)) {
    setCookie(COOKIE_NAME, ref, COOKIE_DAYS);
  }

  // Exposed for checkout.js and Vesper to read when building a booking
  // request, so there's one place this cookie's name/shape is known.
  window.MedallionReferral = {
    getCode: function () { return getCookie(COOKIE_NAME); },
  };
})();
