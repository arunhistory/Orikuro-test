import{getStreamRealtimeGrant}from"./assets/js/realtime-grant.js?v=20260914-grant-handoff1";
import{applyStreamingCompatibility}from"./stream-compat.js";

const compatibility=applyStreamingCompatibility(document);
const root=document.querySelector("[data-stream-supported]");
const supportedModes=new Set(["radio","standing"]);
let selectedMode="radio";
let grantReady=false;
let outputReady=false;

const modeCopy={
  radio:{title:"ラジオ配信",copy:"音声を中心に配信するテストモードです。"},
  standing:{title:"立ち絵配信",copy:"カメラで人体の動きを追跡し、通常の2D立ち絵を2.5Dキャラクターとして動かすテストモードです。"}
};

function setState(name,text,state="waiting"){
  const el=document.querySelector(`[data-stream-state="${name}"]`);
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
}

function updateStartButton(){
  const button=document.querySelector("[data-stream-start]");
  if(button)button.disabled=!compatibility.supported||!grantReady||!supportedModes.has(selectedMode);
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

document.addEventListener("orikuro:service-ready",refreshGrantState,{once:true});
if(document.querySelector("[data-service-content]")?.hidden===false)refreshGrantState();

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
  startClock();
  const status=document.querySelector("[data-stream-status]");
  if(status)status.textContent="配信中";
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
    if(!supportedModes.has(selectedMode)||!grantReady)return;
    startButton.disabled=true;
    const status=document.querySelector("[data-stream-status]");
    if(status)status.textContent="開始処理中";
    window.dispatchEvent(new CustomEvent("orikuro:stream-start-request",{detail:{mode:selectedMode}}));
  });
}

if(!compatibility.supported&&root)root.hidden=true;
