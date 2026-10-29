import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const room = { id: '019a0000-0000-7000-8000-000000000001', name: 'Deluxe Comfort', nightly_rate: 7000000 };
const wait = () => new Promise(resolve => setTimeout(resolve, 20));

async function setup(options = {}) {
  const dom = new JSDOM(source(options.page || 'index.html'), { url: 'https://hotelmedallion.com/?ref=EMEKA', runScripts: 'outside-only', pretendToBeVisual: true });
  await wait();
  const calls = [], destinations = [];
  const location = { href: dom.window.location.href, assign: url => destinations.push(new URL(url)) };
  // Intercept navigation at the browser boundary while executing the real scripts unchanged.
  const window = new Proxy(dom.window, { get(target, key) { return key === 'location' ? location : Reflect.get(target, key); } });
  const fetch = async (url, request) => {
    const body = request?.body ? JSON.parse(request.body) : null; calls.push({ url, body });
    if (options.request) { const response = await options.request(url, body); if (response) return response; }
    if (url === '/api/rates') return Response.json({ rates: { NGN: 1500, USD: 1, GBP: .75, EUR: .9 } });
    if (url === '/api/chat') return Response.json({ reply: 'Review your room and dates.', history: [], action: { type: 'open_booking', details: {
      arrival: '2026-11-01', departure: '2026-11-03', adults: 2, children: 1, room: room.id,
    } } });
    if (url === '/api/hotel-booking' && !body) return Response.json({ room_types: [room] });
    throw new Error('This handoff must not create bookings or payments');
  };
  const context = vm.createContext({ window, document: dom.window.document, fetch, URL, Intl, Date, console,
    localStorage: dom.window.localStorage, CustomEvent: dom.window.CustomEvent,
    setTimeout: dom.window.setTimeout.bind(dom.window), setInterval: dom.window.setInterval.bind(dom.window) });
  const load = name => vm.runInContext(source(name), context, { filename: name });
  if (!options.lateBooking && !options.withoutBooking) load('assets/booking-live.js');
  for (const name of ['assets/checkout.js', 'assets/vesper.js', 'assets/currency.js']) load(name);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  if (options.lateBooking) load('assets/booking-live.js');
  await wait();
  return { dom, window, document: dom.window.document, calls, destinations };
}
function assertDestination(t) {
  assert.equal(t.destinations.length, 1);
  const url = t.destinations[0];
  assert.equal(url.origin, 'https://app.hotelmedallion.com');
  assert.equal(url.pathname, '/book/medallion');
  assert.equal(url.searchParams.get('ref'), 'EMEKA');
  assert.equal(t.calls.filter(call => call.body && call.url === '/api/hotel-booking').length, 0);
  assert.equal(t.document.querySelectorAll('.live-booking-overlay,.quickbook-overlay.show,.checkout-overlay.show').length, 0);
  return url;
}

