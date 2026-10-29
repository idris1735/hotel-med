// Live room-card prices + the single booking hand-off for the marketing site.
// Hotel OS owns availability, prices and reservations, so every "book" action
// goes straight to the live booking engine — no second booking surface here.
(function(){
 'use strict';
 const money=(value)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(value/100);
 const escape=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const normalize=value=>String(value||'').toLowerCase().replace(/medallion|deluxe/g,'').replace(/[^a-z0-9]/g,'');
 function matchRoom(rooms,name){
  if(!name)return null;
  const direct=rooms.find(r=>r.id===name||normalize(r.name)===normalize(name));if(direct)return direct;
  if(/double.*bed|bed.*double/i.test(name))return rooms.find(r=>/double.*bed|bed.*double/i.test(r.name))||null;
  return null;
 }
 const BOOKING_URL='https://app.hotelmedallion.com/book/medallion';
 function rememberedName(){try{return localStorage.getItem('medallion.remembered-name')||'';}catch{return '';}}
 function forget(){try{localStorage.removeItem('medallion.remembered-name');}catch{}document.dispatchEvent(new CustomEvent('medallion-profile-changed'));}
 // Send the guest straight to the live booking engine with their room and dates
 // pre-filled. Carries the affiliate referral so partner links keep attribution.
 function open(initial={}){
  const url=new URL(BOOKING_URL);
  const ref=initial.ref||window.MedallionCheckout?.referralCode?.()||'';
  const params={room:initial.room,arrival:initial.arrival,departure:initial.departure,adults:initial.adults,children:initial.children,ref};
  for(const[key,value]of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  window.location.assign(url.toString());
 }
 async function refreshPrices(){let data;try{const r=await fetch('/api/hotel-booking',{cache:'no-store'});if(!r.ok)throw new Error();data=await r.json();}catch{document.querySelectorAll('.room-price').forEach(el=>{el.textContent='Check live rates';delete el.dataset.ngn;delete el.dataset.usd;});return;}
  document.querySelectorAll('.room-price').forEach(el=>{const parent=el.closest('.room-card,.room-content,.room-price-section')||el.parentElement;const name=el.closest('.room-card')?.querySelector('.room-name')?.textContent||document.querySelector('h1')?.textContent||parent.querySelector('.room-name,h2,h3')?.textContent||'';const room=matchRoom(data.room_types,name);if(!room){el.textContent='Contact us for availability';delete el.dataset.ngn;delete el.dataset.usd;return;}el.dataset.ngn=String(room.nightly_rate/100);delete el.dataset.usd;el.innerHTML=`${escape(money(room.nightly_rate))} <small>per night · dates may vary</small>`;});document.dispatchEvent(new CustomEvent('medallion-rates-updated'));
 }
 document.addEventListener('DOMContentLoaded',()=>{void refreshPrices();setInterval(()=>{if(!document.hidden)void refreshPrices();},60000);});window.addEventListener('focus',()=>void refreshPrices());
 window.MedallionBooking={open,matchRoom,rememberedName,forget,refreshPrices};
})();
