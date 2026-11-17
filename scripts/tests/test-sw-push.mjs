import fs from "fs"; import vm from "vm";
let fails=0; const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m); if(!c)fails++;};
const src=fs.readFileSync("public/sw.js","utf8");
function make(clients=[]) {
  const handlers={}, shown=[], opened=[], navigated=[], focused=[];
  const self={ location:{origin:"https://the-van-radio.vercel.app"},
    addEventListener:(t,f)=>{handlers[t]=f;},
    registration:{showNotification:(t,o)=>{shown.push({t,o});return Promise.resolve();}},
    clients:{ matchAll:async()=>clients.map(u=>({url:u,focus:async()=>{focused.push(u);},navigate:async(x)=>{navigated.push(x);}})), openWindow:async(u)=>{opened.push(u);}, claim:async()=>{} },
    skipWaiting(){} };
  vm.runInNewContext(src,{self,caches:{open:async()=>({addAll:async()=>{}}),keys:async()=>[],delete:async()=>{}},URL,fetch:async()=>{},Promise,console});
  return {handlers,shown,opened,navigated,focused};
}
async function push(h,payload,raw){ let p; const ev={data: raw!==undefined?{json:()=>{throw new Error("bad")}}:(payload===null?null:{json:()=>payload}), waitUntil:x=>{p=x;}}; h.handlers.push(ev); await p; }
async function click(h,data){ let p,closed=false; h.handlers.notificationclick({notification:{data,close:()=>{closed=true}},waitUntil:x=>{p=x;}}); await p; return closed; }
let h=make();
await push(h,{title:"Εκπομπή Σαββάτου",body:"Ζωντανά σε 30'",url:"/live",tag:"show-1"});
ok(h.shown.length===1&&h.shown[0].t==="Εκπομπή Σαββάτου"&&h.shown[0].o.data.url==="/live"&&h.shown[0].o.tag==="show-1","valid push shows notification");
h=make(); await push(h,null); ok(h.shown.length===1&&h.shown[0].t==="THE VAN","empty push still shows a notification (userVisibleOnly)");
h=make(); await push(h,null,"bad"); ok(h.shown.length===1,"malformed payload still shows a notification");
for (const bad of ["https://evil.example/x","//evil.example","javascript:alert(1)","/a b","\\evil",123,undefined]) { h=make(); await push(h,{title:"t",url:bad}); ok(h.shown[0].o.data.url==="/","unsafe url "+JSON.stringify(bad)+" -> /"); }
h=make(); await push(h,{title:"x".repeat(500),body:"y".repeat(500)}); ok(h.shown[0].t.length===80&&h.shown[0].o.body.length===160,"title/body truncated");
h=make(["https://the-van-radio.vercel.app/old"]); let c=await click(h,{url:"/live"});
ok(c&&h.focused.length===1&&h.navigated[0]==="https://the-van-radio.vercel.app/live"&&h.opened.length===0,"click focuses+navigates existing window");
h=make(["https://other.example/"]); await click(h,{url:"/live"}); ok(h.opened[0]==="https://the-van-radio.vercel.app/live","click opens new window when none of ours");
h=make([]); await click(h,{url:"https://evil.example"}); ok(h.opened[0]==="https://the-van-radio.vercel.app/","click with hostile url opens home");
h=make([]); await click(h,undefined); ok(h.opened[0]==="https://the-van-radio.vercel.app/","click without data opens home");
console.log(fails?"FAILS "+fails:"ALL PASS"); process.exit(fails?1:0);