test('Book Now goes directly to the app without an intermediate modal or reservation', async () => {
  const t = await setup(); try { t.document.querySelector('.quickbook-fab').click(); assertDestination(t); } finally { t.dom.window.close(); }
});
test('main booking form carries dates, guest count and the selected room', async () => {
  const t = await setup(); try {
    for (const [id, value] of Object.entries({ bookingArrival: '2026-11-01', departure: '2026-11-03', guests: '3' })) t.document.getElementById(id).value = value;
    const select = t.document.getElementById('roomType'); select.value = select.options[1].value;
    t.document.getElementById('bookingForm').dispatchEvent(new t.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    const url = assertDestination(t);
    assert.equal(url.searchParams.get('arrival'), '2026-11-01'); assert.equal(url.searchParams.get('departure'), '2026-11-03');
    assert.equal(url.searchParams.get('adults'), '3'); assert.equal(url.searchParams.get('room'), select.value);
  } finally { t.dom.window.close(); }
});
test('room cards carry the chosen category directly into app booking', async () => {
  const t = await setup(); try {
    t.document.querySelector('[data-book-room="Medallion Deluxe Comfort"]').click();
    assert.equal(assertDestination(t).searchParams.get('room'), 'Medallion Deluxe Comfort');
  } finally { t.dom.window.close(); }
});
test('Vesper forwards the actual room ID, dates, adults and children without creating a booking', async () => {
  const t = await setup(); try {
    t.document.querySelector('.vesper-fab').click(); t.document.querySelector('#vesperInput').value = 'Book Comfort for two nights';
    t.document.querySelector('#vesperForm').dispatchEvent(new t.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await wait(); t.document.querySelector('.vesper-booking-button').click();
    const url = assertDestination(t);
    assert.equal(url.searchParams.get('room'), room.id); assert.equal(url.searchParams.get('arrival'), '2026-11-01');
    assert.equal(url.searchParams.get('departure'), '2026-11-03'); assert.equal(url.searchParams.get('adults'), '2');
    assert.equal(url.searchParams.get('children'), '1'); assert.equal(t.document.querySelector('.vesper-panel').classList.contains('show'), false);
  } finally { t.dom.window.close(); }
});
test('a late-loaded booking script does not stack the old Quick Booking panel', async () => {
  const t = await setup({ lateBooking: true }); try { t.document.querySelector('.quickbook-fab').click(); assertDestination(t); } finally { t.dom.window.close(); }
});
test('legacy Quick Booking submits its dates directly and closes its old panel', async () => {
  const t = await setup({ lateBooking: true }); try {
    t.document.querySelector('#quickbookOverlay').classList.add('show');
    t.document.querySelector('#qbArrival').value = '2026-11-01'; t.document.querySelector('#qbDeparture').value = '2026-11-03';
    t.document.querySelector('#quickBookForm').dispatchEvent(new t.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(assertDestination(t).searchParams.get('arrival'), '2026-11-01');
  } finally { t.dom.window.close(); }
});
test('booking still opens when the live-price script is unavailable', async () => {
  const t = await setup({ withoutBooking: true }); try {
    t.document.querySelector('#bookingForm').dispatchEvent(new t.dom.window.Event('submit', { bubbles: true, cancelable: true })); assertDestination(t);
  } finally { t.dom.window.close(); }
});
test('fallback navigation keeps the trusted hotel destination for a legacy chat link', async () => {
  const t = await setup({ withoutBooking: true }); try {
    t.window.MedallionCheckout.openPaystackForBooking({ bookingUrl: 'https://example.invalid/fake?arrival=2026-11-01&departure=2026-11-03&room=Comfort' });
    assert.equal(t.destinations[0].origin, 'https://app.hotelmedallion.com');
    assert.equal(t.destinations[0].searchParams.get('room'), 'Comfort');
  } finally { t.dom.window.close(); }
});
test('zero children survives the redirect and contact details are not added to its URL', async () => {
  const t = await setup(); try {
    t.window.MedallionBooking.open({ room: room.id, adults: 2, children: 0, email: 'private@example.com', full_name: 'Private Guest' });
    const url = assertDestination(t); assert.equal(url.searchParams.get('children'), '0');
    assert.equal(url.searchParams.has('email'), false); assert.equal(url.searchParams.has('full_name'), false);
  } finally { t.dom.window.close(); }
});
test('live app prices populate room cards without inventing suite prices', async () => {
  const t = await setup(); try {
    const cards = [...t.document.querySelectorAll('.room-card')];
    assert.match(cards.find(card => card.querySelector('.room-name').textContent.includes('Comfort')).querySelector('.room-price').textContent, /70,000/);
    assert.match(cards.find(card => card.querySelector('.room-name').textContent.includes('2 Bedroom')).querySelector('.room-price').textContent, /Contact us/);
  } finally { t.dom.window.close(); }
});
test('room detail pages match the live room price', async () => {
  const t = await setup({ page: 'room-comfort.html' }); try { assert.match(t.document.querySelector('.room-price').textContent, /70,000/); } finally { t.dom.window.close(); }
});
test('unavailable live rates do not leave a stale price visible', async () => {
  const t = await setup({ request: async (url, body) => url === '/api/hotel-booking' && !body ? Response.json({}, { status: 503 }) : null });
  try { assert.ok([...t.document.querySelectorAll('.room-price')].every(price => price.textContent === 'Check live rates')); } finally { t.dom.window.close(); }
});
test('Forget name removes only the remembered name without making it a login', async () => {
  const t = await setup(); try {
    t.window.localStorage.setItem('medallion.remembered-name', 'Ada'); t.window.localStorage.setItem('other-preference', 'keep');
    t.window.MedallionBooking.forget(); assert.equal(t.window.MedallionBooking.rememberedName(), '');
    assert.equal(t.window.localStorage.getItem('other-preference'), 'keep');
  } finally { t.dom.window.close(); }
});
