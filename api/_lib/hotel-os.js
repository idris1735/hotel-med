// Public booking capabilities only. Never load a Supabase service key here.
const { createHmac, timingSafeEqual } = require('node:crypto');
const ALLOWED_ORIGINS = new Set(['https://hotelmedallion.com','https://www.hotelmedallion.com']);
function config() {
  const url = process.env.HOTELOS_SUPABASE_URL;
  const key = process.env.HOTELOS_SUPABASE_ANON_KEY;
  const secret = process.env.WEBSITE_GATEWAY_SECRET;
  if (!url || !key || !secret || new URL(url).hostname !== 'loxvlxtnqoeixmwyyihh.supabase.co') throw new Error('Live booking is temporarily unavailable. Please contact reception.');
  return { url, key, secret };
}
async function rpc(name, args) {
  const c = config();
  const response = await fetch(`${c.url}/rest/v1/rpc/${name}`, { method:'POST', signal:AbortSignal.timeout(15000),
    headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store' });
  const data = await response.json().catch(()=>null);
  if (!response.ok) throw new Error(data?.message || 'Live booking is temporarily unavailable.');
  return data;
}
async function provider(body) {
  const c=config();
  const response=await fetch(`${c.url}/functions/v1/booking-providers`,{method:'POST',signal:AbortSignal.timeout(25000),
    headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.error) throw new Error(data?.error||'Payment is temporarily unavailable. Your reservation has not been lost.');
  return data;
}
function sameOrigin(req) {
  const origin=req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin) && !(process.env.NODE_ENV!=='production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) return false;
  return req.headers['sec-fetch-site']!=='cross-site';
}
async function guard(req,kind) {
  const c=config();
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const key=createHmac('sha256',c.secret).update('request-budget:'+ip).digest('hex');
  const response=await fetch(`${c.url}/functions/v1/website-guard`,{method:'POST',signal:AbortSignal.timeout(10000),
    headers:{'x-website-key':c.secret,'Content-Type':'application/json',apikey:c.key},body:JSON.stringify({key,kind})});
  if(!response.ok) { const error=new Error(response.status===429?'Please wait a few minutes before trying again.':'Booking assistance is temporarily unavailable. Please contact reception.'); error.status=response.status===429?429:503; throw error; }
}
function signReceipt(bookingId) {
  const payload=Buffer.from(JSON.stringify({booking_id:bookingId,exp:Date.now()+2*60*60*1000})).toString('base64url');
  return payload+'.'+createHmac('sha256',config().secret).update('checkout:'+payload).digest('base64url');
}
function readReceipt(value) {
  if(typeof value!=='string'||value.length>1024||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(value)) throw new Error('Open the reservation you just made to continue payment.');
  const [payload,signature,extra]=value.split('.');
  const expected=createHmac('sha256',config().secret).update('checkout:'+payload).digest();
  const actual=Buffer.from(signature||'','base64url');
  if(extra||actual.length!==expected.length||!timingSafeEqual(actual,expected)) throw new Error('Invalid reservation access.');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString());
  if(!Number.isFinite(data.exp)||data.exp<Date.now()||!uuid(data.booking_id)) throw new Error('This payment access expired. Contact reception with your reference.');
  return data.booking_id;
}
function uuid(value) { return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validDates(arrival,departure) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(arrival||'')||!/^\d{4}-\d{2}-\d{2}$/.test(departure||'')) throw new Error('Choose arrival and departure dates.');
}
module.exports={rpc,provider,guard,sameOrigin,signReceipt,readReceipt,uuid,validDates};
