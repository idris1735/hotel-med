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

  function formatDate(isoDate) {
    const d = new Date(`${isoDate}T00:00:00`);
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
    `;
    document.head.appendChild(style);
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

  // guestEmail comes from the form the guest just submitted, not from the
  // server response — /api/paystack/verify deliberately doesn't echo PII
  // back for a reference-only, unauthenticated lookup (see that file).
  function showConfirmation(booking, guestEmail) {
    injectStyles();
    const overlay = buildOverlay();
    const panel = overlay.querySelector('#checkoutPanel');
    panel.className = 'checkout-panel';
    panel.innerHTML = `
      <div class="mark">M</div>
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
      const roomTypeName = fieldValue(form, ['roomType']);
      const roomType = ROOM_SLUG_BY_NAME[roomTypeName];
      // No currency field on a page defaults to NGN client-side too, so the
      // display matches what /api/bookings/create will also default to.
      const currency = fieldValue(form, ['currency']) || 'NGN';
      const checkIn = fieldValue(form, ['arrival', 'bookingArrival']);
      const checkOut = fieldValue(form, ['departure', 'bookingDeparture']);
      const adults = fieldValue(form, ['adults', 'guests']) || '1';
      const children = fieldValue(form, ['children']) || '0';
      const guestName = fieldValue(form, ['fullName']);
      const guestEmail = fieldValue(form, ['email']);
      const guestPhone = fieldValue(form, ['phone']);
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

      if (!createData.publicKey) {
        throw new Error(
          'Online payment isn’t connected yet — please email reservation@medallionhospitalityservices.com or call 09060006382 to complete your booking.'
        );
      }
      if (typeof PaystackPop === 'undefined') {
        throw new Error('Payment could not load. Please check your connection and try again.');
      }

      const popup = new PaystackPop();
      popup.newTransaction({
        key: createData.publicKey,
        email: guestEmail,
        amount: createData.amountSubunit,
        currency: createData.currency,
        ref: createData.reference,
        onSuccess: async () => {
          try {
            const verifyResp = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(createData.reference)}`);
            const verifyData = await verifyResp.json();
            if (verifyResp.ok && verifyData.status === 'paid') {
              showConfirmation(verifyData, guestEmail);
              form.reset();
            } else {
              showError(
                `Payment received but not yet confirmed — we’ll email you shortly. Reference: ${createData.reference}`
              );
            }
          } catch (err) {
            showError(`Payment received — confirmation is pending. Reference: ${createData.reference}`);
          } finally {
            reset();
          }
        },
        onCancel: reset,
        onError: (error) => {
          showError((error && error.message) || 'Payment failed to process. Please try again.');
          reset();
        },
      });
      // v2's newTransaction() opens the popup itself -- no separate
      // .openIframe() call exists on this instance (that's the older v1
      // API: PaystackPop.setup({...}).openIframe()). Calling it here threw
      // "popup.openIframe is not a function" and silently broke every
      // checkout attempt.
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
  });
})();
