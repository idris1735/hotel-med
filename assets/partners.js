(function () {
  'use strict';
  const application = document.getElementById('partner-application');
  const result = document.getElementById('application-result');
  let pending = false, attempt = null;
  function newId(){const b=crypto.getRandomValues(new Uint8Array(16));let time=Date.now();for(let i=5;i>=0;i--){b[i]=time%256;time=Math.floor(time/256);}b[6]=(b[6]&15)|112;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
  application?.addEventListener('submit',async event=>{
    event.preventDefault();if(pending||!application.reportValidity())return;
    const fields=Object.fromEntries(new FormData(application));fields.consent=application.elements.consent.checked;
    const signature=JSON.stringify(fields);if(attempt?.signature!==signature)attempt={signature,id:newId()};
    const button=application.querySelector('button[type=submit]');pending=true;button.disabled=true;button.textContent='Sending…';result.hidden=true;
    try{const response=await fetch('/api/partner-application',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,id:attempt.id})});
      const data=await response.json();if(!response.ok||!data.received)throw Error(data.error||'Could not submit. Please try again.');
      application.reset();attempt=null;result.textContent='Thank you. Your application has been received. We’ll review it and contact you by email. Your partner account is created only after approval.';result.dataset.state='success';
    }catch(error){result.textContent=error.message||'Could not submit. Try again or contact info@hotelmedallion.com.';result.dataset.state='error';}
    finally{pending=false;button.disabled=false;button.textContent='Send application ↗';result.hidden=false;result.focus();}
  });
  document.querySelector('.copy-partner-email')?.addEventListener('click',async()=>{
    const message=document.querySelector('.email-copy-result');
    try{await navigator.clipboard.writeText('info@hotelmedallion.com');message.textContent='Email address copied.';}
    catch{message.textContent='Copy this address: info@hotelmedallion.com';}
  });
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('partner-nav');
  if (!toggle || !menu) return;
  function closeMenu() {
    menu.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu');
  }
  toggle.addEventListener('click', function () {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    menu.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  menu.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { closeMenu(); toggle.focus(); }
  });
})();
