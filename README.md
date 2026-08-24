# Hotel Medallion

A boutique-hotel website for Hotel Medallion — Lekki Phase 1, Lagos. Static HTML/CSS/JS, no build step.

**Tagline:** "A Quiet Kind of Luxury."

## Pages

| File | Page |
|---|---|
| `index.html` | Homepage — hero, rooms, dining, wellness, experiences, location, gallery, booking |
| `room-suite.html` | Medallion Suite detail + reservation |
| `room-comfort.html` | Medallion Comfort detail + reservation |
| `room-mini-suite.html` | Medallion Mini-Suite detail + reservation |
| `room-executive.html` | Medallion Executive detail + reservation |
| `about.html` | Our Story — mission, vision, brand values |
| `contact.html` | Contact form + location map |
| `reservation.html` | Full room-selection + booking flow |

## Stack

- Vanilla HTML/CSS/JS — no framework, no build step
- [GSAP](https://gsap.com/) + ScrollTrigger for scroll-driven animation
- [Lenis](https://lenis.darkroom.engineering/) for smooth scroll
- [Three.js](https://threejs.org/) for the wellness section's WebGL ripple shader (homepage only)
- Fonts: Cormorant Garamond, Inter, Parisienne (Google Fonts)

All third-party scripts are loaded from CDN with Subresource Integrity (SRI) hashes.

## Running locally

No build step — serve the directory with any static file server, e.g.:

```
npx serve .
```

or open `index.html` directly in a browser.

## Notes

- Contact form and reservation forms are front-end only (no backend yet) — submission shows a confirmation toast but does not send data anywhere.
- `assets/map-lekki.png` is a custom-commissioned engraved-style map illustration (not a live map embed).
