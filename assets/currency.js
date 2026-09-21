// Live currency display for room prices -- NOT the payment currency picker
// already in each booking form (that one only ever offers NGN/USD, the two
// real, independently-fixed prices Paystack actually charges). This is a
// separate, browsing-only convenience: let a guest see roughly what a room
// costs in a currency they actually think in, computed from the room's real
// USD price times a live rate from /api/rates. The room's own real NGN and
// USD prices are always shown as an unconverted option in the same list, so
// switching currency here never invents a number that isn't grounded in an
// actual quoted price.
//
// Two controls, one shared state: a fixed top-right pill visible on every
// page regardless of scroll position (top-right is the one corner Quick
// Book/bottom-right and Vesper/bottom-left don't already occupy -- this is
// the "obvious, can't miss it" control), plus an inline selector right
// above the room prices themselves for anyone who's already looking at a
// price and wants to switch in place.
(function () {
  'use strict';

  const CURRENCIES = [
    { code: 'NGN', symbol: '₦', label: 'Nigerian Naira' },
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'GBP', symbol: '£', label: 'British Pound' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
  ];
  const STORAGE_KEY = 'medallion-display-currency';

  function injectStyles() {
    if (document.getElementById('currency-styles')) return;
    const style = document.createElement('style');
    style.id = 'currency-styles';
    style.textContent = `
      /* top, below the fixed nav bar's own height (which varies by ~2rem vs
         ~1.1rem padding depending on .scrolled) so this never overlaps the
         hamburger toggle or nav links sitting in that same top band. */
      .currency-toggle {
        position: fixed; top: 5.6rem; right: 1.4rem; z-index: 8500;
        display: flex; align-items: center; gap: 0.4em;
        background: rgba(10,10,15,0.72); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        border: 1px solid #c9a227; border-radius: 999px; padding: 0.5em 0.6em 0.5em 0.9em;
        font-family: 'Inter', system-ui, sans-serif; box-shadow: 0 6px 20px rgba(10,10,15,0.35);
        transition: opacity 0.3s, visibility 0.3s;
      }
      /* The fullscreen mobile nav menu vertically centers its link list, and
         with 9 links that list runs high enough to collide with this pill
         (confirmed by a real screenshot: "Rooms" rendered half-hidden behind
         the currency toggle). Hide it while that menu is open rather than
         try to out-position a list whose height varies by page. */
      body.menu-locked .currency-toggle { opacity: 0; visibility: hidden; pointer-events: none; }
      .currency-toggle-icon { font-size: 0.85rem; line-height: 1; color: #c9a227; }
      .currency-toggle select {
        appearance: none; -webkit-appearance: none; background: none; border: none;
        color: #f5f0e8; font-size: 0.74rem; font-weight: 600; letter-spacing: 0.04em;
        padding-right: 1.1em; outline: none; cursor: pointer; font-family: 'Inter', system-ui, sans-serif;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='6' viewBox='0 0 8 6'%3E%3Cpath d='M0 0L4 6L8 0Z' fill='%23c9a227'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right center; background-size: 8px 6px;
      }
      .currency-toggle select option { background: #0a1728; color: #f5f0e8; }
      @media (max-width: 640px) {
        .currency-toggle { top: 4.6rem; right: 1rem; padding: 0.45em 0.55em 0.45em 0.75em; }
        .currency-toggle select { font-size: 0.68rem; }
      }

      .currency-bar {
        display: flex; align-items: center; gap: 0.8rem; justify-content: center;
        margin: 0 0 1rem; font-family: 'Inter', system-ui, sans-serif;
        background: rgba(201,162,39,0.08); border: 1px solid rgba(201,162,39,0.35);
        border-radius: 999px; padding: 0.6em 1.1em; width: fit-content;
      }
      /* Confirms to the guest that picking a currency actually changed the
         price on screen -- a quick gold flash, not just a silent DOM update
         that's easy to miss or mistake for nothing having happened. */
      @keyframes price-flash-anim {
        0% { color: #c9a227; }
        100% { color: inherit; }
      }
      .price-flash { animation: price-flash-anim 0.7s ease-out; }
      @media (prefers-reduced-motion: reduce) { .price-flash { animation: none; } }
      .currency-bar-icon { color: #c9a227; font-size: 0.9rem; }
      .currency-bar label {
        font-size: 0.64rem; letter-spacing: 0.14em; text-transform: uppercase;
        color: #c9a227; font-weight: 600;
      }
      .currency-bar select {
        background: rgba(245,240,232,0.08); border: 1px solid rgba(201,162,39,0.5);
        color: #f5f0e8; padding: 0.4em 0.85em; font-size: 0.8rem; font-weight: 600; border-radius: 999px;
        outline: none; cursor: pointer; font-family: 'Inter', system-ui, sans-serif;
      }
      .currency-bar select:focus { border-color: #c9a227; }
      .currency-bar select option { background: #0a1728; color: #f5f0e8; }
      .currency-note {
        font-size: 0.66rem; color: rgba(245,240,232,0.4); text-align: center;
        margin: 0 0 2rem; font-family: 'Inter', system-ui, sans-serif;
      }
      /* Room detail pages sit on a light (--ivory) background, not the dark
         one the homepage cards live on -- same control, legible either way. */
      .room-price-section .currency-bar { background: rgba(201,162,39,0.1); border-color: rgba(201,162,39,0.4); }
      .room-price-section .currency-bar select { background: rgba(10,10,15,0.04); border-color: rgba(201,162,39,0.5); color: rgba(10,10,15,0.8); }
      .room-price-section .currency-note { color: rgba(10,10,15,0.45); }
    `;
    document.head.appendChild(style);
  }

  function formatAmount(amount, code) {
    const c = CURRENCIES.find((x) => x.code === code);
    const rounded = Math.round(amount);
    const formatted = rounded.toLocaleString(code === 'NGN' ? 'en-NG' : 'en-US');
    return (c ? c.symbol : '') + formatted;
  }

  function currencyOptions(current) {
    return CURRENCIES.map((c) => `<option value="${c.code}"${c.code === current ? ' selected' : ''}>${c.code} — ${c.label}</option>`).join('');
  }

  // Applies `currency` to every priced element on the page using `rates`
  // (USD-based: rates[code] is "1 USD = rates[code] units of code").
  //
  // Real bug this fixes: picking GBP/EUR before the async rates fetch had
  // resolved used to silently fall back to re-showing the exact same NGN
  // price that was already on screen -- nothing visibly changed, which is
  // exactly what "feels numb, is that even a currency converter" describes.
  // Now that case shows an explicit "Converting..." state instead, so
  // switching currency always visibly does something the instant you touch
  // it, even before the real number is ready.
  function applyCurrency(currency, rates) {
    document.querySelectorAll('.room-price[data-usd]').forEach((el) => {
      const usd = Number(el.dataset.usd);
      const ngn = Number(el.dataset.ngn);
      const perNight = el.querySelector('small:first-of-type');
      const suffixLabel = perNight ? perNight.textContent : 'per night';

      let mainText;
      let subText = '';
      if (currency === 'NGN') {
        mainText = formatAmount(ngn, 'NGN');
        subText = `~${formatAmount(usd, 'USD')}`;
      } else if (currency === 'USD') {
        mainText = formatAmount(usd, 'USD');
        subText = `~${formatAmount(ngn, 'NGN')}`;
      } else if (rates && rates[currency]) {
        const converted = usd * rates[currency];
        mainText = formatAmount(converted, currency);
        subText = `${formatAmount(ngn, 'NGN')} / ~${formatAmount(usd, 'USD')} at checkout`;
      } else {
        mainText = 'Converting…';
        subText = `from ${formatAmount(ngn, 'NGN')}`;
      }

      el.innerHTML = `${mainText} <small>${suffixLabel}</small> <small>(${subText})</small>`;
      // A brief flash makes the update undeniable -- confirms to the guest
      // that choosing a currency actually did something, not just a UI
      // element that might or might not be wired up.
      el.classList.remove('price-flash');
      void el.offsetWidth; // restart the CSS animation on repeat clicks
      el.classList.add('price-flash');
    });
  }

  async function fetchRates() {
    try {
      const resp = await fetch('/api/rates');
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.rates || null;
    } catch (err) {
      return null;
    }
  }

  // Kicked off immediately at script-load time, not inside init() on
  // DOMContentLoaded -- a plain network call has no DOM dependency, so
  // there's no reason to make it wait. By the time a guest actually finds
  // and clicks the currency control, this has very likely already resolved,
  // which is what makes the "Converting..." fallback state rare in practice
  // rather than something most people ever see.
  const ratesPromise = fetchRates();

  function init() {
    injectStyles();

    let saved = 'NGN';
    try {
      saved = localStorage.getItem(STORAGE_KEY) || 'NGN';
    } catch (err) {
      // Private browsing / storage blocked -- default to NGN, no crash.
    }
    if (!CURRENCIES.some((c) => c.code === saved)) saved = 'NGN';

    let rates = null;
    let currentCurrency = saved;
    const selects = [];

    function setCurrency(value) {
      currentCurrency = value;
      try { localStorage.setItem(STORAGE_KEY, value); } catch (err) {}
      selects.forEach((s) => { if (s.value !== value) s.value = value; });
      applyCurrency(currentCurrency, rates);
    }

    // Always-visible fixed toggle -- present on every page (not just ones
    // with room prices) so a guest's chosen currency carries with them as
    // they browse, and so the control itself is never something you have
    // to go looking for.
    const toggle = document.createElement('div');
    toggle.className = 'currency-toggle';
    toggle.innerHTML = `
      <span class="currency-toggle-icon" aria-hidden="true">&#x1F4B1;</span>
      <label class="sr-only" for="currencyToggleSelect" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);">Display currency</label>
      <select id="currencyToggleSelect">${currencyOptions(saved)}</select>
    `;
    document.body.appendChild(toggle);
    const toggleSelect = toggle.querySelector('select');
    selects.push(toggleSelect);
    toggleSelect.addEventListener('change', (e) => setCurrency(e.target.value));

    // Inline bar near the actual prices, for anyone already looking at
    // one who wants to switch without reaching for the corner control.
    const priceEls = document.querySelectorAll('.room-price[data-usd]');
    if (priceEls.length > 0) {
      const roomsWrapper = document.getElementById('roomsWrapper');
      const insertBefore = roomsWrapper || priceEls[0];

      const bar = document.createElement('div');
      bar.className = 'currency-bar';
      bar.innerHTML = `
        <span class="currency-bar-icon" aria-hidden="true">&#x1F4B1;</span>
        <label for="currencyInlineSelect">Show prices in</label>
        <select id="currencyInlineSelect">${currencyOptions(saved)}</select>
      `;
      const inlineSelect = bar.querySelector('select');
      selects.push(inlineSelect);
      inlineSelect.addEventListener('change', (e) => setCurrency(e.target.value));

      if (insertBefore && insertBefore.parentElement) {
        insertBefore.parentElement.insertBefore(bar, insertBefore);
      }

      const note = document.createElement('div');
      note.className = 'currency-note';
      note.textContent = 'Converted prices are estimates from live exchange rates. You always pay the exact ₦ or $ amount shown at checkout.';
      bar.after(note);
    }

    // Show the real, unconverted price immediately -- don't make the guest
    // wait on a network round-trip to see any price at all.
    applyCurrency(currentCurrency, null);

    ratesPromise.then((r) => {
      rates = r;
      if (rates) applyCurrency(currentCurrency, rates);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
