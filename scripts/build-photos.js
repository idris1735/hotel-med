#!/usr/bin/env node
/**
 * Builds the site's photography from the client's delivered originals in
 * `Medallion/` into web-ready, colour-graded variants under `assets/photos/`.
 *
 * Grading: the originals come from one shoot but not one grade — the rooms are
 * lit cool/blue, the halls and corridors warm gold, the pool deck daylight-cyan.
 * The site's palette is near-black + cream + gold, so every photo is pulled
 * toward a warm neutral with a *partial, warm-preserving* grey-world white
 * balance: images that are too cool get corrected hard, images that are already
 * gold are left largely alone (asymmetric clamps). A light contrast lift and a
 * small saturation bump follow; the page CSS darkens further via filters, so
 * the pixel grade deliberately stays light-handed.
 *
 * Run: node scripts/build-photos.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'Medallion');
const OUT = path.join(ROOT, 'assets', 'photos');

const HERO_WIDTHS = [768, 1280, 1920];
const CARD_WIDTHS = [640, 1200];

// Warm neutral target (R,G,B multipliers around the frame's mean grey).
const TARGET = [1.055, 1.0, 0.925];
const STRENGTH = 0.62;
// Asymmetric clamps: correct cool casts firmly, leave warm frames warm.
const CLAMP_LO = [0.95, 0.94, 0.84];
const CLAMP_HI = [1.30, 1.08, 1.08];

// A handful of frames were shot in rooms with strongly blue walls, curtains and
// tiling. The default partial correction leaves them reading noticeably colder
// than the rest of the site, so those get a firmer pull toward neutral — still
// short of erasing the rooms' real colour.
const COOL = { strength: 0.88, hiR: 1.42, loB: 0.80 };

/** name -> [source basename, width set, per-photo overrides] */
const PHOTOS = {
  // Full-bleed / hero imagery
  'hall-marble': ['7R5A1010', HERO_WIDTHS],
  'lobby-arrival': ['7R5A1018', HERO_WIDTHS],
  'lobby-columns': ['7R5A1021', HERO_WIDTHS],
  'entrance-glass': ['7R5A1016', HERO_WIDTHS],
  'corridor-gold': ['7R5A1097', HERO_WIDTHS],
  'chandelier-gold': ['7R5A1027', HERO_WIDTHS],
  'dining-room': ['7R5A1136', HERO_WIDTHS],
  'pool-terrace': ['7R5A1170', HERO_WIDTHS],
  'exterior-street': ['7R5A1151', HERO_WIDTHS],
  // Room types
  'suite-2bed': ['7R5A1082', HERO_WIDTHS],
  'suite-1bed': ['7R5A1072', HERO_WIDTHS],
  'room-comfort': ['7R5A1103', HERO_WIDTHS],
  'room-executive': ['7R5A1049', HERO_WIDTHS, COOL],
  'room-executive-double': ['7R5A1099', HERO_WIDTHS],
  'suite-evening': ['7R5A1085', HERO_WIDTHS],
  // Cards, galleries, details
  'corridor-marble': ['7R5A1098', CARD_WIDTHS],
  'gym': ['7R5A1124', CARD_WIDTHS],
  'pool-loungers': ['7R5A1166', CARD_WIDTHS],
  'exterior-palms': ['7R5A1147', CARD_WIDTHS],
  'dining-flowers': ['7R5A1141', CARD_WIDTHS],
  'suite-detail': ['7R5A1086', CARD_WIDTHS],
  'stair-crystal': ['7R5A1091', CARD_WIDTHS],
  'bathroom-wide': ['7R5A1089', CARD_WIDTHS, COOL],
  'reception': ['7R5A1131', CARD_WIDTHS],
  'twin-beds': ['7R5A1093', CARD_WIDTHS],
  'twin-window': ['7R5A1102', CARD_WIDTHS],
  'bed-detail': ['7R5A1030', CARD_WIDTHS, COOL],
  'bed-linen': ['7R5A1051', CARD_WIDTHS, COOL],
  'hall-glass': ['7R5A1008', CARD_WIDTHS],
};

async function balance(file, o = {}) {
  const strength = o.strength ?? STRENGTH;
  const hi = [o.hiR ?? CLAMP_HI[0], CLAMP_HI[1], CLAMP_HI[2]];
  const lo = [CLAMP_LO[0], CLAMP_LO[1], o.loB ?? CLAMP_LO[2]];
  const { channels } = await sharp(file).stats();
  const [r, g, b] = channels.slice(0, 3).map((c) => c.mean);
  const grey = (r + g + b) / 3;
  return [r, g, b].map((mean, i) => {
    const ideal = (grey * TARGET[i]) / mean;
    const damped = 1 + strength * (ideal - 1);
    return Math.min(hi[i], Math.max(lo[i], damped));
  });
}

async function build(name, base, widths, overrides) {
  const file = path.join(SRC, base + '.jpg');
  const k = await balance(file, overrides);
  const written = [];
  for (const w of widths) {
    const dest = path.join(OUT, `${name}-${w}.jpg`);
    // A SINGLE .linear() call, not two chained ones: sharp does not compose
    // consecutive .linear() calls (confirmed by testing -- a second call
    // silently discards the first's array coefficients rather than
    // multiplying through), so the previous two-call version was applying
    // only the flat contrast lift and dropping the actual white-balance
    // correction on every photo, not just this one. Composed by hand:
    // contrast(wb(x)) = 1.07*(k*x) - 7 = (1.07*k)*x - 7.
    const contrast = 1.07;
    const combined = k.map((v) => v * contrast);
    const info = await sharp(file)
      .resize({ width: w, withoutEnlargement: true })
      .linear(combined, [-7, -7, -7])
      .modulate({ saturation: 1.04 })
      .jpeg({ quality: w >= 1900 ? 72 : w >= 1200 ? 77 : 80, mozjpeg: true, progressive: true })
      .toFile(dest);
    written.push(`${w}w ${(info.size / 1024).toFixed(0)}KB`);
  }
  console.log(`${name.padEnd(24)} <- ${base}  wb[${k.map((x) => x.toFixed(2)).join(',')}]  ${written.join('  ')}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, [base, widths, overrides]] of Object.entries(PHOTOS)) {
    await build(name, base, widths, overrides);
  }
  const total = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`\n${fs.readdirSync(OUT).length} files, ${(total / 1024 / 1024).toFixed(2)} MB total`);
})();
