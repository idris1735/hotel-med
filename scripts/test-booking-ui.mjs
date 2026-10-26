import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const room={id:'019a0000-0000-7000-8000-000000000001',name:'Deluxe Comfort',max_adults:2,available:2,nightly_rate:7000000,total:14000000,deposit:1000000};
const wait=()=>new Promise(resolve=>setTimeout(resolve,10));
async function setup(overrides={}){
 const dom=new JSDOM(source(overrides.page||'index.html'),{url:'https://hotelmedallion.com/?ref=EMEKA',runScripts:'outside-only',pretendToBeVisual:true});await wait();const calls=[];
 dom.window.fetch=async(url,options)=>{const b=options?.body?JSON.parse(options.body):null;calls.push({url,body:b});if(overrides.request){const r=await overrides.request(url,b);if(r)return r;}
  if(url==='/api/rates')return Response.json({rates:{NGN:1500,USD:1,GBP:.75,EUR:.9}});
  if(url==='/api/chat')return Response.json({reply:'Review your dates and room below.',history:[],action:{type:'open_booking',details:{arrival:'2026-11-01',departure:'2026-11-03',adults:2,room:room.id}}});
  if(!b)return Response.json({room_types:[room]});
  if(b.action==='availability')return Response.json({room_types:[room],nights:2,providers:{online_payment:true,confirmation_email:true}});
  if(b.action==='reserve')return Response.json({booking_id:room.id,reference:'WEB-UI-TEST',receipt:'signed-test-receipt',online_payment:true,email_state:'queued'});
  return Response.json({error:'Test checkout intentionally stopped.'},{status:503});
 };
 const files=overrides.lateBooking?['assets/checkout.js','assets/vesper.js','assets/currency.js']:['assets/booking-live.js','assets/checkout.js','assets/vesper.js','assets/currency.js'];
 for(const file of files)dom.window.eval(source(file));
 dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
 if(overrides.lateBooking)dom.window.eval(source('assets/booking-live.js'));
 await wait();return{dom,window:dom.window,document:dom.window.document,calls};
}
function fill(document){const f=document.querySelector('.live-booking-panel form');for(const [name,value]of Object.entries({full_name:'UI Test Guest',phone:'08012345678',email:'ui-test@example.com'}))f.elements[name].value=value;f.elements.confirmed.checked=true;return f;}
test('Quick Booking opens the website form and retains affiliate attribution through reserve and checkout',async()=>{
 const t=await setup();try{t.document.querySelector('.quickbook-fab').click();await wait();const form=fill(t.document);assert.equal(t.document.querySelector('#liveBookingDetails').hidden,false);assert.match(t.document.querySelector('#liveBookingSummary').textContent,/140,000/);
 form.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();const saved=t.calls.find(c=>c.body?.action==='reserve').body;assert.equal(saved.affiliate_code,'EMEKA');assert.equal(saved.expected_total,14000000);assert.equal(saved.ids.booking_id[14],'7');assert.equal(saved.confirmed,true);
 assert.match(t.document.querySelector('#liveBookingBody').textContent,/WEB-UI-TEST/);assert.match(t.document.querySelector('[role=alert]').textContent,/intentionally stopped/);assert.ok(t.document.querySelector('#liveBookingPay'));assert.ok(!t.document.querySelector('#liveBookingBody').textContent.includes('paid.'));
 }finally{t.dom.window.close();}
});

