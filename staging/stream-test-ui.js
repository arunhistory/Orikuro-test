import{getStreamRealtimeGrant}from"./assets/js/realtime-grant.js?v=20260914-grant-handoff1";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const compatibility=applyStreamingCompatibility(document);
const root=document.querySelector("[data-stream-supported]");
const systemTest=document.documentElement.dataset.systemTest==="true";
const supportedModes=new Set(["radio"]);

let currentStep=1;
let selectedMode="";
let backgroundChoice="";
let standingChoice="";
let backgroundObjectUrl="";
let grantReady=false;
let systemAccessReady=document.documentElement.dataset.systemAccessReady==="true";
let startedAt=0;
let timer=0;
document.documentElement.dataset.broadcastPhase="prep";

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

function readyForStep(step){
  if(step===1)return supportedModes.has(selectedMode);
  if(step===2)return backgroundChoice==="default"||backgroundChoice==="custom";
  if(step===3)return standingChoice==="none";
  if(step===4)return true;
  if(step===5)return readyForStep(1)&&readyForStep(2)&&readyForStep(3);
  return false;
}

function sessionReady(){
  return systemTest?(grantReady||systemAccessReady):grantReady;
}

function updateSummary(){
  const mode=document.querySelector("[data-summary-mode]");
  const background=document.querySelector("[data-summary-background]");
  const standing=document.querySelector("[data-summary-standing]");
  if(mode)mode.textContent=selectedMode==="radio"?"ラジオ":"未選択";
  if(background)background.textContent=backgroundChoice==="custom"?"端末画像":backgroundChoice==="default"?"標準背景":"未選択";
  if(standing)standing.textContent=standingChoice==="none"?"なし":"未選択";
}

function updateWizard(){
  document.querySelectorAll("[data-wizard-step]").forEach(panel=>{
    panel.hidden=Number(panel.dataset.wizardStep)!==currentStep;
  });
  document.querySelectorAll("[data-progress-step]").forEach(item=>{
    const step=Number(item.dataset.progressStep);
    item.classList.toggle("is-current",step===currentStep);
    item.classList.toggle("is-complete",step<currentStep);
  });
  const back=document.querySelector("[data-wizard-back]");
  const next=document.querySelector("[data-wizard-next]");
  const start=document.querySelector("[data-stream-start]");
  if(back)back.hidden=currentStep===1;
  if(next){
    next.hidden=currentStep===5;
    next.disabled=!readyForStep(currentStep);
  }
  if(start){
    start.hidden=currentStep!==5;
    start.disabled=currentStep!==5||!readyForStep(5)||!sessionReady()||!compatibility.supported;
  }
  updateSummary();
}

function goStep(step){
  if(step<1||step>5)return;
  currentStep=step;
  updateWizard();
}

