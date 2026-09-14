import{applyStreamingCompatibility}from"./stream-compat.js";

const compatibility=applyStreamingCompatibility(document);
const root=document.querySelector("[data-stream-supported]");
const supportedModes=new Set(["radio","standing"]);
let selectedMode="radio";

const modeCopy={
  radio:{title:"ラジオ配信",copy:"音声を中心に配信するテストモードです。"},
  standing:{title:"立ち絵配信",copy:"立ち絵を使用して配信するテストモードです。"}
};

function setState(name,text,state="waiting"){
  const el=document.querySelector(`[data-stream-state="${name}"]`);
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
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
  if(emit)window.dispatchEvent(new CustomEvent("orikuro:stream-mode-change",{detail:{mode}}));
}

if(compatibility.supported){
  setState("transport","対応","ready");
  setState("session","接続待ち");
  setState("composition","接続待ち");
  setState("audio","停止中");
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

function syncAudioState(){
  const status=document.querySelector("[data-audio-status]");
  if(!status)return;
  const text=(status.textContent||"").trim();
  if(text.includes("マイク送信中"))setState("audio","送信中","ready");
  else if(text.includes("停止中"))setState("audio","停止中","waiting");
  else if(text.includes("接続")||text.includes("確認"))setState("audio","接続中","waiting");
  else if(text)setState("audio",text,"waiting");
}

const audioStatus=document.querySelector("[data-audio-status]");
if(audioStatus){
  syncAudioState();
  new MutationObserver(syncAudioState).observe(audioStatus,{childList:true,characterData:true,subtree:true});
}

document.addEventListener("orikuro:service-ready",()=>{
  setState("session","認可済み","ready");
  startClock();
},{once:true});
window.addEventListener("orikuro:transport-ready",()=>{
  setState("session","接続済み","ready");
  setState("transport","接続済み","ready");
});
window.addEventListener("orikuro:composition-ready",()=>setState("composition","準備完了","ready"));
window.addEventListener("orikuro:audio-ready",()=>setState("audio","準備完了","ready"));
window.addEventListener("orikuro:output-ready",()=>setState("output","送出可能","ready"));
window.addEventListener("orikuro:stream-live",()=>{
  const status=document.querySelector("[data-stream-status]");
  if(status)status.textContent="配信中";
});
window.addEventListener("orikuro:stream-ended",event=>{
  stopClock();
  const reason=event?.detail?.reason||"ended";
  location.replace(`./stream-ended.html?reason=${encodeURIComponent(reason)}`);
});

if(!compatibility.supported&&root)root.hidden=true;
