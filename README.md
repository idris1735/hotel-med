# Hotel Medallion website

The public website for Hotel Medallion, Lekki, Lagos. Static HTML/CSS/JavaScript with Vercel server functions. The existing navy/gold theme, original assets and room animations remain in place.

## One live booking system

Hotel OS owns room categories, rates, availability, reservations, deposits and verified payment status in Supabase project `loxvlxtnqoeixmwyyihh`. The website does not create a second reservation database.

Room cards, room detail pages, Quick Booking and Vesper use the same live public APIs. A base-rate change in the staff app reaches the website on refresh/focus and its 60-second refresh cycle. Explicit website rate-plan overrides take priority for matching dates. Converted currencies are estimates; checkout is in NGN. Rooms without configured online inventory show a contact message instead of an invented price.

Choose dates → check availability → choose a live room type → enter name, phone and email → review the total and confirm → reservation appears in Hotel OS → secure GlobalPay deposit checkout. Website booking buttons open https://app.hotelmedallion.com/book/medallion directly, carrying the chosen room, dates, party size and referral. Availability, guest details and the final quote are reviewed on that page before GlobalPay checkout. Reception confirms the physical room assignment. Server inventory holds and the normal booking lifecycle still apply.

The guest's displayed total is checked again inside the reservation transaction. If the app rate changed, no booking/hold is left behind; the guest sees the new quote before submitting again. Existing reservations keep their agreed price. Client IDs are UUID v7 and retained on network retry.

## Vesper

Vesper reads current room types and date-specific availability through restricted public tools. It opens the same app booking page with the chosen room and dates and can explain hotel amenities, booking/payment steps, partner invitations and guest services. It cannot assign rooms, access private guest records, issue keys, approve refunds or declare a payment successful.

A previously remembered first name can be removed using **Forget name**. The website redirect does not collect or place guest contact details in its URL. A remembered name is not verified identity and grants no access to an existing booking. Contact information is collected in the booking form, not requested in chat.

Chat history is bounded and stripped to user/model text; client-supplied tool results, function calls, files and system messages are discarded. Model calls have timeouts and per-IP-hash/global budgets stored in Supabase, rather than relying on serverless memory. The browser never gets AI keys, service-role credentials or the website gateway secret. Checkout access is signed and payment URLs are limited to the actual GlobalPay domains.

## Partners

`/partners` explains the invitation-only programme. `/partners/login` opens the separate website-themed partner sign-in. Management approves partners and emails access; partners choose their own password. They see only their own referrals, commission and recorded payouts. The default commission is 15% and management can edit it; public marketing does not promise a fixed rate. Guest referral codes remain attached through the website-to-app booking flow.

Enquiries: **reservation@hotelmedallion.com**. The website does not create a mailbox or automatically approve partners.

## Configuration and release

- Existing Vercel project: **hotel-med**, scope **idris-projects-eb8461ae**.
- Website public connection: `HOTELOS_SUPABASE_URL`, `HOTELOS_SUPABASE_ANON_KEY`.
- Private server-to-server budget/receipt key: `WEBSITE_GATEWAY_SECRET`, also installed on the Hotel OS Supabase project for `website-guard`.
- Existing server-only AI key: `GEMINI_API_KEY`.
- Booking email and GlobalPay credentials remain in Hotel OS; the website invokes its restricted booking provider. Never copy the Supabase service-role key into this website.
- Apply the matching PMS catalogue/quote-check and request-budget migrations, deploy `website-guard`, then publish the matching website. Partner password access also needs its account migration and `affiliate-access` function.
- Preserve the current branded webhook at `https://api.hotelmedallion.com/webhooks/globalpay`.

Run checks with `node --test scripts/test-live-booking.mjs scripts/test-booking-handoff.mjs scripts/test-booking-ui.mjs scripts/test-partners-page.mjs`. Database lifecycle, rate-change rollback and access tests live in the Hotel OS repository. Browser tests must stop before submitting a real reservation/payment unless specifically authorised.

The old `schema.sql`, room-price helpers and Paystack verification/webhook files are retained solely for historical compatibility. They do not set new Hotel OS booking prices. Do not re-enable legacy booking creation or remove historical settlement handling without reviewing old transactions first.

## Pages and design

Homepage, five room detail pages, About, Contact, reservation compatibility redirect and Partners. Existing GSAP/ScrollTrigger, Lenis and Three.js presentation remains unchanged. Gallery photographs and branding are the hotel's supplied assets. No build step is required for the static site; API functions require their configured Vercel runtime. A plain static server can show the layout but cannot run live booking or chat.
