import{getStreamRealtimeGrant}from"./assets/js/realtime-grant.js?v=20260914-grant-handoff1";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const compatibility=applyStreamingCompatibility(document);
const root=document.querySelector("[data-stream-supported]");
const supportedModes=new Set(["radio"]);
const systemTest=document.documentElement.dataset.systemTest==="true";
let selectedMode="radio";
let grantReady=false;
let systemAccessReady=document.documentElement.dataset.systemAccessReady==="true";
let outputReady=false;
document.documentElement.dataset.broadcastPhase="prep";

const modeCopy={
  radio:{title:"ラジオ",copy:"音声だけで配信します。"},
  standing:{title:"立ち絵",copy:"2.5D Character Engine 接続後に利用できます。"}
};

function setState(name,text,state="waiting"){
  const el=document.querySelector(`[data-stream-state="${name}"]`);
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
}

function setFeedback(text,state="info"){
  const el=document.querySelector("[data-stream-feedback]");
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
}

function updateStartButton(){
  const button=document.querySelector("[data-stream-start]");
  const ready=systemTest?(grantReady||systemAccessReady):grantReady;
  if(button)button.disabled=!compatibility.supported||!ready||!supportedModes.has(selectedMode);
}

function refreshGrantState(){
  const grant=getStreamRealtimeGrant();
  grantReady=!!grant;
  setState("session",grantReady?"認可済み":"認可情報なし",grantReady?"ready":"waiting");
  updateStartButton();
}

function applyMode(mode,emit=true){
  if(!supportedModes.has(mode))return;
  selectedMode=mode;
  document.querySelectorAll("[data-stream-mode]").forEach(button=>{
    const active=button.dataset.streamMode===mode;
    button.classList.toggle("is-selected",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  const copy=modeCopy[mode];
  const title=document.querySelector("[data-stream-preview-title]");
  const text=document.querySelector("[data-stream-preview-copy]");
  if(title)title.textContent=copy.title;
  if(text)text.textContent=copy.copy;
  document.documentElement.dataset.streamMode=mode;
  if(mode==="radio"){
    setState("composition","対象外","ready");
    setFeedback("マイクを使って音声だけで配信します。");
  }else{
    setState("composition","接続待ち");
    setFeedback("立ち絵は2.5D Character Engine接続後に利用できます。");
  }
  const start=document.querySelector("[data-stream-start]");
  if(start)start.textContent=mode==="radio"?"ラジオ配信スタート":"配信スタート";
  updateStartButton();
  if(emit)window.dispatchEvent(new CustomEvent("orikuro:stream-mode-change",{detail:{mode}}));
}

if(compatibility.supported){
  setState("transport","対応","ready");
  setState("session","認可確認待ち");
  setState("composition","接続待ち");
  setState("audio","接続待ち");
  setState("output","接続待ち");
}

for(const button of document.querySelectorAll("[data-stream-mode]")){
  button.addEventListener("click",()=>applyMode(button.dataset.streamMode||""));
}
applyMode(selectedMode,false);

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

document.addEventListener("orikuro:system-access-ready",()=>{
  systemAccessReady=true;
  setState("session","開始時に接続","ready");
  updateStartButton();
});
document.addEventListener("orikuro:service-ready",refreshGrantState,{once:true});
if(document.querySelector("[data-service-content]")?.hidden===false){
  if(systemTest){
    systemAccessReady=document.documentElement.dataset.systemAccessReady==="true";
    updateStartButton();
  }else refreshGrantState();
}

window.addEventListener("orikuro:transport-ready",()=>{
  setState("transport","接続済み","ready");
});
window.addEventListener("orikuro:composition-ready",()=>setState("composition","準備完了","ready"));
window.addEventListener("orikuro:audio-ready",()=>setState("audio","準備完了","ready"));
window.addEventListener("orikuro:output-ready",()=>{
  outputReady=true;
  setState("output","送出可能","ready");
});
window.addEventListener("orikuro:stream-live",()=>{
  document.documentElement.dataset.broadcastPhase="live";
  startClock();
  const status=document.querySelector("[data-stream-status]");
  if(status)status.textContent="配信中";
  setFeedback("配信中","ready");
  const stop=document.querySelector("[data-audio-stop]");
  if(stop)stop.disabled=false;
});
window.addEventListener("orikuro:stream-start-failed",event=>{
  document.documentElement.dataset.broadcastPhase="prep";
  const message=event?.detail?.message||"配信を開始できませんでした。";
  setFeedback(message,"error");
  if(systemTest){
    grantReady=!!getStreamRealtimeGrant();
    updateStartButton();
  }else refreshGrantState();
  const stop=document.querySelector("[data-audio-stop]");
  if(stop)stop.disabled=true;
});
window.addEventListener("orikuro:stream-stop-failed",()=>{
  document.documentElement.dataset.broadcastPhase="live";
  setFeedback("配信終了を確認できませんでした。もう一度終了してください。","error");
  const stop=document.querySelector("[data-audio-stop]");
  if(stop)stop.disabled=false;
});

window.addEventListener("orikuro:stream-ended",event=>{
  stopClock();
  const reason=event?.detail?.reason||"ended";
  location.replace(`./stream-ended.html?reason=${encodeURIComponent(reason)}`);
});

const stopButton=document.querySelector("[data-audio-stop]");
if(stopButton){
  stopButton.addEventListener("click",()=>{
    stopButton.disabled=true;
    const status=document.querySelector("[data-stream-status]");
    if(status)status.textContent="停止処理中";
  });
}

const startButton=document.querySelector("[data-stream-start]");
if(startButton){
  startButton.addEventListener("click",()=>{
    const ready=systemTest?(grantReady||systemAccessReady):grantReady;
    if(!supportedModes.has(selectedMode)||!ready)return;
    startButton.disabled=true;
    document.documentElement.dataset.broadcastPhase="starting";
    const status=document.querySelector("[data-stream-status]");
    if(status)status.textContent="開始処理中";
    setFeedback(selectedMode==="radio"?"マイクを確認しています…":"立ち絵の入力経路を確認しています…","working");
    if(systemTest&&!grantReady){
      window.dispatchEvent(new CustomEvent("orikuro:system-start-request",{detail:{mode:selectedMode}}));
      return;
    }
    window.dispatchEvent(new CustomEvent("orikuro:stream-start-request",{detail:{mode:selectedMode}}));
  });
}

if(!compatibility.supported&&root)root.hidden=true;
