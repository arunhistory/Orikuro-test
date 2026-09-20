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
let micPermissionRequest=null;
let preparedAudioStream=null;
let grantReady=false;
let realtimeReady=false;
let systemPreparationRequested=false;
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

function preparedAudioTrack(){
  const track=preparedAudioStream?.getAudioTracks?.()[0]||null;
  return track&&track.readyState==="live"?track:null;
}

function micReady(){
  return micPermissionConfirmed&&micDevicesKnown&&selectedAudioInputDeviceId.length>0&&!!preparedAudioTrack();
}

function readyForStep(step){
  if(step===1)return supportedModes.has(selectedMode)&&micReady();
  if(step===2)return radioPresets.has(backgroundChoice);
  if(step===3)return standingChoice==="none";
  if(step===4)return streamTitleValue().length>0&&micReady();
  if(step===5)return readyForStep(1)&&readyForStep(2)&&readyForStep(3)&&readyForStep(4);
  return false;
}

function sessionReady(){
  return grantReady&&realtimeReady;
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
  const footer=document.querySelector(".broadcast-wizard-footer");
  footer?.classList.toggle("is-first-step",currentStep===1);
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

function setMicPermissionStatus(text,state="waiting"){
  const el=document.querySelector("[data-mic-permission-status]");
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
}

function setMicDeviceStatus(text,state="waiting"){
  const el=document.querySelector("[data-mic-device-status]");
  if(!el)return;
  el.textContent=text;
  el.dataset.state=state;
}

function dispatchAudioInputSelection(){
  window.dispatchEvent(new CustomEvent("orikuro:audio-input-change",{detail:{deviceId:selectedAudioInputDeviceId}}));
}

function audioCaptureConstraints(deviceId=""){
  const audio={
    echoCancellation:false,
    noiseSuppression:false,
    autoGainControl:false,
  };
  if(deviceId)audio.deviceId={exact:deviceId};
  return {audio,video:false};
}

function publishPreparedAudioStream(stream){
  const track=stream?.getAudioTracks?.()[0]||null;
  if(!track||track.readyState!=="live")throw new DOMException("AUDIO_TRACK_MISSING","NotFoundError");

  const previous=preparedAudioStream;
  preparedAudioStream=stream;
  window.__orikuroPreparedAudioStream=stream;

  track.addEventListener("ended",()=>{
    if(preparedAudioStream!==stream)return;
    preparedAudioStream=null;
    if(window.__orikuroPreparedAudioStream===stream)window.__orikuroPreparedAudioStream=null;
    micPermissionConfirmed=false;
    selectedAudioInputDeviceId="";
    setMicPermissionStatus("マイク入力が終了しました。配信形式を選び直してください。","error");
    setMicDeviceStatus("マイク入力が終了しました。","error");
    dispatchAudioInputSelection();
    updateWizard();
  },{once:true});

  if(previous&&previous!==stream)previous.getTracks().forEach(track=>track.stop());
  return track;
}

function releasePreparedAudioStream(){
  const stream=preparedAudioStream;
  preparedAudioStream=null;
  if(window.__orikuroPreparedAudioStream===stream)window.__orikuroPreparedAudioStream=null;
  stream?.getTracks?.().forEach(track=>track.stop());
}

async function refreshAudioInputs(requestPermission=false){
  const media=navigator.mediaDevices;
  const select=document.querySelector("[data-mic-device]");
  if(!(select instanceof HTMLSelectElement)||!media?.enumerateDevices||!media?.getUserMedia){
    micPermissionConfirmed=false;
    micDevicesKnown=false;
    selectedAudioInputDeviceId="";
    if(select)select.disabled=true;
    setMicPermissionStatus("このブラウザではマイクを使用できません。","error");
    setMicDeviceStatus("このブラウザではマイク機材の取得に対応していません。","error");
    updateWizard();
    return;
  }

  let acquiredStream=null;
  let activeDeviceId="";
  const requestedDeviceId=selectedAudioInputDeviceId;
  try{
    if(requestPermission){
      micPermissionConfirmed=false;
      micDevicesKnown=false;
      setMicPermissionStatus("マイクの使用許可を確認しています…","working");
      setMicDeviceStatus("マイクの利用許可と機材を確認しています…","working");
      updateWizard();

      acquiredStream=await media.getUserMedia(audioCaptureConstraints(requestedDeviceId));
      const track=publishPreparedAudioStream(acquiredStream);
      acquiredStream=null;
      micPermissionConfirmed=true;
      activeDeviceId=track.getSettings?.().deviceId||requestedDeviceId;
    }else{
      const track=preparedAudioTrack();
      if(track)activeDeviceId=track.getSettings?.().deviceId||selectedAudioInputDeviceId;
    }

    const devices=(await media.enumerateDevices()).filter(device=>device.kind==="audioinput");
    const previous=activeDeviceId||selectedAudioInputDeviceId;
    select.replaceChildren();

    if(devices.length===0){
      const option=document.createElement("option");
      option.value="";
      option.textContent="認識できるマイクなし";
      select.append(option);
      select.disabled=true;
      selectedAudioInputDeviceId="";
      micDevicesKnown=true;
      setMicPermissionStatus("マイク入力を認識できません。","error");
      setMicDeviceStatus("ブラウザが認識できるマイク入力がありません。","error");
      releasePreparedAudioStream();
      micPermissionConfirmed=false;
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

    if(micPermissionConfirmed&&preparedAudioTrack()){
      setMicPermissionStatus("マイクの使用を許可しました。","ready");
    }
    setMicDeviceStatus(`${devices.length}台のマイク入力を認識しました。使用: ${label}`,"ready");
    updateWizard();
    dispatchAudioInputSelection();
  }catch(error){
    acquiredStream?.getTracks?.().forEach(track=>track.stop());
    const name=error instanceof DOMException?error.name:"";
    const message=name==="NotAllowedError"
      ?"マイクの使用が許可されていません。Safariのマイク許可を確認してください。"
      :name==="NotFoundError"||name==="OverconstrainedError"
        ?"使用できるマイクが見つかりません。"
        :"マイク機材を確認できませんでした。";
    micPermissionConfirmed=!!preparedAudioTrack();
    micDevicesKnown=micPermissionConfirmed&&micDevicesKnown;
    if(!micPermissionConfirmed){
      selectedAudioInputDeviceId="";
      select.disabled=true;
    }
    setMicPermissionStatus(message,"error");
    setMicDeviceStatus(message,"error");
    updateWizard();
  }
}

async function switchPreparedAudioInput(deviceId){
  const media=navigator.mediaDevices;
  const select=document.querySelector("[data-mic-device]");
  if(!(select instanceof HTMLSelectElement)||!media?.getUserMedia||!deviceId)return;

  const previousId=selectedAudioInputDeviceId;
  select.disabled=true;
  setMicDeviceStatus("マイクを切り替えています…","working");
  try{
    const stream=await media.getUserMedia(audioCaptureConstraints(deviceId));
    const track=publishPreparedAudioStream(stream);
    selectedAudioInputDeviceId=track.getSettings?.().deviceId||deviceId;
    if([...select.options].some(option=>option.value===selectedAudioInputDeviceId)){
      select.value=selectedAudioInputDeviceId;
    }else{
      select.value=deviceId;
      selectedAudioInputDeviceId=deviceId;
    }
    micPermissionConfirmed=true;
    micDevicesKnown=true;
    setMicPermissionStatus("マイクの使用を許可しました。","ready");
    setMicDeviceStatus(`使用するマイク: ${currentMicLabel()}`,"ready");
    realtimeReady=false;
    dispatchAudioInputSelection();
    window.dispatchEvent(new CustomEvent("orikuro:stream-prepare-request",{detail:{mode:selectedMode||"radio"}}));
  }catch(error){
    select.value=previousId;
    selectedAudioInputDeviceId=previousId;
    const name=error instanceof DOMException?error.name:"";
    const message=name==="NotFoundError"||name==="OverconstrainedError"
      ?"選択したマイクを使用できません。"
      :"マイクを切り替えられませんでした。";
    setMicDeviceStatus(message,"error");
  }finally{
    select.disabled=false;
    updateWizard();
  }
}

async function applyMode(mode){
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

  // Server/network preparation begins immediately while the user continues setup.
  if(systemTest&&!systemPreparationRequested){
    systemPreparationRequested=true;
    window.dispatchEvent(new CustomEvent("orikuro:system-prepare-request",{detail:{mode}}));
  }

  if(!micReady()){
    if(!micPermissionRequest){
      micPermissionRequest=refreshAudioInputs(true).finally(()=>{micPermissionRequest=null;});
    }
    await micPermissionRequest;
  }

  if(micReady()){
    window.dispatchEvent(new CustomEvent("orikuro:stream-prepare-request",{detail:{mode}}));
  }
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
  if(!grantReady)realtimeReady=false;
  setState("session",grantReady?(realtimeReady?"準備完了":"配信経路準備中"):"認可情報なし",grantReady&&realtimeReady?"ready":"waiting");
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
  button.addEventListener("click",()=>{void applyMode(button.dataset.streamMode||"");});
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
  void switchPreparedAudioInput(select.value);
});
document.querySelector("[data-mic-test-toggle]")?.addEventListener("click",event=>{
  const button=event.currentTarget;
  const panel=document.querySelector("[data-mic-test]");
  if(!(button instanceof HTMLButtonElement)||!panel)return;
  const show=panel.hidden;
  panel.hidden=!show;
  button.setAttribute("aria-expanded",show?"true":"false");
  button.textContent=show?"マイクテストを隠す":"マイクテスト";
});
document.querySelector("[data-live-memo-toggle]")?.addEventListener("click",event=>{
  const button=event.currentTarget;
  const panel=document.querySelector("[data-live-memo-panel]");
  const memo=document.querySelector("[data-live-memo]");
  if(!(button instanceof HTMLButtonElement)||!panel)return;
  const show=panel.hidden;
  panel.hidden=!show;
  button.setAttribute("aria-expanded",show?"true":"false");
  button.textContent=show?"メモを閉じる":"メモ";
  if(show&&memo instanceof HTMLTextAreaElement){
    requestAnimationFrame(()=>memo.focus({preventScroll:true}));
  }
});
navigator.mediaDevices?.addEventListener?.("devicechange",()=>{
  if(micDevicesKnown)void refreshAudioInputs(false);
});
window.addEventListener("pagehide",()=>{
  if(!document.documentElement.dataset.broadcastPhase||document.documentElement.dataset.broadcastPhase!=="live"){
    releasePreparedAudioStream();
  }
},{once:true});

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
  setState("session","バックグラウンド準備待ち","waiting");
  updateWizard();
});
document.addEventListener("orikuro:service-ready",()=>{
  refreshGrantState();
  setState("session","配信経路準備中","waiting");
});
window.addEventListener("orikuro:stream-preparing",()=>{
  realtimeReady=false;
  if(grantReady)setState("session","配信経路準備中","waiting");
  updateWizard();
});
window.addEventListener("orikuro:stream-prepared",()=>{
  realtimeReady=true;
  grantReady=!!getStreamRealtimeGrant();
  setState("session","準備完了","ready");
  setState("audio","開始待機","ready");
  setState("output","開始待機","ready");
  if(currentStep===5)setFeedback("配信準備完了","ready");
  updateWizard();
});
window.addEventListener("orikuro:stream-prepare-failed",event=>{
  realtimeReady=false;
  if(systemTest&&!getStreamRealtimeGrant())systemPreparationRequested=false;
  const message=event?.detail?.message||"配信準備を完了できませんでした。";
  setState("session","準備失敗","error");
  setFeedback(message,"error");
  updateWizard();
});
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
  document.querySelectorAll("[data-live-memo-panel]").forEach(el=>el.hidden=true);
  const memoToggle=document.querySelector("[data-live-memo-toggle]");
  if(memoToggle instanceof HTMLButtonElement){
    memoToggle.setAttribute("aria-expanded","false");
    memoToggle.textContent="メモ";
  }
  const micToggle=document.querySelector("[data-mic-test-toggle]");
  if(micToggle instanceof HTMLButtonElement){
    micToggle.setAttribute("aria-expanded","false");
    micToggle.textContent="マイクテスト";
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
    micToggle.textContent="マイクテスト";
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
  setFeedback("配信を開始しています…","working");
  window.dispatchEvent(new CustomEvent("orikuro:stream-start-request",{detail:{mode:selectedMode,radioPresetId:backgroundChoice}}));
});

if(!compatibility.supported&&root)root.hidden=true;
