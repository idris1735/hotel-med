// Shared checkout logic for every booking form on the site (homepage's
// inline widget, the dedicated reservation page, and each room page's own
// form). One module so the Paystack flow only has to be written once and
// stays identical everywhere. Field ids vary slightly page to page — this
// reads whichever ones exist rather than assuming one fixed layout.
(function () {
  'use strict';

  const ROOM_SLUG_BY_NAME = {
    '2 Bedroom Deluxe Suite': 'suite-2bed',
    '1 Bedroom Deluxe Suite': 'suite-1bed',
    'Medallion Deluxe Comfort': 'comfort',
    'Medallion Deluxe Executive': 'executive',
    'Double Bed Deluxe Executive': 'executive-double',
  };

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
        max-width: 420px; width: 100%; background: #12121a; border: 1px solid rgba(245,240,232,0.12);
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
      .checkout-close:hover { background: #c9a227; color: #0a0a0f; }

      /* ---------------- QUICK BOOK ---------------- */
      .quickbook-fab {
        position: fixed; right: 1.4rem; bottom: calc(1.4rem + env(safe-area-inset-bottom)); z-index: 9000;
        display: inline-flex; align-items: center; gap: 0.5em;
        background: #c9a227; color: #0a0a0f; border: none; border-radius: 999px;
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
        background: #12121a; border: 1px solid rgba(245,240,232,0.12);
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
      .quickbook-field select option { background: #12121a; color: #f5f0e8; }
      .quickbook-submit {
        width: 100%; margin-top: 0.6rem; padding: 0.9em; background: #c9a227; color: #0a0a0f;
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

  const QUICKBOOK_ROOM_NAMES = Object.keys(ROOM_SLUG_BY_NAME);

  function injectQuickBook() {
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

    // Unlike showConfirmation/showError, nothing user-typed is interpolated
    // into this innerHTML -- QUICKBOOK_ROOM_NAMES is our own hardcoded
    // constant and todayIso is system-generated. Form values the guest
    // types are set natively by the browser into the inputs afterward,
    // never re-serialized back into HTML here. If a future edit adds any
    // interpolated value sourced from user input, route it through
    // escapeHtml() first, same as the confirmation panel does.
    const overlay = document.createElement('div');
    overlay.className = 'quickbook-overlay';
    overlay.id = 'quickbookOverlay';
    const todayIso = new Date().toISOString().slice(0, 10);
    overlay.innerHTML = `
      <div class="quickbook-panel">
        <button type="button" class="quickbook-close-x" aria-label="Close">&times;</button>
        <h3>Quick Booking</h3>
        <p class="sub">Room, dates, and your details — that's it.</p>
        <form id="quickBookForm">
          <div class="quickbook-field">
            <label for="qbRoomType">Room</label>
            <select id="qbRoomType">
              ${QUICKBOOK_ROOM_NAMES.map((n) => `<option>${n}</option>`).join('')}
            </select>
          </div>
          <div class="quickbook-row">
            <div class="quickbook-field">
              <label for="qbArrival">Arrival</label>
              <input type="date" id="qbArrival" min="${todayIso}" required>
            </div>
            <div class="quickbook-field">
              <label for="qbDeparture">Departure</label>
              <input type="date" id="qbDeparture" min="${todayIso}" required>
            </div>
          </div>
          <div class="quickbook-field">
            <label for="qbGuests">Guests</label>
            <input type="number" id="qbGuests" min="1" max="10" value="2" required>
          </div>
          <div class="quickbook-field">
            <label for="qbFullName">Full name</label>
            <input type="text" id="qbFullName" autocomplete="name" required>
          </div>
          <div class="quickbook-row">
            <div class="quickbook-field">
              <label for="qbEmail">Email</label>
              <input type="email" id="qbEmail" autocomplete="email" required>
            </div>
            <div class="quickbook-field">
              <label for="qbPhone">Phone</label>
              <input type="tel" id="qbPhone" autocomplete="tel" required>
            </div>
          </div>
          <button type="submit" class="quickbook-submit">Reserve &amp; Pay</button>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    // If this page already has its own room form with a room pre-selected
    // (every room-*.html page does), default the quick-book form to match
    // rather than always starting at the first option in the list.
    const pageRoomSelect = document.querySelector('#roomType');
    if (pageRoomSelect && pageRoomSelect.value) {
      const qbRoomSelect = overlay.querySelector('#qbRoomType');
      if (qbRoomSelect && QUICKBOOK_ROOM_NAMES.includes(pageRoomSelect.value)) {
        qbRoomSelect.value = pageRoomSelect.value;
      }
    }

    function showQuickBook() { overlay.classList.add('show'); }
    function hideQuickBook() { overlay.classList.remove('show'); }

    fab.addEventListener('click', showQuickBook);
    overlay.querySelector('.quickbook-close-x').addEventListener('click', hideQuickBook);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hideQuickBook(); });

    initForm('quickBookForm');
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

  // Standalone version of the Paystack-popup step inside handleSubmit below,
  // extracted so Vesper (assets/vesper.js) can hand off to the exact same
  // payment flow after her create_booking tool creates a pending row --
  // there is only one place in the whole site that ever opens PaystackPop.
  // `onSettled` (optional) fires after success/cancel/error, for a caller
  // like the chat widget that needs to re-enable its own UI.
  function openPaystackForBooking(bookingData, guestEmail, onSettled, onPaid) {
    const settle = typeof onSettled === 'function' ? onSettled : () => {};
    const paid = typeof onPaid === 'function' ? onPaid : () => {};
    if (!bookingData || !bookingData.publicKey) {
      showError(
        'Online payment isn’t connected yet — please email info@hotelmedallion.com or call 09060006382 to complete your booking.'
      );
      settle();
      return;
    }
    if (typeof PaystackPop === 'undefined') {
      showError('Payment could not load. Please check your connection and try again.');
      settle();
      return;
    }
    const popup = new PaystackPop();
    popup.newTransaction({
      key: bookingData.publicKey,
      email: guestEmail,
      amount: bookingData.amountSubunit,
      currency: bookingData.currency,
      ref: bookingData.reference,
      onSuccess: async () => {
        try {
          const verifyResp = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(bookingData.reference)}`);
          const verifyData = await verifyResp.json();
          if (verifyResp.ok && verifyData.status === 'paid') {
            showConfirmation(verifyData, guestEmail);
            paid();
          } else {
            showError(`Payment received but not yet confirmed — we’ll email you shortly. Reference: ${bookingData.reference}`);
          }
        } catch (err) {
          showError(`Payment received — confirmation is pending. Reference: ${bookingData.reference}`);
        } finally {
          settle();
        }
      },
      onCancel: settle,
      onError: (error) => {
        showError((error && error.message) || 'Payment failed to process. Please try again.');
        settle();
      },
    });
  }

  function fieldValue(form, ids) {
    for (const id of ids) {
      const el = form.querySelector('#' + id);
      if (el) return el.value;
    }
    return '';
  }

  async function handleSubmit(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing…';
    }
    const reset = () => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    };

    try {
      // 'qb*' ids belong to the floating quick-book form injected by this
      // same script (see injectQuickBook) -- unique ids so it never
      // collides with whatever booking form already exists on the page.
      const roomTypeName = fieldValue(form, ['roomType', 'qbRoomType']);
      const roomType = ROOM_SLUG_BY_NAME[roomTypeName];
      // No currency field on a page defaults to NGN client-side too, so the
      // display matches what /api/bookings/create will also default to.
      const currency = fieldValue(form, ['currency']) || 'NGN';
      const checkIn = fieldValue(form, ['arrival', 'bookingArrival', 'qbArrival']);
      const checkOut = fieldValue(form, ['departure', 'bookingDeparture', 'qbDeparture']);
      const adults = fieldValue(form, ['adults', 'guests', 'qbGuests']) || '1';
      const children = fieldValue(form, ['children']) || '0';
      const guestName = fieldValue(form, ['fullName', 'qbFullName']);
      const guestEmail = fieldValue(form, ['email', 'qbEmail']);
      const guestPhone = fieldValue(form, ['phone', 'qbPhone']);
      const specialRequests = fieldValue(form, ['requests']);

      if (!roomType) throw new Error('Please choose a room type.');
      if (!checkIn || !checkOut) throw new Error('Please choose your arrival and departure dates.');
      if (!guestName || !guestEmail) throw new Error('Please enter your name and email.');

      const createResp = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomType, currency, checkIn, checkOut, adults, children,
          guestName, guestEmail, guestPhone, specialRequests,
        }),
      });
      const createData = await createResp.json();
      if (!createResp.ok) throw new Error(createData.error || 'Could not start your booking.');

      // Close the quick-book modal here specifically, not on every error --
      // validation failures above (missing name/email, booking-creation
      // failure) fire before this point and should leave the form open so
      // the guest can fix the problem without losing what they typed. Once
      // we've actually handed off to Paystack, the modal's job is done.
      hideQuickBookOverlay();
      openPaystackForBooking(createData, guestEmail, reset, () => form.reset());
    } catch (err) {
      showError(err.message || 'Something went wrong — please try again.');
      reset();
    }
  }

  function initForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmit(form);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initForm('bookingForm');
    initForm('reservationForm');
    injectQuickBook();
  });

  // Small public surface for assets/vesper.js -- the AI concierge creates
  // a pending booking via her own tool call, then hands off to this exact
  // same Paystack flow (and confirmation/error UI) rather than having any
  // separate payment code path.
  window.MedallionCheckout = { openPaystackForBooking, showConfirmation, showError, escapeHtml, formatAmount, formatDate };
})();
