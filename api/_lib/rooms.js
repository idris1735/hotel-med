// Single source of truth for room pricing on the BACKEND. The prices shown
// in index.html / room-*.html are for display only — the amount Paystack
// actually charges always comes from here, computed server-side, never
// trusted from the client. If you change a price, update it here AND in
// the matching .room-price element in the HTML so the two don't drift.
//
// Both currencies are stored as independent anchor values (not one derived
// from the other via a live exchange rate) so a guest paying in USD always
// pays exactly the quoted dollar price, regardless of what NGN/USD happens
// to be doing that day. pricePerNightNaira figures were converted from the
// client's USD price list at ~₦1,335/$1 (2026-09) and rounded to a clean
// number — update deliberately if the real quoted NGN price differs.
//
// quantity is the number of physical rooms of this type that exist. It is
// NOT currently enforced anywhere (no date-range availability check exists
// yet) — it's tracked here for display ("only 1 left") and as the known
// ceiling for whenever real availability checking gets built. Until then,
// nothing stops this room type from being oversold if demand exceeds
// quantity on overlapping dates.

const ROOMS = {
  'suite-2bed': {
    name: '2 Bedroom Deluxe Suite',
    quantity: 3,
    pricePerNightNaira: 135000,
    pricePerNightUsd: 100,
  },
  'suite-1bed': {
    name: '1 Bedroom Deluxe Suite',
    quantity: 1,
    pricePerNightNaira: 115000,
    pricePerNightUsd: 85,
  },
  comfort: {
    name: 'Medallion Deluxe Comfort',
    quantity: 21,
    pricePerNightNaira: 68000,
    pricePerNightUsd: 51,
  },
  executive: {
    name: 'Medallion Deluxe Executive',
    quantity: 16,
    pricePerNightNaira: 85000,
    pricePerNightUsd: 63,
  },
  'executive-double': {
    name: 'Double Bed Deluxe Executive',
    quantity: 2,
    pricePerNightNaira: 100000,
    pricePerNightUsd: 75,
  },
};

const CURRENCIES = ['NGN', 'USD'];

function getRoom(roomType) {
  return ROOMS[roomType] || null;
}

function isValidRoomType(roomType) {
  return Object.prototype.hasOwnProperty.call(ROOMS, roomType);
}

function isValidCurrency(currency) {
  return CURRENCIES.includes(currency);
}

// Both NGN (kobo) and USD (cents) use a x100 minor-unit convention, so one
// function covers either — the caller picks which per-night price to feed
// in based on the chosen currency.
function pricePerNightForCurrency(room, currency) {
  return currency === 'USD' ? room.pricePerNightUsd : room.pricePerNightNaira;
}

function nightsBetween(checkIn, checkOut) {
  const inDate = new Date(`${checkIn}T00:00:00Z`);
  const outDate = new Date(`${checkOut}T00:00:00Z`);
  const ms = outDate.getTime() - inDate.getTime();
  const nights = Math.round(ms / (1000 * 60 * 60 * 24));
  return nights;
}

module.exports = {
  ROOMS,
  CURRENCIES,
  getRoom,
  isValidRoomType,
  isValidCurrency,
  pricePerNightForCurrency,
  nightsBetween,
};
