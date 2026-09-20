import{getStreamRealtimeGrant}from"./assets/js/realtime-grant.js?v=20260914-grant-handoff1";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const compatibility=applyStreamingCompatibility(document);
const root=document.querySelector("[data-stream-supported]");
const systemTest=document.documentElement.dataset.systemTest==="true";
const supportedModes=new Set(["radio"]);
const radioPresets=new Map([
  ["solid-1",{label:"黒",color:"#000000"}],
  ["solid-2",{label:"白",color:"#FFFFFF"}],
  ["solid-3",{label:"赤",color:"#C62828"}],
  ["solid-4",{label:"青",color:"#1565C0"}],
  ["solid-5",{label:"緑",color:"#2E7D32"}],
  ["solid-6",{label:"紫",color:"#6A1B9A"}],
]);

let currentStep=1;
let selectedMode="";
let backgroundChoice="";
let standingChoice="";
let selectedAudioInputDeviceId="";
let micDevicesKnown=false;
let micPermissionConfirmed=false;
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
  if(step===2)return radioPresets.has(backgroundChoice);
  if(step===3)return standingChoice==="none";
  if(step===4)return streamTitleValue().length>0&&micPermissionConfirmed&&micDevicesKnown&&selectedAudioInputDeviceId.length>0;
  if(step===5)return readyForStep(1)&&readyForStep(2)&&readyForStep(3)&&readyForStep(4);
  return false;
}

function sessionReady(){
  return systemTest?(grantReady||systemAccessReady):grantReady;
}

function streamTitleValue(){
  return document.querySelector("[data-stream-title]")?.value.trim()||"";
}

function streamSubtitleValue(){
  return document.querySelector("[data-stream-subtitle]")?.value.trim()||"";
}

function currentMicLabel(){
  const select=document.querySelector("[data-mic-device]");
  if(!(select instanceof HTMLSelectElement)||select.selectedIndex<0)return micDevicesKnown?"認識済み":"未確認";
  return select.options[select.selectedIndex]?.textContent||"端末の標準マイク";
}

function updateStreamIdentity(){
  const title=streamTitleValue();
  const subtitle=streamSubtitleValue();
  document.querySelectorAll("[data-stream-preview-title],[data-live-stream-title]").forEach(el=>{
    el.textContent=title||"枠タイトルを入力";
  });
  document.querySelectorAll("[data-stream-preview-subtitle],[data-live-stream-subtitle]").forEach(el=>{
    el.textContent=subtitle||"サブタイトル未設定";
  });
}

function updateSummary(){
  const mode=document.querySelector("[data-summary-mode]");
  const background=document.querySelector("[data-summary-background]");
  const standing=document.querySelector("[data-summary-standing]");
  const mic=document.querySelector("[data-summary-mic]");
  if(mode)mode.textContent=selectedMode==="radio"?"ラジオ":"未選択";
  if(background)background.textContent=radioPresets.get(backgroundChoice)?.label||"未選択";
  if(standing)standing.textContent=standingChoice==="none"?"なし":"未選択";
  if(mic)mic.textContent=currentMicLabel();
  updateStreamIdentity();
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
  if(step===4&&!micPermissionConfirmed)void refreshAudioInputs(true);
}

