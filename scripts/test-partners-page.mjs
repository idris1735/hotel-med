import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const page = read('partners.html'); const css = read('assets/partners.css');
test('Partner introduction reuses the existing marketing palette and typefaces',()=>{
  const existing = read('about.html');
  for (const token of ['#0a1728','#10233d','#182c4d','#faf8f3','#c9a227','Cormorant Garamond','Inter','Parisienne']) {
    assert.ok(existing.includes(token)); assert.ok(css.includes(token));
  }
  assert.match(page,/assets\/logo-icon\.png/); assert.match(page,/assets\/photos\/entrance-glass-1280\.jpg/);
});
test('Public information does not expose private invitations or promise automatic approval',()=>{
  assert.match(page,/invitation-only/); assert.match(page,/management approval/);
  assert.match(page,/Enquiries do not create an affiliate account/);
  assert.doesNotMatch(page,/https:\/\/app\.hotelmedallion\.com\/partners\//);
  assert.doesNotMatch(page,/<form\b/i);
});
test('Commission explanation excludes taxes, deposits, cancellations and refunds',()=>{
  for (const phrase of ['before tax','after the guest completes','Cancelled','refunded','no-show','deposits','food','agreed percentage']) assert.ok(page.includes(phrase),phrase);
  assert.doesNotMatch(page,/15%/); // The agreement is editable; do not publish a fixed promise.
  assert.match(page,/mailto:reservation@hotelmedallion\.com\?subject=Medallion%20Partner%20Programme/);
});
test('Homepage and every public-page footer make the introduction discoverable',()=>{
  const files=['index.html','about.html','contact.html','reservation.html','room-comfort.html','room-executive.html','room-executive-double.html','room-mini-suite.html','room-suite.html'];
  for (const file of files) {
    const footer=read(file).split('<footer')[1]?.split('</footer>')[0];
    assert.ok(footer?.includes('href="/partners"'),file);
  }
  assert.match(read('index.html'),/id="partners" aria-labelledby="partners-title"/);
});
test('Mobile menu, keyboard access and reduced-motion behaviour are available',()=>{
  assert.match(page,/aria-controls="partner-nav"/); assert.match(page,/class="skip-link"/);
  assert.match(css,/@media\(max-width: 800px\)/); assert.match(css,/prefers-reduced-motion/);
  assert.match(read('assets/partners.js'),/event.key === 'Escape'/);
});
test('Local page assets exist and the public page has its own canonical URL',()=>{
  for(const match of page.matchAll(/(?:src|href)="(assets\/[^"?]+)"/g)) assert.ok(fs.existsSync(new URL('../'+match[1],import.meta.url)),match[1]);
  assert.match(page,/rel="canonical" href="https:\/\/hotelmedallion\.com\/partners"/);
});
