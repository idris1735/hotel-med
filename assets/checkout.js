// Shared handoff for every booking form on the marketing site. Hotel OS is
// the only source of live availability, prices and reservation records.
(function () {
  'use strict';

  const LIVE_BOOKING_URL = 'https://app.hotelmedallion.com/book/medallion';
  const REFERRAL_KEY = 'medallion.referral.v1';
  function referralCode() {
    const current = new URL(window.location.href || 'https://hotelmedallion.com/').searchParams.get('ref');
    const code = current && current.trim().toUpperCase();
    try {
      if (code && /^[A-Z0-9_-]{3,24}$/.test(code)) {
        window.sessionStorage.setItem(REFERRAL_KEY, JSON.stringify({ code, at: Date.now() })); return code;
      }
      const saved = JSON.parse(window.sessionStorage.getItem(REFERRAL_KEY) || 'null');
      if (saved && /^[A-Z0-9_-]{3,24}$/.test(saved.code) && Date.now() - saved.at < 86400000) return saved.code;
    } catch (_) { /* Private browsing may disable storage; direct links still work. */ }
    return code && /^[A-Z0-9_-]{3,24}$/.test(code) ? code : '';
  }
  // Capture on arrival, before a guest navigates from the home page to a room.
  referralCode();

  // guestEmail/guestName/specialRequests are user-typed, round-trip through
  // our own DB, and get interpolated into innerHTML below — escape anything
  // that isn't a value we generated ourselves (dates, amounts, references)
  // before it touches the DOM.
  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function formatAmount(amountSubunit, currency) {
    const major = Math.round(amountSubunit / 100);
    if (currency === 'USD') return '$' + major.toLocaleString('en-US');
    return '₦' + major.toLocaleString('en-NG');
  }

  // checkIn/checkOut arrive here as a full ISO datetime string (the server
  // sends a Date object, which JSON serializes via toISOString()) --
  // appending another "T00:00:00" onto that (the previous approach)
  // produced an invalid double-suffixed string that silently rendered as
  // "Invalid Date". Passing the value straight into `new Date()` parses it
  // correctly with no assumptions about its exact shape.
  function formatDate(value) {
    const d = new Date(value);
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function injectStyles() {
    if (document.getElementById('checkout-styles')) return;
    const style = document.createElement('style');
    style.id = 'checkout-styles';
    style.textContent = `
      .checkout-overlay {
        position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center;
        justify-content: center; padding: 2rem; background: rgba(10,10,15,0.72);
        padding-bottom: calc(2rem + env(safe-area-inset-bottom));
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        opacity: 0; pointer-events: none; transition: opacity 0.4s;
      }
      .checkout-overlay.show { opacity: 1; pointer-events: auto; }
      .checkout-panel {
        max-width: 420px; width: 100%; background: #10233d; border: 1px solid rgba(245,240,232,0.12);
        padding: 3rem 2.4rem; text-align: center; transform: translateY(14px); transition: transform 0.4s;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .checkout-overlay.show .checkout-panel { transform: translateY(0); }
      .checkout-panel .mark {
        font-family: 'Cormorant Garamond', Georgia, serif; font-size: 2.6rem; color: #c9a227; line-height: 1;
        margin-bottom: 1.2rem;
      }
      .checkout-panel .mark img { width: 46px; height: 46px; display: block; margin: 0 auto; }
      .checkout-panel h3 {
        font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; font-size: 1.7rem;
        color: #f5f0e8; margin: 0 0 0.8rem;
      }
      .checkout-panel p { font-size: 0.85rem; color: rgba(245,240,232,0.65); line-height: 1.7; margin: 0 0 0.4rem; }
      .checkout-panel .ref { font-size: 0.7rem; letter-spacing: 0.1em; color: rgba(245,240,232,0.4); margin-top: 1.2rem; }
      .checkout-panel.is-error .mark { color: #d97757; }
      .checkout-close {
        margin-top: 2rem; padding: 0.8em 2em; background: transparent; border: 1px solid #c9a227;
        color: #c9a227; font-size: 0.68rem; letter-spacing: 0.18em; text-transform: uppercase;
        cursor: pointer; transition: background 0.3s, color 0.3s;
      }
      .checkout-close:hover { background: #c9a227; color: #090c14; }

      /* ---------------- QUICK BOOK ---------------- */
      .quickbook-fab {
        position: fixed; right: 1.4rem; bottom: calc(1.4rem + env(safe-area-inset-bottom)); z-index: 9000;
        display: inline-flex; align-items: center; gap: 0.5em;
        background: #c9a227; color: #090c14; border: none; border-radius: 999px;
        padding: 0.85em 1.4em; font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
        box-shadow: 0 8px 24px rgba(10,10,15,0.35); cursor: pointer;
        transition: transform 0.3s, box-shadow 0.3s;
      }
      .quickbook-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(10,10,15,0.4); }
      .quickbook-fab svg { width: 15px; height: 15px; flex: none; }
      @media (max-width: 640px) {
        .quickbook-fab {
          right: 1rem; bottom: calc(1rem + env(safe-area-inset-bottom));
          padding: 0.8em 1.1em; font-size: 0.68rem;
        }
      }
      .quickbook-overlay {
        position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center;
        justify-content: center; padding: 1.5rem; background: rgba(10,10,15,0.72);
        padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        opacity: 0; pointer-events: none; transition: opacity 0.4s;
      }
      .quickbook-overlay.show { opacity: 1; pointer-events: auto; }
      .quickbook-panel {
        max-width: 400px; width: 100%; max-height: 90vh; overflow-y: auto;
        background: #10233d; border: 1px solid rgba(245,240,232,0.12);
        padding: 2.4rem 2rem; transform: translateY(14px); transition: transform 0.4s;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .quickbook-overlay.show .quickbook-panel { transform: translateY(0); }
      .quickbook-panel h3 {
        font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; font-size: 1.6rem;
        color: #f5f0e8; margin: 0 0 0.3rem; text-align: center;
      }
      .quickbook-panel .sub {
        font-size: 0.78rem; color: rgba(245,240,232,0.55); text-align: center; margin: 0 0 1.6rem;
      }
      .quickbook-field { margin-bottom: 1.1rem; }
      .quickbook-field label {
        display: block; font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase;
        color: rgba(245,240,232,0.45); margin-bottom: 0.5rem;
      }
      .quickbook-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
      .quickbook-field input, .quickbook-field select {
        width: 100%; background: rgba(245,240,232,0.05); border: 1px solid rgba(245,240,232,0.16);
        color: #f5f0e8; padding: 0.7em 0.8em; font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.85rem; border-radius: 3px; outline: none; transition: border-color 0.3s;
      }
      /* Prevents iOS Safari's zoom-on-focus (triggered by any input under
         16px) -- particularly disruptive here since this form has six
         fields a guest taps through in sequence. */
      @media (max-width: 640px) {
        .quickbook-field input, .quickbook-field select { font-size: 16px; }
      }
      .quickbook-field input:focus, .quickbook-field select:focus { border-color: #c9a227; }
      .quickbook-field select option { background: #10233d; color: #f5f0e8; }
      .quickbook-submit {
        width: 100%; margin-top: 0.6rem; padding: 0.9em; background: #c9a227; color: #090c14;
        border: none; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
        cursor: pointer; transition: background 0.3s;
      }
      .quickbook-submit:hover { background: #f5f0e8; }
      .quickbook-submit:disabled { opacity: 0.6; cursor: default; }
      .quickbook-close-x {
        position: absolute; top: 0.8rem; right: 0.8rem; background: none; border: none;
        color: rgba(245,240,232,0.5); font-size: 1.2rem; line-height: 1; cursor: pointer;
        padding: 0.5em; /* ~40px tap target */
      }
      .quickbook-close-x:hover { color: #f5f0e8; }
    `;
    document.head.appendChild(style);
  }

  function injectQuickBook() {
    if (document.querySelector('.quickbook-fab')) return;
    injectStyles();

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'quickbook-fab';
    fab.setAttribute('aria-label', 'Quick book a room');
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      Book Now
    `;
    document.body.appendChild(fab);

    fab.addEventListener('click', () => openWebsiteBooking(bookingPortalUrl(null)));
  }

  function buildOverlay() {
    let overlay = document.getElementById('checkoutOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'checkout-overlay';
    overlay.id = 'checkoutOverlay';
    overlay.innerHTML = '<div class="checkout-panel" id="checkoutPanel"></div>';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideOverlay();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function hideOverlay() {
    const overlay = document.getElementById('checkoutOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  // If the submission came from the floating quick-book modal, close it
  // before showing the result — otherwise the confirmation/error panel
  // appears stacked on top of a still-open booking form, which reads as
  // broken even though nothing actually failed.
  function hideQuickBookOverlay() {
    const overlay = document.getElementById('quickbookOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  // guestEmail comes from the form the guest just submitted, not from the
  // server response — /api/paystack/verify deliberately doesn't echo PII
  // back for a reference-only, unauthenticated lookup (see that file).
  function showConfirmation(booking, guestEmail) {
    injectStyles();
    hideQuickBookOverlay();
    const overlay = buildOverlay();
    const panel = overlay.querySelector('#checkoutPanel');
    panel.className = 'checkout-panel';
    panel.innerHTML = `
      <div class="mark"><img src="assets/logo-icon.png" alt=""></div>
      <h3>Reservation Confirmed</h3>
      <p>${escapeHtml(booking.roomName || 'Your room')} — ${formatDate(booking.checkIn)} to ${formatDate(booking.checkOut)}</p>
      <p>${formatAmount(booking.amountSubunit, booking.currency)} paid. A confirmation has been sent to ${escapeHtml(guestEmail || 'your email')}.</p>
      <p class="ref">Reference: ${escapeHtml(booking.reference)}</p>
      <button type="button" class="checkout-close">Close</button>
    `;
    panel.querySelector('.checkout-close').addEventListener('click', hideOverlay);
    overlay.classList.add('show');
  }

  function showError(message) {
    injectStyles();
    const overlay = buildOverlay();
    const panel = overlay.querySelector('#checkoutPanel');
    panel.className = 'checkout-panel is-error';
    panel.innerHTML = `
      <div class="mark">!</div>
      <h3>Something Went Wrong</h3>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="checkout-close">Close</button>
    `;
    panel.querySelector('.checkout-close').addEventListener('click', hideOverlay);
    overlay.classList.add('show');
  }

  function isoDateFromToday(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isoDateAfter(value, days) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function bookingPortalUrl(form, preferredRoom) {
    const url = new URL(LIVE_BOOKING_URL);
    const arrival = fieldValue(form, ['arrival', 'bookingArrival', 'qbArrival']) || isoDateFromToday(1);
    const values = {
      arrival,
      departure: fieldValue(form, ['departure', 'bookingDeparture', 'qbDeparture']) || isoDateAfter(arrival, 1),
      adults: fieldValue(form, ['adults', 'guests', 'qbGuests']) || '2',
      children: fieldValue(form, ['children']) || '0',
      room: preferredRoom || fieldValue(form, ['roomType']),
      ref: referralCode(),
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    return url.toString();
  }

  function openWebsiteBooking(destination) {
    hideQuickBookOverlay();
    if (window.MedallionBooking) {
      window.MedallionBooking.open(Object.fromEntries(new URL(destination).searchParams));
    } else {
      // The booking destination still works if the live-price script fails to load.
      const requested = new URL(destination);
      const target = new URL(LIVE_BOOKING_URL);
      for (const key of ['room', 'arrival', 'departure', 'adults', 'children', 'ref']) {
        const value = requested.searchParams.get(key);
        if (value !== null) target.searchParams.set(key, value);
      }
      window.location.assign(target.toString());
    }
  }

  // Legacy Vesper callers use the same app booking destination.
  function openPaystackForBooking(bookingData, guestEmail, onSettled, onPaid) {
    const destination = bookingData && bookingData.bookingUrl
      ? bookingData.bookingUrl
      : LIVE_BOOKING_URL;
    const tracked = new URL(destination);
    const referral = referralCode();
    if (tracked.origin === 'https://app.hotelmedallion.com' && referral) tracked.searchParams.set('ref', referral);
    openWebsiteBooking(tracked.toString());
  }

  function fieldValue(form, ids) {
    if (!form) return '';
    for (const id of ids) {
      const el = form.querySelector('#' + id);
      if (el) return el.value;
    }
    return '';
  }

  function handleSubmit(form) {
    openWebsiteBooking(bookingPortalUrl(form));
  }

  function initForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.noValidate = true;
    const keep = new Set(['arrival', 'bookingArrival', 'qbArrival', 'departure', 'bookingDeparture', 'qbDeparture', 'adults', 'guests', 'qbGuests', 'children']);
    form.querySelectorAll('input, select, textarea').forEach((control) => {
      if (keep.has(control.id)) return;
      control.disabled = true;
      const field = control.closest('.booking-field, .res-field');
      if (field) field.hidden = true;
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmit(form);
    });
  }

  function initDirectBookingLinks() {
    document.querySelectorAll('[data-live-booking], [data-book-room]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        openWebsiteBooking(bookingPortalUrl(null, link.dataset.bookRoom || ''));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initForm('bookingForm');
    initForm('reservationForm');
    initForm('quickBookForm');
    initDirectBookingLinks();
    injectQuickBook();
  });

  // Small public surface for assets/vesper.js. The historical function name
  // is retained for compatibility; it opens the website's booking form.
  window.MedallionCheckout = { openPaystackForBooking, showConfirmation, showError, escapeHtml, formatAmount, formatDate, referralCode };
})();