function applyMode(mode){
  if(!supportedModes.has(mode))return;
  selectedMode=mode;
  document.documentElement.dataset.streamMode=mode;
  function setMicDeviceStatus(text,state="waiting"){
  const el=document.querySelector("[data-mic-device-status]");
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
}

function dispatchAudioInputSelection(){
  window.dispatchEvent(new CustomEvent("orikuro:audio-input-change",{detail:{deviceId:selectedAudioInputDeviceId}}));
}

async function refreshAudioInputs(requestPermission=false){
  const media=navigator.mediaDevices;
  const select=document.querySelector("[data-mic-device]");
  if(!(select instanceof HTMLSelectElement)||!media?.enumerateDevices||!media?.getUserMedia){
    if(select)select.disabled=true;
    setMicDeviceStatus("このブラウザではマイク機材の取得に対応していません。","error");
    return;
  }
  let permissionStream=null;
  let activeDeviceId="";
  try{
    if(requestPermission){
      micPermissionConfirmed=false;
      micDevicesKnown=false;
      selectedAudioInputDeviceId="";
      setMicDeviceStatus("マイクの利用許可と機材を確認しています…","working");
      updateWizard();
      permissionStream=await media.getUserMedia({audio:true,video:false});
      micPermissionConfirmed=true;
      activeDeviceId=permissionStream.getAudioTracks()[0]?.getSettings?.().deviceId||"";
    }
    const devices=(await media.enumerateDevices()).filter(device=>device.kind==="audioinput");
    const previous=selectedAudioInputDeviceId||activeDeviceId;
    select.replaceChildren();
    if(devices.length===0){
      const option=document.createElement("option");
      option.value="";
      option.textContent="認識できるマイクなし";
      select.append(option);
      select.disabled=true;
      selectedAudioInputDeviceId="";
      micDevicesKnown=true;
      setMicDeviceStatus("ブラウザが認識できるマイク入力がありません。","error");
      updateWizard();
      dispatchAudioInputSelection();
      return;
    }
    devices.forEach((device,index)=>{
      const option=document.createElement("option");
      option.value=device.deviceId;
      option.textContent=device.label||`マイク ${index+1}`;
      select.append(option);
    });
    const selected=devices.find(device=>device.deviceId===previous)
      ||devices.find(device=>device.deviceId==="default")
      ||devices[0];
    selectedAudioInputDeviceId=selected?.deviceId||"";
    select.value=selectedAudioInputDeviceId;
    select.disabled=false;
    micDevicesKnown=true;
    const label=selected?.label||select.options[select.selectedIndex]?.textContent||"マイク";
    setMicDeviceStatus(`${devices.length}台のマイク入力を認識しました。使用: ${label}`,"ready");
    updateWizard();
    dispatchAudioInputSelection();
  }catch(error){
    const name=error instanceof DOMException?error.name:"";
    const message=name==="NotAllowedError"
      ?"マイクの利用が許可されていません。Safariのマイク許可を確認してください。"
      :name==="NotFoundError"
        ?"使用できるマイクが見つかりません。"
        :"マイク機材を確認できませんでした。";
    micPermissionConfirmed=false;
    micDevicesKnown=false;
    selectedAudioInputDeviceId="";
    select.disabled=true;
    setMicDeviceStatus(message,"error");
    updateWizard();
  }finally{
    permissionStream?.getTracks().forEach(track=>track.stop());
  }
}

document.querySelectorAll("[data-stream-mode]").forEach(button=>{
    const active=button.dataset.streamMode===mode;
    button.classList.toggle("is-selected",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  setState("composition","対象外","ready");
  updateWizard();
  window.dispatchEvent(new CustomEvent("orikuro:stream-mode-change",{detail:{mode}}));
}

function applyBackgroundPreset(presetId){
  const preset=radioPresets.get(presetId);
  if(!preset)return;
  backgroundChoice=presetId;
  document.documentElement.dataset.radioPresetId=presetId;
  document.querySelectorAll("[data-radio-background]").forEach(el=>{
    el.dataset.radioPreset=presetId;
    el.style.setProperty("--radio-background-color",preset.color);
  });
  document.querySelectorAll("[data-radio-preset]").forEach(button=>{
    const active=button.dataset.radioPreset===presetId;
    button.classList.toggle("is-selected",active);
    button.setAttribute("aria-pressed",active?"true":"false");
  });
  updateWizard();
  window.dispatchEvent(new CustomEvent("orikuro:radio-background-change",{detail:{presetId,color:preset.color}}));
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
document.querySelectorAll("[data-radio-preset]").forEach(button=>{
  button.addEventListener("click",()=>applyBackgroundPreset(button.dataset.radioPreset||""));
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
document.querySelector("[data-stream-title]")?.addEventListener("input",()=>updateWizard());
document.querySelector("[data-stream-subtitle]")?.addEventListener("input",()=>updateWizard());
document.querySelector("[data-mic-device]")?.addEventListener("change",event=>{
  const select=event.currentTarget;
  if(!(select instanceof HTMLSelectElement))return;
  selectedAudioInputDeviceId=select.value;
  setMicDeviceStatus(`使用するマイク: ${currentMicLabel()}`,"ready");
  updateSummary();
  dispatchAudioInputSelection();
});
document.querySelector("[data-mic-test-toggle]")?.addEventListener("click",event=>{
  const button=event.currentTarget;
  const panel=document.querySelector("[data-mic-test]");
  if(!(button instanceof HTMLButtonElement)||!panel)return;
  const show=panel.hidden;
  panel.hidden=!show;
  button.setAttribute("aria-expanded",show?"true":"false");
  button.textContent=show?"マイクテストを隠す":"マイクテストを表示";
});
navigator.mediaDevices?.addEventListener?.("devicechange",()=>{
  if(micDevicesKnown)void refreshAudioInputs(false);
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
void refreshAudioInputs(false);

window.addEventListener("orikuro:transport-ready",()=>setState("transport","接続済み","ready"));
window.addEventListener("orikuro:composition-ready",()=>setState("composition","準備完了","ready"));
window.addEventListener("orikuro:audio-ready",()=>setState("audio","準備完了","ready"));
window.addEventListener("orikuro:audio-device-active",event=>{
  const detail=event?.detail||{};
  const label=typeof detail.label==="string"&&detail.label.trim()?detail.label.trim():currentMicLabel();
  setMicDeviceStatus(`使用中: ${label}`,"ready");
});
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
  document.querySelectorAll("[data-mic-test]").forEach(el=>el.hidden=true);
  const micToggle=document.querySelector("[data-mic-test-toggle]");
  if(micToggle instanceof HTMLButtonElement){
    micToggle.setAttribute("aria-expanded","false");
    micToggle.textContent="マイクテストを表示";
  }
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
  const micToggle=document.querySelector("[data-mic-test-toggle]");
  if(micToggle instanceof HTMLButtonElement){
    micToggle.setAttribute("aria-expanded","false");
    micToggle.textContent="マイクテストを表示";
  }
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
    window.dispatchEvent(new CustomEvent("orikuro:system-start-request",{detail:{mode:selectedMode,radioPresetId:backgroundChoice}}));
    return;
  }
  window.dispatchEvent(new CustomEvent("orikuro:stream-start-request",{detail:{mode:selectedMode,radioPresetId:backgroundChoice}}));
});

if(!compatibility.supported&&root)root.hidden=true;
