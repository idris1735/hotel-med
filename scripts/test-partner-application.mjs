import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url),handler=require('../api/partner-application');
const originalFetch=globalThis.fetch;
const input={id:'019a0000-0000-7000-8000-000000000001',full_name:'Ada Sample',email:'ada@example.com',phone:'08012345678',city:'Lagos',country:'Nigeria',organization:'Ada Travel',profile_url:'https://example.com',introduction:'I refer business guests.',consent:true};
const request=body=>({method:'POST',body,headers:{origin:'https://hotelmedallion.com','sec-fetch-site':'same-origin','x-vercel-forwarded-for':'192.0.2.3'}});
const reply=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}});
beforeEach(()=>{process.env.HOTELOS_SUPABASE_URL='https://loxvlxtnqoeixmwyyihh.supabase.co';process.env.HOTELOS_SUPABASE_ANON_KEY='public-test';process.env.WEBSITE_GATEWAY_SECRET='test-only-key';});
afterEach(()=>{globalThis.fetch=originalFetch;});
test('applications reject cross-origin and missing consent before contacting the backend',async()=>{
 let called=false;globalThis.fetch=async()=>{called=true;throw Error('Unexpected');};
 const res=reply();await handler({...request(input),headers:{origin:'https://evil.example','sec-fetch-site':'cross-site'}},res);assert.equal(res.statusCode,403);
 const res2=reply();await handler(request({...input,consent:false}),res2);assert.equal(res2.statusCode,400);assert.equal(called,false);
});
test('guarded submission forwards only application details and returns no secrets or bank data',async()=>{
 let saved;const calls=[];globalThis.fetch=async(url,options)=>{calls.push(url);if(String(url).endsWith('website-guard'))return Response.json({allowed:true});saved=JSON.parse(options.body);assert.equal(options.headers['x-website-key'],'test-only-key');return Response.json({received:true,message:'Application received.'});};
 const res=reply();await handler(request({...input,account_number:'0123456789'}),res);assert.equal(res.statusCode,200);assert.equal(saved.id,input.id);assert.equal(saved.account_number,undefined);assert.equal(calls.length,2);assert.equal(res.body.received,true);assert.ok(!JSON.stringify(res.body).includes('test-only-key'));
});
test('request budget failure cannot create an application',async()=>{
 let count=0;globalThis.fetch=async()=>{count++;return Response.json({}, {status:429});};const res=reply();await handler(request(input),res);assert.equal(res.statusCode,429);assert.equal(count,1);
});
test('the website form works without mailto and retries the same id after a network error',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../partners.html',import.meta.url),'utf8'),{url:'https://hotelmedallion.com/partners',runScripts:'outside-only'});
 try{const bodies=[];dom.window.fetch=async(url,options)=>{assert.equal(url,'/api/partner-application');bodies.push(JSON.parse(options.body));return bodies.length===1?Response.json({error:'Try again.'},{status:503}):Response.json({received:true});};dom.window.eval(fs.readFileSync(new URL('../assets/partners.js',import.meta.url),'utf8'));
 const form=dom.window.document.querySelector('#partner-application');for(const[name,value]of Object.entries(input)){if(form.elements[name]&&name!=='consent')form.elements[name].value=value;}form.elements.consent.checked=true;
 const submit=()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));submit();await new Promise(r=>setTimeout(r,10));submit();await new Promise(r=>setTimeout(r,10));
 assert.equal(bodies.length,2);assert.equal(bodies[0].id,bodies[1].id);assert.equal(bodies[0].id[14],'7');assert.equal(bodies[0].consent,true);assert.match(dom.window.document.querySelector('#application-result').textContent,/received/);
 dom.window.document.querySelector('.copy-partner-email').click();await new Promise(r=>setTimeout(r,10));assert.match(dom.window.document.querySelector('.email-copy-result').textContent,/info@hotelmedallion.com/);
 }finally{dom.window.close();}
});
