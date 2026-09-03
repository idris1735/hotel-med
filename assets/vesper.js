// Vesper -- the AI concierge chat widget. Talks to /api/chat (backed by
// Gemini, see api/_lib/gemini.js). Loaded on every page alongside
// checkout.js, which is why the actual payment handoff below calls
// window.MedallionCheckout.openPaystackForBooking() rather than duplicating
// the Paystack popup logic here -- there is exactly one place in the whole
// site that ever opens PaystackPop.
(function () {
  'use strict';

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  // Gemini's replies routinely use light markdown (**bold**, "- " bullet
  // lists, blank-line-separated paragraphs). Escaping happens FIRST, on the
  // raw text -- every tag below is then built only out of that already-safe
  // string, so nothing the model or a guest types can inject real markup.
  function inlineFormat(line) {
    return line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  function formatBotText(raw) {
    const escaped = escapeHtml(raw);
    return escaped
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '');
        if (lines.length === 0) return '';
        const isList = lines.every((l) => /^[-*•]\s+/.test(l));
        if (isList) {
          const items = lines.map((l) => `<li>${inlineFormat(l.replace(/^[-*•]\s+/, ''))}</li>`).join('');
          return `<ul>${items}</ul>`;
        }
        return `<p>${lines.map(inlineFormat).join('<br>')}</p>`;
      })
      .join('');
  }

  function injectStyles() {
    if (document.getElementById('vesper-styles')) return;
    const style = document.createElement('style');
    style.id = 'vesper-styles';
    style.textContent = `
      .vesper-fab {
        position: fixed; left: 1.4rem; bottom: calc(1.4rem + env(safe-area-inset-bottom)); z-index: 9000;
        width: 60px; height: 60px; border-radius: 50%; padding: 0; border: 2px solid #c9a227;
        background: #12121a; cursor: pointer; box-shadow: 0 8px 24px rgba(10,10,15,0.4);
        transition: transform 0.3s, box-shadow 0.3s; overflow: visible;
      }
      .vesper-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(10,10,15,0.45); }
      .vesper-fab img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
      .vesper-fab-badge {
        position: absolute; top: -4px; right: -6px; background: #c9a227; color: #0a0a0f;
        font-family: 'Inter', system-ui, sans-serif; font-size: 0.52rem; font-weight: 700;
        letter-spacing: 0.04em; padding: 0.18em 0.42em; border-radius: 999px; line-height: 1.4;
      }
      .vesper-fab-ring {
        position: absolute; inset: -2px; border-radius: 50%; border: 2px solid rgba(201,162,39,0.5);
        animation: vesper-pulse 2.6s ease-out infinite;
      }
      @keyframes vesper-pulse {
        0% { transform: scale(1); opacity: 0.7; }
        100% { transform: scale(1.45); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) { .vesper-fab-ring { animation: none; display: none; } }
      .vesper-fab.is-open .vesper-fab-ring { display: none; }
      @media (max-width: 640px) {
        .vesper-fab { left: 1rem; bottom: calc(1rem + env(safe-area-inset-bottom)); width: 54px; height: 54px; }
      }

      .vesper-panel {
        position: fixed; left: 1.4rem; bottom: 6rem; z-index: 9500;
        width: 368px; max-width: calc(100vw - 2.8rem); height: 520px; max-height: calc(100vh - 8rem);
        background: #12121a; border: 1px solid rgba(245,240,232,0.14); border-radius: 12px;
        box-shadow: 0 20px 60px rgba(10,10,15,0.5); display: flex; flex-direction: column; overflow: hidden;
        font-family: 'Inter', system-ui, sans-serif;
        opacity: 0; transform: translateY(16px) scale(0.98); pointer-events: none;
        transition: opacity 0.28s ease, transform 0.28s ease;
      }
      .vesper-panel.show { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      @media (prefers-reduced-motion: reduce) { .vesper-panel { transition: opacity 0.15s; transform: none; } }
      @media (max-width: 640px) {
        .vesper-panel {
          left: 0.6rem; right: 0.6rem;
          bottom: calc(5.4rem + env(safe-area-inset-bottom)); width: auto;
          /* 100vh is taller than what's actually visible once iOS Safari's
             dynamic toolbar is showing, which crops the bottom of the panel
             (input row included) behind the browser chrome. 100dvh tracks
             the real visible viewport; the plain vh rule above is the
             fallback for browsers that don't support dvh yet. */
          height: calc(100vh - 7.4rem - env(safe-area-inset-bottom));
          height: calc(100dvh - 7.4rem - env(safe-area-inset-bottom));
        }
      }

      .vesper-header {
        display: flex; align-items: center; gap: 0.7rem; padding: 0.9rem 1rem;
        border-bottom: 1px solid rgba(245,240,232,0.1); flex: none;
      }
      .vesper-header img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex: none; }
      .vesper-header-text { flex: 1; min-width: 0; }
      .vesper-header-name {
        font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.15rem; color: #f5f0e8; line-height: 1.2;
      }
      .vesper-header-sub { font-size: 0.65rem; letter-spacing: 0.06em; color: rgba(245,240,232,0.45); margin-top: 0.15rem; }
      .vesper-close {
        background: none; border: none; color: rgba(245,240,232,0.5); font-size: 1.3rem; line-height: 1;
        cursor: pointer; padding: 0.55em; flex: none;
      }
      .vesper-close:hover { color: #f5f0e8; }

      .vesper-messages {
        flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.7rem;
      }
      .vesper-msg { display: flex; gap: 0.5rem; max-width: 88%; }
      .vesper-msg.user { align-self: flex-end; flex-direction: row-reverse; }
      .vesper-msg img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex: none; margin-top: 0.2rem; }
      .vesper-bubble {
        font-size: 0.83rem; line-height: 1.55; padding: 0.6em 0.85em; border-radius: 10px;
      }
      .vesper-msg.bot .vesper-bubble { background: rgba(245,240,232,0.07); color: #f5f0e8; border-bottom-left-radius: 3px; }
      .vesper-msg.user .vesper-bubble { background: #c9a227; color: #0a0a0f; border-bottom-right-radius: 3px; white-space: pre-wrap; }
      .vesper-bubble p { margin: 0 0 0.6em; }
      .vesper-bubble p:last-child { margin-bottom: 0; }
      .vesper-bubble ul { margin: 0.2em 0 0.6em; padding-left: 1.15em; }
      .vesper-bubble ul:last-child { margin-bottom: 0; }
      .vesper-bubble li { margin-bottom: 0.3em; }
      .vesper-bubble li:last-child { margin-bottom: 0; }
      .vesper-bubble strong { color: #e8c866; font-weight: 600; }
      .vesper-msg.user .vesper-bubble strong { color: #0a0a0f; }
      .vesper-typing { display: flex; gap: 0.3em; padding: 0.7em 0.85em; }
      .vesper-typing span {
        width: 5px; height: 5px; border-radius: 50%; background: rgba(245,240,232,0.5);
        animation: vesper-bounce 1.2s infinite ease-in-out;
      }
      .vesper-typing span:nth-child(2) { animation-delay: 0.15s; }
      .vesper-typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes vesper-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-4px); opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .vesper-typing span { animation: none; opacity: 0.8; } }

      .vesper-input-row {
        display: flex; gap: 0.5rem; padding: 0.8rem; border-top: 1px solid rgba(245,240,232,0.1); flex: none;
      }
      .vesper-input-row input {
        flex: 1; min-width: 0; background: rgba(245,240,232,0.05); border: 1px solid rgba(245,240,232,0.16);
        color: #f5f0e8; padding: 0.65em 0.8em; font-family: 'Inter', system-ui, sans-serif;
        font-size: 0.82rem; border-radius: 8px; outline: none; transition: border-color 0.3s;
      }
      .vesper-input-row input:focus { border-color: #c9a227; }
      .vesper-input-row input::placeholder { color: rgba(245,240,232,0.35); }
      .vesper-send {
        width: 38px; height: 38px; flex: none; border-radius: 8px; border: none; background: #c9a227;
        color: #0a0a0f; font-size: 1rem; cursor: pointer; transition: background 0.3s; display: flex;
        align-items: center; justify-content: center;
      }
      /* iOS Safari zooms the whole page in on focus when an input's
         font-size is under 16px -- jarring on a chat widget where the
         input gets focused constantly. 16px only on touch/narrow
         viewports so the desktop type scale is untouched. */
      @media (max-width: 640px) {
        .vesper-input-row input { font-size: 16px; }
        .vesper-send { width: 42px; height: 42px; }
      }
      .vesper-send:hover { background: #f5f0e8; }
      .vesper-send:disabled { opacity: 0.5; cursor: default; }
    `;
    document.head.appendChild(style);
  }

  const AVATAR = 'assets/vesper-face-96.jpg';
  const GREETING = "Hi, I'm Vesper, Hotel Medallion's AI concierge. Ask me about rooms, rates, dining, whatever you need. Or just tell me your dates and I'll get a room held for you.";

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // A few warm, on-brand variants so a guest who books more than once (or a
  // demo run multiple times) doesn't see the exact same line twice -- this
  // fires instantly on the client the moment payment is confirmed, rather
  // than waiting on another Gemini round-trip for a message that needs to
  // feel immediate.
  function successMessage({ firstName, roomName, checkIn, checkOut, reference }) {
    const dates = checkIn && checkOut ? `${formatDate(checkIn)} to ${formatDate(checkOut)}` : 'your dates';
    const variants = [
      `🎉 That's a wrap, ${firstName}! Your ${roomName} is locked in for ${dates}. Reference ${reference}, and a confirmation email is already on its way. I'll go make sure the pillows are properly fluffed.`,
      `🥂 Booked and confirmed. ${roomName}, ${dates}, reference ${reference}. Confirmation email is on its way to you now. Can't promise anything about Lekki traffic, but the room's sorted.`,
      `Payment received, ${firstName}. You're officially in for ${dates} in the ${roomName}, reference ${reference}. Confirmation email should land shortly, so go ahead and start looking forward to it.`,
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function injectVesper() {
    injectStyles();

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'vesper-fab';
    fab.setAttribute('aria-label', 'Chat with Vesper, our AI concierge');
    fab.innerHTML = `<span class="vesper-fab-ring" aria-hidden="true"></span><img src="${AVATAR}" alt=""><span class="vesper-fab-badge">AI</span>`;
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.className = 'vesper-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with Vesper');
    panel.innerHTML = `
      <div class="vesper-header">
        <img src="${AVATAR}" alt="">
        <div class="vesper-header-text">
          <div class="vesper-header-name">Vesper</div>
          <div class="vesper-header-sub">AI CONCIERGE · HOTEL MEDALLION</div>
        </div>
        <button type="button" class="vesper-close" aria-label="Close chat">&times;</button>
      </div>
      <div class="vesper-messages" id="vesperMessages"></div>
      <form class="vesper-input-row" id="vesperForm">
        <input type="text" id="vesperInput" placeholder="Ask about rooms, rates, or book a stay..." autocomplete="off" maxlength="2000">
        <button type="submit" class="vesper-send" aria-label="Send">&#10148;</button>
      </form>
    `;
    document.body.appendChild(panel);

    const messagesEl = panel.querySelector('#vesperMessages');
    const form = panel.querySelector('#vesperForm');
    const input = panel.querySelector('#vesperInput');
    const sendBtn = panel.querySelector('.vesper-send');

    let history = [];
    let isSending = false;
    let greeted = false;

    function appendMessage(role, text) {
      const row = document.createElement('div');
      row.className = 'vesper-msg ' + role;
      const body = role === 'bot' ? formatBotText(text) : escapeHtml(text);
      const bubble = `<div class="vesper-bubble">${body}</div>`;
      row.innerHTML = role === 'bot' ? `<img src="${AVATAR}" alt="">${bubble}` : bubble;
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    let typingRow = null;
    function showTyping() {
      typingRow = document.createElement('div');
      typingRow.className = 'vesper-msg bot';
      typingRow.innerHTML = `<img src="${AVATAR}" alt=""><div class="vesper-typing"><span></span><span></span><span></span></div>`;
      messagesEl.appendChild(typingRow);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    function hideTyping() {
      if (typingRow) { typingRow.remove(); typingRow = null; }
    }

    async function sendMessage(text) {
      if (isSending || !text.trim()) return;
      isSending = true;
      input.value = '';
      sendBtn.disabled = true;
      appendMessage('user', text.trim());
      showTyping();

      try {
        const resp = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text.trim(), history }),
        });
        const data = await resp.json();
        hideTyping();
        if (!resp.ok) {
          appendMessage('bot', data.error || 'Something went wrong. Please try again.');
        } else {
          history = data.history || history;
          appendMessage('bot', data.reply);
          if (data.action && data.action.type === 'open_checkout' && window.MedallionCheckout) {
            const { booking, guestEmail, guestName, checkIn, checkOut } = data.action;
            const firstName = (guestName || '').trim().split(/\s+/)[0] || 'there';
            let paidOk = false;
            // Small delay so the guest reads Vesper's confirmation line
            // before the Paystack popup takes over the screen.
            setTimeout(() => {
              window.MedallionCheckout.openPaystackForBooking(
                booking,
                guestEmail,
                // onSettled -- fires after success, cancel, AND error alike,
                // so it can't tell those apart on its own. Only speak up here
                // when payment did NOT end up confirmed (paidOk still false)
                // -- the confirmed case is already covered by onPaid below,
                // and would otherwise get two messages for one outcome.
                () => {
                  if (!paidOk) {
                    appendMessage('bot', "No stress if that didn't go through. I've still got the room held for a little while, so say the word whenever you're ready to try again, or let me know if something's not working and I'll help sort it out.");
                  }
                },
                () => {
                  paidOk = true;
                  appendMessage('bot', successMessage({
                    firstName,
                    roomName: (booking && booking.roomName) || 'room',
                    checkIn,
                    checkOut,
                    reference: booking && booking.reference,
                  }));
                }
              );
            }, 700);
          }
        }
      } catch (err) {
        hideTyping();
        appendMessage('bot', "I'm having trouble connecting right now. Please try again, or call the front desk on 09060006382.");
      } finally {
        isSending = false;
        sendBtn.disabled = false;
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage(input.value);
    });

    // On mobile, opening the software keyboard shrinks the actually-visible
    // area, but a `position: fixed` panel doesn't reliably track that --
    // CSS alone (even 100dvh) is inconsistent across browsers for
    // keyboard-driven resizing specifically (as opposed to browser-toolbar
    // resizing, which it handles fine). window.visualViewport is the one
    // API that's designed to report the real visible viewport including the
    // keyboard, so on mobile we override the panel's position/height
    // directly from it whenever it changes -- this is what keeps the input
    // row visible above the keyboard instead of pushed off-screen.
    function syncMobileViewport() {
      if (!panel.classList.contains('show')) return;
      if (window.innerWidth > 640 || !window.visualViewport) {
        panel.style.top = '';
        panel.style.bottom = '';
        panel.style.height = '';
        return;
      }
      const vv = window.visualViewport;
      const topGap = 12;
      const bottomGap = 8;
      panel.style.top = Math.max(vv.offsetTop + topGap, 0) + 'px';
      panel.style.bottom = 'auto';
      panel.style.height = Math.max(vv.height - topGap - bottomGap, 240) + 'px';
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncMobileViewport);
      window.visualViewport.addEventListener('scroll', syncMobileViewport);
    }

    function openPanel() {
      panel.classList.add('show');
      fab.classList.add('is-open');
      if (!greeted) {
        greeted = true;
        appendMessage('bot', GREETING);
        // Seed it into the history sent to Gemini too, not just the visible
        // bubble -- otherwise her first real reply has no way of knowing an
        // introduction already happened and re-introduces herself on top of
        // it (the exact "Hi, I'm Vesper... / Hello! I'm Vesper..." double
        // greeting a guest actually hit).
        history = [{ role: 'model', parts: [{ text: GREETING }] }];
      }
      syncMobileViewport();
      setTimeout(() => input.focus(), 300);
    }
    function closePanel() {
      panel.classList.remove('show');
      fab.classList.remove('is-open');
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.height = '';
    }

    fab.addEventListener('click', () => {
      if (panel.classList.contains('show')) closePanel();
      else openPanel();
    });
    panel.querySelector('.vesper-close').addEventListener('click', closePanel);
  }

  document.addEventListener('DOMContentLoaded', injectVesper);
})();
