# Hotel Medallion

A boutique-hotel website for Hotel Medallion — Lekki Phase 1, Lagos. Static HTML/CSS/JS, no build step.

**Tagline:** "A Quiet Kind of Luxury."

## Pages

| File | Page |
|---|---|
| `index.html` | Homepage — hero, rooms, dining, wellness, experiences, location, gallery, booking |
| `room-suite.html` | 2 Bedroom Deluxe Suite detail + reservation |
| `room-mini-suite.html` | 1 Bedroom Deluxe Suite detail + reservation |
| `room-comfort.html` | Medallion Deluxe Comfort detail + reservation |
| `room-executive.html` | Medallion Deluxe Executive detail + reservation |
| `room-executive-double.html` | Double Bed Deluxe Executive detail + reservation |
| `about.html` | Our Story — mission, vision, brand values |
| `contact.html` | Contact form + location map |
| `reservation.html` | Full room-selection + booking flow |

## Room catalog

Source of truth is `api/_lib/rooms.js` — 5 room types, 43 total rooms (client-confirmed figure), priced independently in both NGN and USD (not derived from a live exchange rate, so a USD payer's price never drifts with the market):

| Room | Qty | NGN/night | USD/night |
|---|---|---|---|
| 2 Bedroom Deluxe Suite | 3 | ₦135,000 | $100 |
| 1 Bedroom Deluxe Suite | 1 | ₦115,000 | $85 |
| Medallion Deluxe Comfort | 21 | ₦68,000 | $51 |
| Medallion Deluxe Executive | 16 | ₦85,000 | $63 |
| Double Bed Deluxe Executive | 2 | ₦100,000 | $75 |

Conference Room and Hall (1 each) are event spaces, not lodging — intentionally kept out of the per-night booking system since their pricing is still TBD. They're listed on the homepage's Events section as "price on request," routed through the existing Contact form.

**No availability/inventory enforcement exists yet.** `quantity` above is display-only — nothing currently stops a room type from being booked past its physical count on overlapping dates. That's a known gap, not an oversight.

## Stack

- Vanilla HTML/CSS/JS — no framework, no build step
- [GSAP](https://gsap.com/) + ScrollTrigger for scroll-driven animation
- [Lenis](https://lenis.darkroom.engineering/) for smooth scroll
- [Three.js](https://threejs.org/) for the wellness section's WebGL ripple shader (homepage only)
- Fonts: Cormorant Garamond, Inter, Parisienne (Google Fonts)

All third-party scripts are loaded from CDN with Subresource Integrity (SRI) hashes, except Paystack's `inline.js` — Paystack serves that intentionally unversioned (same convention as Stripe.js), which is incompatible with SRI pinning.

## Payments (Paystack)

Every booking form on the site (homepage widget, `reservation.html`, and each `room-*.html`) shares one checkout flow: `assets/checkout.js` + a small set of Vercel serverless functions in `/api`. Guests choose NGN or USD per booking — see the currency note below.

**Flow:** form submit → `POST /api/bookings/create` (server computes the real price from `api/_lib/rooms.js` in whichever currency was chosen, writes a `pending` row, returns a reference + amount + the Paystack public key) → Paystack's Inline popup opens with that server-issued amount/reference/currency → on success, `GET /api/paystack/verify` re-checks directly against Paystack (amount AND currency both, not just amount) before showing a confirmation → `POST /api/paystack/webhook` is the source of truth for "did this actually get paid" (HMAC-signature-verified), independent of anything the client reports.

**Currency note:** the code supports charging in USD, but whether it actually works depends on whether *your* Paystack account has USD settlement enabled — that's an account-level setting in the Paystack dashboard, not something this codebase can configure. Test a USD transaction in Paystack's sandbox before relying on it. NGN is the safe default either way.

**Setup:**
1. Deploy this repo to Vercel. Note: Vercel's free Hobby plan is restricted to personal, non-commercial use — a hotel taking real payments needs **Vercel Pro ($20/mo)**, which also removes Hobby's webhook-trigger restriction (the Paystack webhook needs that). Hobby is fine for building/testing.
2. Create a [Supabase](https://supabase.com) project (free tier is enough for a long time). In Project Settings → Database → Connection string, copy the **Transaction pooler** string (not "Direct connection" — required for serverless, see the comment in `api/_lib/db.js`).
3. Run `schema.sql` once against that database — Supabase dashboard → SQL Editor → paste it in → Run.
4. In Vercel: Project Settings → Environment Variables → add `DATABASE_URL` (the pooler string from step 2, with your real DB password in it) plus `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` from your Paystack dashboard (Settings → API Keys & Webhooks). Start with the `sk_test_...` / `pk_test_...` pair.
5. In the Paystack dashboard, register `https://<your-domain>/api/paystack/webhook` as the webhook URL.
6. Redeploy so the new env vars take effect.

Room pricing lives in exactly one place server-side: `api/_lib/rooms.js`. The prices shown in the HTML are for display only — if you change a price, update both, or they'll drift.

**Local dev:** copy `.env.example` to `.env.local`, fill in test keys, `npm i -g vercel`, then `vercel dev`.

## Running the static site only (no payments)

No build step — serve the directory with any static file server, e.g.:

```
npx serve .
```

or open `index.html` directly in a browser. Booking forms will show an error until the `/api` functions are deployed with real Paystack keys.

## Notes

- `assets/map-lekki.png` is a custom-commissioned engraved-style map illustration (not a live map embed).
- The client's own backend brief (`Hotel_Medallion_Website_Backend_Brief.docx`, not committed here) describes a longer-term plan where a PMS/channel-manager product ("Biodux") owns inventory and syncs with Booking.com/Expedia, with a private affiliate program and admin dashboard on top. None of that exists yet — what's built here is a self-contained direct-booking-and-payment MVP, intentionally scoped to work standalone regardless of how (or whether) that larger integration happens later.
