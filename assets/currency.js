// Live currency display for room prices -- NOT the payment currency picker
// already in each booking form (that one only ever offers NGN/USD, the two
// real, independently-fixed prices Paystack actually charges). This is a
// separate, browsing-only convenience: let a guest see roughly what a room
// costs in a currency they actually think in, computed from the room's real
// USD price times a live rate from /api/rates. The room's own real NGN and
// USD prices are always shown as an unconverted option in the same list, so
// switching currency here never invents a number that isn't grounded in an
// actual quoted price.
(function () {
  'use strict';

  const CURRENCIES = [
    { code: 'NGN', symbol: '₦', label: 'NGN — Naira' },
    { code: 'USD', symbol: '$', label: 'USD — US Dollar' },
    { code: 'GBP', symbol: '£', label: 'GBP — British Pound' },
    { code: 'EUR', symbol: '€', label: 'EUR — Euro' },
  ];
  const STORAGE_KEY = 'medallion-display-currency';

  function injectStyles() {
    if (document.getElementById('currency-styles')) return;
    const style = document.createElement('style');
    style.id = 'currency-styles';
    style.textContent = `
      .currency-bar {
        display: flex; align-items: center; gap: 0.7rem; justify-content: center;
        margin: 0 0 2.4rem; font-family: 'Inter', system-ui, sans-serif;
      }
      .currency-bar label {
        font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase;
        color: rgba(245,240,232,0.45);
      }
      .currency-bar select {
        background: rgba(245,240,232,0.06); border: 1px solid rgba(245,240,232,0.2);
        color: #f5f0e8; padding: 0.45em 0.9em; font-size: 0.78rem; border-radius: 999px;
        outline: none; cursor: pointer; font-family: 'Inter', system-ui, sans-serif;
      }
      .currency-bar select:focus { border-color: #c9a227; }
      .currency-bar select option { background: #0a1728; color: #f5f0e8; }
      .currency-note {
        font-size: 0.66rem; color: rgba(245,240,232,0.35); text-align: center;
        margin: -1.6rem 0 2rem; font-family: 'Inter', system-ui, sans-serif;
      }
      /* Room detail pages sit on a light (--ivory) background, not the dark
         one the homepage cards live on -- same control, legible either way. */
      .room-price-section .currency-bar select,
      .room-price-section .currency-bar label { color: rgba(10,10,15,0.55); }
      .room-price-section .currency-bar select { background: rgba(10,10,15,0.04); border-color: rgba(10,10,15,0.18); color: rgba(10,10,15,0.8); }
      .room-price-section .currency-note { color: rgba(10,10,15,0.4); }
    `;
    document.head.appendChild(style);
  }

  function formatAmount(amount, code) {
    const c = CURRENCIES.find((x) => x.code === code);
    const rounded = Math.round(amount);
    const formatted = rounded.toLocaleString(code === 'NGN' ? 'en-NG' : 'en-US');
    return (c ? c.symbol : '') + formatted;
  }

  // Applies `currency` to every priced element on the page using `rates`
  // (USD-based: rates[code] is "1 USD = rates[code] units of code"). Falls
  // back to each element's own real NGN price untouched if rates aren't
  // available yet, rather than showing nothing.
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
        // Rates not loaded (still fetching, or the upstream call failed) --
        // show the real NGN price rather than a broken or stale figure.
        mainText = formatAmount(ngn, 'NGN');
        subText = `~${formatAmount(usd, 'USD')}`;
      }

      el.innerHTML = `${mainText} <small>${suffixLabel}</small> <small>(${subText})</small>`;
    });
  }

  function buildSelector(current, onChange) {
    const bar = document.createElement('div');
    bar.className = 'currency-bar';
    bar.innerHTML = `
      <label for="currencyDisplaySelect">Show prices in</label>
      <select id="currencyDisplaySelect">
        ${CURRENCIES.map((c) => `<option value="${c.code}"${c.code === current ? ' selected' : ''}>${c.label}</option>`).join('')}
      </select>
    `;
    bar.querySelector('select').addEventListener('change', (e) => onChange(e.target.value));
    return bar;
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

  function init() {
    const priceEls = document.querySelectorAll('.room-price[data-usd]');
    if (priceEls.length === 0) return;

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

    const roomsWrapper = document.getElementById('roomsWrapper');
    const anchor = roomsWrapper
      ? roomsWrapper.parentElement
      : (priceEls[0].closest('.room-price-inner, .room-detail, section') || priceEls[0].parentElement);
    const insertBefore = roomsWrapper || priceEls[0];

    const bar = buildSelector(saved, (value) => {
      currentCurrency = value;
      try { localStorage.setItem(STORAGE_KEY, value); } catch (err) {}
      applyCurrency(currentCurrency, rates);
    });
    if (insertBefore && insertBefore.parentElement) {
      insertBefore.parentElement.insertBefore(bar, insertBefore);
    }

    const note = document.createElement('div');
    note.className = 'currency-note';
    note.textContent = 'Converted prices are estimates from live exchange rates. You always pay the exact ₦ or $ amount shown at checkout.';
    bar.after(note);

    // Show the real, unconverted price immediately -- don't make the guest
    // wait on a network round-trip to see any price at all.
    applyCurrency(currentCurrency, null);

    fetchRates().then((r) => {
      rates = r;
      if (rates) applyCurrency(currentCurrency, rates);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