function applyMode(mode){
  if(!supportedModes.has(mode))return;
  selectedMode=mode;
  document.documentElement.dataset.streamMode=mode;
  document.querySelectorAll("[data-stream-mode]").forEach(button=>{
    const active=button.dataset.streamMode===mode;
    button.classList.toggle("is-selected",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  setState("composition","対象外","ready");
  updateWizard();
  window.dispatchEvent(new CustomEvent("orikuro:stream-mode-change",{detail:{mode}}));
}

function applyBackgroundToImages(){
  document.querySelectorAll("[data-radio-background-image]").forEach(image=>{
    if(!(image instanceof HTMLImageElement))return;
    if(backgroundChoice==="custom"&&backgroundObjectUrl){
      image.src=backgroundObjectUrl;
      image.hidden=false;
    }else{
      image.removeAttribute("src");
      image.hidden=true;
    }
  });
  document.querySelectorAll("[data-radio-background]").forEach(el=>{
    el.dataset.backgroundChoice=backgroundChoice||"none";
  });
  document.querySelector("[data-background-default]")?.classList.toggle("is-selected",backgroundChoice==="default");
  document.querySelector("[data-background-default]")?.setAttribute("aria-pressed",backgroundChoice==="default"?"true":"false");
  document.querySelector("[data-background-custom-label]")?.classList.toggle("is-selected",backgroundChoice==="custom");
  updateWizard();
}

function useDefaultBackground(){
  if(backgroundObjectUrl){
    URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl="";
  }
  backgroundChoice="default";
  applyBackgroundToImages();
}

function useCustomBackground(file){
  if(!(file instanceof File)||!file.type.startsWith("image/"))return;
  if(backgroundObjectUrl)URL.revokeObjectURL(backgroundObjectUrl);
  backgroundObjectUrl=URL.createObjectURL(file);
  backgroundChoice="custom";
  applyBackgroundToImages();
}

function applyStanding(choice){
  if(choice!=="none")return;
  standingChoice=choice;
  document.querySelectorAll("[data-standing-choice]").forEach(button=>{
    const active=button.dataset.standingChoice===choice;
    button.classList.toggle("is-selected",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  updateWizard();
}

function refreshGrantState(){
  grantReady=!!getStreamRealtimeGrant();
  setState("session",grantReady?"認可済み":"認可情報なし",grantReady?"ready":"waiting");
  updateWizard();
}

function startClock(){
  if(startedAt)return;
  startedAt=Date.now();
  const tick=()=>{
    const sec=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
    const min=Math.floor(sec/60);
    const rem=sec%60;
    document.querySelectorAll("[data-stream-clock]").forEach(clock=>{
      clock.textContent=`${String(min).padStart(2,"0")}:${String(rem).padStart(2,"0")}`;
    });
  };
  tick();
  timer=window.setInterval(tick,1000);
}

function stopClock(){
  if(timer)window.clearInterval(timer);
  timer=0;
  startedAt=0;
}

function setMicMonitor(level=0,status="配信開始後に確認",state="waiting"){
  const normalized=Math.max(0,Math.min(1,Number(level)||0));
  document.querySelectorAll("[data-mic-meter-fill]").forEach(fill=>fill.style.transform=`scaleX(${normalized})`);
  document.querySelectorAll("[data-mic-meter]").forEach(value=>value.setAttribute("aria-valuenow",String(Math.round(normalized*100))));
  document.querySelectorAll("[data-mic-path-status]").forEach(label=>label.textContent=status);
  document.querySelectorAll("[data-mic-test]").forEach(monitor=>monitor.dataset.state=state);
}

document.querySelectorAll("[data-stream-mode]").forEach(button=>{
  button.addEventListener("click",()=>applyMode(button.dataset.streamMode||""));
});
document.querySelector("[data-background-default]")?.addEventListener("click",useDefaultBackground);
document.querySelector("[data-background-file]")?.addEventListener("change",event=>{
  const input=event.currentTarget;
  if(!(input instanceof HTMLInputElement))return;
  const file=input.files?.[0];
  if(file)useCustomBackground(file);
  input.value="";
});
document.querySelectorAll("[data-standing-choice]").forEach(button=>{
  button.addEventListener("click",()=>applyStanding(button.dataset.standingChoice||""));
});
document.querySelector("[data-wizard-next]")?.addEventListener("click",()=>{
  if(readyForStep(currentStep))goStep(currentStep+1);
});
document.querySelector("[data-wizard-back]")?.addEventListener("click",()=>{
  if(currentStep>1)goStep(currentStep-1);
});

if(compatibility.supported){
  setState("transport","対応","ready");
  setState("session","認可確認待ち");
  setState("composition","対象外","ready");
  setState("audio","接続待ち");
  setState("output","接続待ち");
}

setMicMonitor();
updateWizard();

document.addEventListener("orikuro:system-access-ready",()=>{
  systemAccessReady=true;
  setState("session","開始時に接続","ready");
  updateWizard();
});
document.addEventListener("orikuro:service-ready",refreshGrantState,{once:true});
if(document.querySelector("[data-service-content]")?.hidden===false){
  if(systemTest){
    systemAccessReady=document.documentElement.dataset.systemAccessReady==="true";
    updateWizard();
  }else refreshGrantState();
}

window.addEventListener("orikuro:transport-ready",()=>setState("transport","接続済み","ready"));
window.addEventListener("orikuro:composition-ready",()=>setState("composition","準備完了","ready"));
window.addEventListener("orikuro:audio-ready",()=>setState("audio","準備完了","ready"));
window.addEventListener("orikuro:audio-path-waiting",()=>setMicMonitor(0,"リスナー到達を確認中…","working"));
window.addEventListener("orikuro:audio-path-ready",()=>setMicMonitor(0,"リスナー到達 OK","ready"));
window.addEventListener("orikuro:audio-meter",event=>{
  const detail=event?.detail||{};
  const level=Number(detail.level)||0;
  const acknowledged=detail.pathAcknowledged===true;
  setMicMonitor(level,acknowledged?"リスナー到達 OK":"到達確認中…",acknowledged?"ready":"working");
});
window.addEventListener("orikuro:audio-meter-reset",()=>setMicMonitor());
window.addEventListener("orikuro:output-ready",()=>setState("output","送出可能","ready"));

window.addEventListener("orikuro:stream-live",()=>{
  document.documentElement.dataset.broadcastPhase="live";
  document.querySelector("[data-broadcast-wizard]")?.setAttribute("hidden","");
  document.querySelector("[data-live-screen]")?.removeAttribute("hidden");
  document.querySelectorAll("[data-mic-test]").forEach(el=>el.hidden=false);
  startClock();
  document.querySelectorAll("[data-stream-status]").forEach(status=>status.textContent="配信中");
  const stop=document.querySelector("[data-audio-stop]");
  if(stop)stop.disabled=false;
});

window.addEventListener("orikuro:stream-start-failed",event=>{
  document.documentElement.dataset.broadcastPhase="prep";
  document.querySelector("[data-live-screen]")?.setAttribute("hidden","");
  document.querySelector("[data-broadcast-wizard]")?.removeAttribute("hidden");
  document.querySelectorAll("[data-mic-test]").forEach(el=>el.hidden=true);
  setMicMonitor();
  const message=event?.detail?.message||"配信を開始できませんでした。";
  goStep(5);
  setFeedback(message,"error");
  if(systemTest){
    grantReady=!!getStreamRealtimeGrant();
    updateWizard();
  }else refreshGrantState();
});

window.addEventListener("orikuro:stream-stop-failed",()=>{
  document.documentElement.dataset.broadcastPhase="live";
  setMicMonitor(0,"終了確認に失敗","error");
  const stop=document.querySelector("[data-audio-stop]");
  if(stop)stop.disabled=false;
});

window.addEventListener("orikuro:stream-ended",event=>{
  stopClock();
  const reason=event?.detail?.reason||"ended";
  location.replace(`./stream-ended.html?reason=${encodeURIComponent(reason)}`);
});

const stopButton=document.querySelector("[data-audio-stop]");
stopButton?.addEventListener("click",()=>{
  stopButton.disabled=true;
  document.querySelectorAll("[data-stream-status]").forEach(status=>status.textContent="停止処理中");
});

const startButton=document.querySelector("[data-stream-start]");
startButton?.addEventListener("click",()=>{
  if(currentStep!==5||!readyForStep(5)||!sessionReady()||!supportedModes.has(selectedMode))return;
  startButton.disabled=true;
  document.documentElement.dataset.broadcastPhase="starting";
  setFeedback("マイクを確認しています…","working");
  if(systemTest&&!grantReady){
    window.dispatchEvent(new CustomEvent("orikuro:system-start-request",{detail:{mode:selectedMode}}));
    return;
  }
  window.dispatchEvent(new CustomEvent("orikuro:stream-start-request",{detail:{mode:selectedMode}}));
});

window.addEventListener("pagehide",()=>{
  if(backgroundObjectUrl){
    URL.revokeObjectURL(backgroundObjectUrl);
    backgroundObjectUrl="";
  }
},{once:true});

if(!compatibility.supported&&root)root.hidden=true;
