import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const ids = new Map(), hooks = new Map(), destinations = [];
  const control = (id, value) => ({ id, value, disabled: false, closest: () => null });
  const form = (id, values) => {
    const controls = Object.entries(values).map(([key,value]) => control(key,value));
    const handlers = new Map(), button = { disabled: false, textContent: 'Check availability' };
    const result = { id, controls, handlers, noValidate: false,
      querySelectorAll: () => controls,
      querySelector: selector => selector === 'button[type="submit"]' ? button : controls.find(c => '#'+c.id===selector),
      addEventListener: (name,fn) => handlers.set(name,fn) };
    ids.set(id,result); return result;
  };
  const main=form('bookingForm',{bookingArrival:'2026-10-24',departure:'2026-10-25',guests:'2',guestEmail:'unused@example.com'});
  const quick=form('quickBookForm',{qbArrival:'2026-10-24',qbDeparture:'2026-10-25',qbGuests:'2'});
  const generic=()=>({classList:{add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector:()=>generic()});
  const roomLink={dataset:{bookRoom:'Double Bed Deluxe Executive'},addEventListener:(name,fn)=>hooks.set('room:'+name,fn)};
  const document={getElementById:id=>ids.get(id),createElement:()=>generic(),
    head:{appendChild:el=>ids.set(el.id,el)},body:{appendChild:el=>ids.set(el.id,el)},
    querySelectorAll:()=>[roomLink],addEventListener:(name,fn)=>hooks.set(name,fn)};
  vm.runInNewContext(fs.readFileSync(new URL('../assets/checkout.js',import.meta.url),'utf8'),
    {document,window:{location:{assign:url=>destinations.push(url)}},URL,Date,Set});
  hooks.get('DOMContentLoaded')();
  return {main,quick,hooks,destinations};
}

test('Quick Booking leaves its arrival, departure and guest controls enabled',()=>{
  const {quick}=fixture();
  assert.deepEqual(quick.controls.map(c=>c.disabled),[false,false,false]);
});
test('Quick Booking carries the selected dates and guests into the single hotel booking engine',()=>{
  const {quick,destinations}=fixture();
  quick.handlers.get('submit')({preventDefault(){}});
  const destination=new URL(destinations[0]);
  assert.equal(destination.origin,'https://app.hotelmedallion.com');
  assert.equal(destination.pathname,'/book/medallion');
  assert.equal(destination.searchParams.get('arrival'),'2026-10-24');
  assert.equal(destination.searchParams.get('departure'),'2026-10-25');
  assert.equal(destination.searchParams.get('adults'),'2');
});
test('Legacy contact fields stay disabled while the main arrival fields remain usable',()=>{
  const {main}=fixture();
  assert.deepEqual(main.controls.map(c=>c.disabled),[false,false,false,true]);
});
test('A room card carries its preferred category instead of creating another booking database record',()=>{
  const {hooks,destinations}=fixture();
  hooks.get('room:click')({preventDefault(){}});
  const destination=new URL(destinations[0]);
  assert.equal(destination.origin,'https://app.hotelmedallion.com');
  assert.equal(destination.searchParams.get('room'),'Double Bed Deluxe Executive');
});
