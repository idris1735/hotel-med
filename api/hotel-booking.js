const {rpc,provider,guard,sameOrigin,signReceipt,readReceipt,uuid,validDates}=require('./_lib/hotel-os');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method==='GET') {
  try{return res.status(200).json(await rpc('public_room_catalog',{p_slug:'medallion'}));}
  catch{return res.status(503).json({error:'Live rates are temporarily unavailable. Check rates with reception.'});}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
 if(!sameOrigin(req))return res.status(403).json({error:'Please use the Hotel Medallion website.'});
 try{
  const b=req.body||{};
  if(JSON.stringify(b).length>12000)return res.status(413).json({error:'Request too large'});
  if(b.action==='availability'){
   validDates(b.arrival,b.departure);
   return res.status(200).json(await rpc('public_booking_options',{p_slug:'medallion',p_arrival:b.arrival,p_departure:b.departure}));
  }
  if(b.action==='reserve'){
   if(b.confirmed!==true||!uuid(b.room_type_id)||!uuid(b.ids?.booking_id)||!uuid(b.ids?.booking_room_id)||!uuid(b.ids?.guest_id)) throw new Error('Review and confirm your reservation details.');
   validDates(b.arrival,b.departure);
   if(!Number.isSafeInteger(b.expected_total)||b.expected_total<=0)throw new Error('Check the current room price first.');
   await guard(req,'booking');
   const booking=await rpc('public_create_web_booking',{p_slug:'medallion',p_booking_id:b.ids.booking_id,p_booking_room_id:b.ids.booking_room_id,p_guest_id:b.ids.guest_id,
    p_room_type_id:b.room_type_id,p_arrival:b.arrival,p_departure:b.departure,p_full_name:b.full_name,p_phone:b.phone,p_email:b.email,
    p_adults:b.adults,p_children:b.children??0,p_notes:b.notes||null,p_affiliate_code:b.affiliate_code||null,p_expected_total:b.expected_total});
   // Read only the public payment switch; never disclose guest/booking records.
   const options=await rpc('public_booking_options',{p_slug:'medallion',p_arrival:b.arrival,p_departure:b.departure}).catch(()=>null);
   let email='queued';try{const result=await provider({action:'dispatch_booking_email',booking_id:booking.booking_id});if(result.sent>0)email='sent';}catch{}
   return res.status(200).json({...booking,receipt:signReceipt(booking.booking_id),email_state:email,
    online_payment:options?.providers?.online_payment===true});
  }
  if(b.action==='checkout'){
   if(!uuid(b.payment_id))throw new Error('Invalid payment request. Try again.');
   const bookingId=readReceipt(b.receipt);await guard(req,'booking');
   const payment=await provider({action:'initialize_payment',booking_id:bookingId,payment_id:b.payment_id});
   if(payment.status==='paid')return res.status(200).json({status:'paid',reference:payment.reference});
   if(Number.isSafeInteger(b.expected_deposit)&&Number(payment.amount)!==b.expected_deposit){
    return res.status(409).json({error:'The deposit amount changed. Review the updated deposit before continuing.',deposit:Number(payment.amount)});
   }
   if(typeof payment.authorization_url!=='string')throw new Error('Payment checkout is not ready yet. Try again shortly.');
   const url=new URL(payment.authorization_url);
   if(url.protocol!=='https:'||!/(^|\.)globalpay\.(com\.ng|ng)$/.test(url.hostname))throw new Error('Payment link could not be verified. Contact reception.');
   return res.status(200).json({authorization_url:url.toString()});
  }
  return res.status(400).json({error:'Invalid booking action'});
 }catch(error){return res.status(error.status||400).json({error:error.message||'Could not complete your request.'});}
};
