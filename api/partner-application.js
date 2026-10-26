const hotel = require('./_lib/hotel-os');
module.exports = async function(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') {res.setHeader('Allow','POST');return res.status(405).json({error:'POST required'});}
 if(!hotel.sameOrigin(req))return res.status(403).json({error:'Please apply from hotelmedallion.com.'});
 try {
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body||JSON.stringify(body).length>10000||!hotel.uuid(body.id)||body.consent!==true)return res.status(400).json({error:'Complete your details and agree to be contacted.'});
  if(body.website_check)return res.status(400).json({error:'Please try again.'});
  for(const[field,max]of Object.entries({full_name:120,email:254,phone:40,city:120,country:100,introduction:2000})) {
   if(typeof body[field]!=='string'||!body[field].trim()||body[field].length>max)return res.status(400).json({error:'Check your name, email, phone, location and introduction.'});
  }
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(body.email)||body.introduction.trim().length<10)return res.status(400).json({error:'Enter a valid email and a short introduction.'});
  if(body.profile_url&&!/^https?:\/\//i.test(body.profile_url))return res.status(400).json({error:'Use a website address starting with https://.'});
  await hotel.guard(req,'booking');
  const url=process.env.HOTELOS_SUPABASE_URL,key=process.env.HOTELOS_SUPABASE_ANON_KEY,secret=process.env.WEBSITE_GATEWAY_SECRET;
  if(!url||new URL(url).hostname!=='loxvlxtnqoeixmwyyihh.supabase.co'||!key||!secret)throw Error('Applications are temporarily unavailable. Contact info@hotelmedallion.com.');
  const response=await fetch(url+'/functions/v1/partner-applications',{method:'POST',headers:{apikey:key,'Content-Type':'application/json','x-website-key':secret},
   body:JSON.stringify({id:body.id,full_name:body.full_name.trim(),email:body.email.trim().toLowerCase(),phone:body.phone.trim(),city:body.city.trim(),country:body.country.trim(),
    organization:body.organization||'',profile_url:body.profile_url||'',introduction:body.introduction.trim(),consent:true}),signal:AbortSignal.timeout(25000)});
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.received!==true)return res.status(response.status===429?429:response.status===400?400:503).json({error:result?.error||'Could not submit your application. Please try again.'});
  return res.status(200).json({received:true,message:result.message});
 }catch(error){return res.status(error.status===429?429:503).json({error:error.status===429?'Please wait a few minutes before trying again.':'Applications are temporarily unavailable. Please try again or contact info@hotelmedallion.com.'});}
};
