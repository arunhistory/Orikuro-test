import{applyStreamingCompatibility}from"./stream-compat.js";

const compatibility=applyStreamingCompatibility(document);
const root=document.querySelector("[data-stream-supported]");

function setState(name,text,state="waiting"){
  const el=document.querySelector(`[data-stream-state="${name}"]`);
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
}

if(compatibility.supported){
  setState("transport","対応","ready");
  setState("session","接続待ち");
  setState("composition","接続待ち");
  setState("audio","接続待ち");
  setState("output","接続待ち");
}

let startedAt=0;
let timer=0;
function startClock(){
  if(startedAt)return;
  startedAt=Date.now();
  const clock=document.querySelector("[data-stream-clock]");
  const tick=()=>{
    const sec=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
    const min=Math.floor(sec/60);
    const rem=sec%60;
    if(clock)clock.textContent=`${String(min).padStart(2,"0")}:${String(rem).padStart(2,"0")}`;
  };
  tick();
  timer=window.setInterval(tick,1000);
}
function stopClock(){
  if(timer)window.clearInterval(timer);
  timer=0;
}

window.addEventListener("orikuro:transport-ready",()=>{
  setState("session","接続済み","ready");
  setState("transport","接続済み","ready");
});
window.addEventListener("orikuro:composition-ready",()=>setState("composition","準備完了","ready"));
window.addEventListener("orikuro:audio-ready",()=>setState("audio","準備完了","ready"));
window.addEventListener("orikuro:output-ready",()=>{
  setState("output","送出可能","ready");
  const button=document.querySelector("[data-stream-start]");
  if(button)button.disabled=false;
});
window.addEventListener("orikuro:stream-live",()=>{
  startClock();
  const status=document.querySelector("[data-stream-status]");
  if(status)status.textContent="配信中";
});
window.addEventListener("orikuro:stream-ended",event=>{
  stopClock();
  const reason=event?.detail?.reason||"ended";
  location.replace(`./stream-ended.html?reason=${encodeURIComponent(reason)}`);
});

const startButton=document.querySelector("[data-stream-start]");
if(startButton){
  startButton.addEventListener("click",()=>{
    startButton.disabled=true;
    window.dispatchEvent(new CustomEvent("orikuro:stream-start-request"));
  });
}

if(!compatibility.supported&&root)root.hidden=true;