test('a failed live-form load shows a retry on the website instead of redirecting to the app booking page',async()=>{
 const t=await setup();try{delete t.window.MedallionBooking;const before=t.window.location.href;
 t.document.querySelector('#bookingForm').dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await wait();
 assert.equal(t.window.location.href,before);assert.match(t.document.querySelector('#checkoutPanel').textContent,/reload this page/);
 assert.equal(t.calls.filter(c=>c.body?.action==='reserve').length,0);
 }finally{t.dom.window.close();}
});
test('the first-name option is opt-in and Forget name removes only that remembered name',async()=>{
 const t=await setup();try{t.document.querySelector('.quickbook-fab').click();await wait();const f=fill(t.document);assert.equal(t.window.localStorage.getItem('medallion.remembered-name'),null);f.elements.remember.checked=true;f.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.equal(t.window.localStorage.getItem('medallion.remembered-name'),'UI');assert.equal(t.document.querySelector('.vesper-forget').hidden,false);t.document.querySelector('.vesper-forget').click();assert.equal(t.window.localStorage.getItem('medallion.remembered-name'),null);}finally{t.dom.window.close();}
});
test('Vesper opens the same booking review form with its selected dates without submitting a booking',async()=>{
 const t=await setup();try{t.document.querySelector('.vesper-fab').click();t.document.querySelector('#vesperInput').value='Book Comfort for two nights';t.document.querySelector('#vesperForm').dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await wait();t.document.querySelector('.vesper-booking-button').click();await wait();assert.equal(t.document.querySelector('[name=arrival]').value,'2026-11-01');assert.equal(t.document.querySelector('[name=departure]').value,'2026-11-03');assert.equal(t.document.querySelector('[name=room]').value,room.id);assert.equal(t.calls.filter(c=>c.body?.action==='reserve').length,0);assert.equal(t.document.querySelector('.vesper-panel').classList.contains('show'),false);}finally{t.dom.window.close();}
});
test('a price change refreshes the quote and requires a new confirmation',async()=>{
 let searches=0;const t=await setup({request:async(url,b)=>{if(b?.action==='reserve')return Response.json({error:'Room price has changed. Check the updated price before reserving.'},{status:400});if(b?.action==='availability'){searches++;return Response.json({room_types:[{...room,total:searches>1?17000000:14000000,nightly_rate:searches>1?8500000:7000000}],nights:2,providers:{online_payment:true}});}}});
 try{t.document.querySelector('.quickbook-fab').click();await wait();const f=fill(t.document);f.dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.match(t.document.querySelector('#liveBookingSummary').textContent,/170,000/);assert.equal(t.document.querySelector('[name=confirmed]').checked,false);assert.match(t.document.querySelector('[role=alert]').textContent,/price changed/);assert.equal(t.calls.filter(c=>c.body?.action==='checkout').length,0);}finally{t.dom.window.close();}
});
test('live app prices populate matching website room cards without inventing suite rates',async()=>{
 const t=await setup();try{const cards=[...t.document.querySelectorAll('.room-card')];const comfort=cards.find(c=>c.querySelector('.room-name').textContent.includes('Comfort'));assert.match(comfort.querySelector('.room-price').textContent,/70,000/);const suite=cards.find(c=>c.querySelector('.room-name').textContent.includes('2 Bedroom'));assert.match(suite.querySelector('.room-price').textContent,/Contact us/);}finally{t.dom.window.close();}
});
test('room detail pages use their room heading when matching a live rate',async()=>{
 const t=await setup({page:'room-comfort.html'});try{assert.match(t.document.querySelector('.room-price').textContent,/70,000/);}finally{t.dom.window.close();}
});

test('late-loaded live booking replaces Quick Booking instead of stacking two booking panels',async()=>{
 const t=await setup({lateBooking:true});try{
  assert.ok(t.document.querySelector('#quickbookOverlay'));
  t.document.querySelector('.quickbook-fab').click();await wait();
  assert.equal(t.document.querySelectorAll('.live-booking-overlay').length,1);
  assert.equal(t.document.querySelectorAll('.quickbook-overlay.show,.checkout-overlay.show').length,0);
  assert.equal(t.document.body.classList.contains('medallion-booking-active'),true);
 }finally{t.dom.window.close();}
});

test('legacy form handoff closes its panel and the live modal restores page access on close',async()=>{
 const t=await setup({lateBooking:true});try{
  const old=t.document.querySelector('#quickbookOverlay');old.classList.add('show');
  t.document.querySelector('#qbArrival').value='2026-11-01';t.document.querySelector('#qbDeparture').value='2026-11-03';
  t.document.querySelector('#quickBookForm').dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await wait();
  assert.equal(old.classList.contains('show'),false);
  assert.ok(t.document.querySelector('.live-booking-panel[data-lenis-prevent]'));
  assert.equal(t.document.querySelector('#nav').inert,true);
  assert.equal(t.document.querySelector('.live-booking-overlay').inert,undefined);
  let closed=0;t.document.addEventListener('medallion-booking-closed',()=>closed++);
  t.document.querySelector('.live-booking-close').click();
  assert.equal(t.document.querySelector('.live-booking-overlay'),null);
  assert.equal(t.document.body.classList.contains('medallion-booking-active'),false);
  assert.notEqual(t.document.querySelector('#nav').inert,true);
  assert.equal(t.document.body.style.overflow,'');assert.equal(closed,1);
 }finally{t.dom.window.close();}
});
