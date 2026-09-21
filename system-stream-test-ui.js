import{getStreamRealtimeGrant}from"./assets/js/realtime-grant.js?v=20260914-grant-handoff1";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const compatibility=applyStreamingCompatibility(document);
const root=document.querySelector("[data-stream-supported]");
const systemTest=document.documentElement.dataset.systemTest==="true";
const STANDING_PREPARE_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-prepare";
const STANDING_PREVIEW_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-preview";
const BACKGROUND_PREVIEW_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-background-preview";
const BACKGROUND_ACTIVATE_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-background-activate";
const STANDING_PREVIEW_STOP_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-preview-stop";
const STANDING_IMAGE_COUNT=4;
const supportedModes=new Set(["radio","standing"]);
const radioPresets=new Map([
  ["solid-1",{label:"黒",color:"#000000"}],
  ["solid-2",{label:"白",color:"#FFFFFF"}],
  ["solid-3",{label:"赤",color:"#C62828"}],
  ["solid-4",{label:"青",color:"#1565C0"}],
  ["solid-5",{label:"緑",color:"#2E7D32"}],
  ["solid-6",{label:"紫",color:"#6A1B9A"}],
]);

// Prototype-only values. These are local/deterministic so the support-score
// and rank UI can be exercised without creating production persistence.
const TEST_METRICS_BASE=Object.freeze({
  listeners:12,
  maxListeners:18,
  comments:38,
  follows:3,
  shares:6,
  likes:128,
  newListeners:5,
  giftPoints:2600,
  superchatPoints:800,
});
const TEST_LISTENERS=Object.freeze([
  {name:"テストリスナー 01",fanLevel:7,state:"応援中",background:true,firstTime:false},
  {name:"テストリスナー 02",fanLevel:6,state:"視聴中",background:true,firstTime:false},
  {name:"テストリスナー 03",fanLevel:null,state:"初見",background:false,firstTime:true},
  {name:"テストリスナー 04",fanLevel:4,state:"視聴中",background:false,firstTime:false},
  {name:"テストリスナー 05",fanLevel:3,state:"応援中",background:false,firstTime:false},
  {name:"テストリスナー 06",fanLevel:2,state:"視聴中",background:false,firstTime:false},
  {name:"テストリスナー 07",fanLevel:null,state:"初見",background:false,firstTime:true},
  {name:"テストリスナー 08",fanLevel:null,state:"視聴中",background:true,firstTime:false},
  {name:"テストリスナー 09",fanLevel:6,state:"視聴中",background:false,firstTime:false},
  {name:"テストリスナー 10",fanLevel:5,state:"応援中",background:false,firstTime:false},
  {name:"テストリスナー 11",fanLevel:null,state:"視聴中",background:false,firstTime:false},
  {name:"テストリスナー 12",fanLevel:2,state:"視聴中",background:false,firstTime:false},
]);

// Prototype borders only. Production values remain deliberately undecided.
// The shape mirrors the common daily-rank-point model: streaming gives +1,
// and higher daily support-score borders raise the provisional point award.
const DAILY_RANK_BORDERS=Object.freeze([
  {points:1,score:0},
  {points:2,score:2500},
  {points:3,score:4000},
  {points:4,score:5200},
  {points:5,score:6000},
  {points:6,score:7500},
]);
const SCORE_ZONE_BORDERS=Object.freeze([
  {points:0,score:0},
  {points:1,score:1000},
  {points:2,score:2500},
  {points:4,score:5200},
  {points:6,score:7500},
]);
const SCORE_ZONE_MAX=9000;
let testMetrics={...TEST_METRICS_BASE};

function calculateSupportScore(metrics){
  return Math.max(0,
    metrics.listeners*45+
    metrics.maxListeners*20+
    metrics.comments*12+
    metrics.follows*120+
    metrics.shares*60+
    metrics.newListeners*80+
    metrics.giftPoints+
    metrics.superchatPoints
  );
}

function calculateDailyRankPoint(score){
  let current=DAILY_RANK_BORDERS[0];
  for(const border of DAILY_RANK_BORDERS){
    if(score>=border.score)current=border;
    else break;
  }
  const next=DAILY_RANK_BORDERS.find(border=>border.score>score)??null;
  const previousScore=current.score;
  const nextScore=next?.score??current.score;
  const span=Math.max(1,nextScore-previousScore);
  const progress=next?Math.max(0,Math.min(1,(score-previousScore)/span)):1;
  return {
    points:current.points,
    nextPoints:next?.points??current.points,
    nextScore,
    remaining:next?Math.max(0,nextScore-score):0,
    progress,
  };
}

function calculateScoreZone(score){
  let current=SCORE_ZONE_BORDERS[0];
  for(const zone of SCORE_ZONE_BORDERS){
    if(score>=zone.score)current=zone;
    else break;
  }
  const next=SCORE_ZONE_BORDERS.find(zone=>zone.score>score)??null;
  return {
    current,
    next,
    remaining:next?Math.max(0,next.score-score):0,
    position:Math.max(0,Math.min(1,score/SCORE_ZONE_MAX)),
  };
}

function renderScoreZones(score){
  const model=calculateScoreZone(score);
  const track=document.querySelector("[data-support-zone-track]");
  const labels=document.querySelector("[data-support-scale-values]");

  if(track instanceof HTMLElement){
    track.replaceChildren();
    SCORE_ZONE_BORDERS.forEach((zone,index)=>{
      const next=SCORE_ZONE_BORDERS[index+1];
      const end=next?.score??SCORE_ZONE_MAX;
      const width=Math.max(0,(end-zone.score)/SCORE_ZONE_MAX)*100;
      const cell=document.createElement("span");
      cell.className=`broadcast-support-zone${zone===model.current?" is-current":""}`;
      cell.style.flex=`0 0 ${width}%`;
      cell.textContent=zone.points===0?"0":`+${zone.points}`;
      track.append(cell);
    });
  }

  if(labels instanceof HTMLElement){
    labels.replaceChildren();
    SCORE_ZONE_BORDERS.forEach((zone,index)=>{
      const label=document.createElement("span");
      label.className="broadcast-support-scale-value";
      label.style.left=`${Math.min(100,zone.score/SCORE_ZONE_MAX*100)}%`;
      label.textContent=formatMetric(zone.score);
      labels.append(label);
      if(index===SCORE_ZONE_BORDERS.length-1){
        const end=document.createElement("span");
        end.className="broadcast-support-scale-value";
        end.style.left="100%";
        end.textContent=formatMetric(SCORE_ZONE_MAX);
        labels.append(end);
      }
    });
  }

  document.querySelectorAll("[data-support-zone-current]").forEach(el=>{
    el.textContent=model.current.points===0?"0":`+${model.current.points}`;
  });
  document.querySelectorAll("[data-next-rank-points]").forEach(el=>{
    el.textContent=model.next?`+${model.next.points}`:"MAX";
  });
  document.querySelectorAll("[data-support-next]").forEach(el=>{
    el.textContent=model.next?formatMetric(model.next.score):formatMetric(SCORE_ZONE_MAX);
  });
  document.querySelectorAll("[data-support-remaining]").forEach(el=>{
    el.textContent=formatMetric(model.remaining);
  });
  document.querySelectorAll("[data-support-marker-score]").forEach(el=>{
    el.textContent=formatMetric(score);
  });
  document.querySelectorAll("[data-support-marker]").forEach(el=>{
    if(el instanceof HTMLElement)el.style.left=`${model.position*100}%`;
  });
  document.querySelectorAll("[data-support-progress-fill]").forEach(el=>{
    if(el instanceof HTMLElement)el.style.transform=`scaleX(${model.position})`;
  });
  document.querySelectorAll("[data-support-progress]").forEach(el=>{
    el.setAttribute("aria-valuenow",String(Math.round(model.position*100)));
  });
}

function calculateEventPoints(score){
  return Math.max(0,Math.floor(score*0.72));
}

function calculateEventRank(points){
  return Math.max(1,70-Math.floor(points/100));
}

function formatMetric(value){
  return new Intl.NumberFormat("ja-JP").format(Math.max(0,Math.floor(Number(value)||0)));
}

function renderTestListeners(){
  const backgroundList=document.querySelector("[data-listener-background-list]");
  const normalList=document.querySelector("[data-listener-list]");
  const backgroundSection=document.querySelector("[data-listener-background-section]");
  if(!(backgroundList instanceof HTMLOListElement)||!(normalList instanceof HTMLOListElement))return;
  backgroundList.replaceChildren();
  normalList.replaceChildren();

  const append=(listener,list)=>{
    const item=document.createElement("li");
    const hasLevel=Number.isInteger(listener.fanLevel)&&listener.fanLevel>=1&&listener.fanLevel<=7;
    item.className=`${hasLevel?`fan-level-${listener.fanLevel}`:"fan-level-none"}${listener.background?" is-background-highlight":""}${listener.firstTime?" is-first-time":""}`;

    const badge=document.createElement("span");
    badge.className=`broadcast-fan-badge${hasLevel?"":" is-none"}`;
    badge.textContent=hasLevel?`Lv.${listener.fanLevel}`:"なし";

    const name=document.createElement("span");
    name.className="broadcast-listener-name";
    name.textContent=listener.name;

    const state=document.createElement("small");
    state.className="broadcast-listener-state";
    state.textContent=listener.firstTime?"初見":listener.state;

    item.append(badge,name,state);
    list.append(item);
  };

  const background=TEST_LISTENERS.filter(listener=>listener.background);
  const normal=TEST_LISTENERS.filter(listener=>!listener.background);
  background.forEach(listener=>append(listener,backgroundList));
  normal.forEach(listener=>append(listener,normalList));
  if(backgroundSection instanceof HTMLElement)backgroundSection.hidden=background.length===0;
}

function renderEventRanking(eventPoints,eventRank){
  const list=document.querySelector("[data-event-ranking-list]");
  if(!(list instanceof HTMLOListElement))return;
  list.replaceChildren();
  for(let rank=1;rank<=30;rank+=1){
    const item=document.createElement("li");
    if(rank===eventRank)item.classList.add("is-current");

    const no=document.createElement("span");
    no.className="rank-no";
    no.textContent=`${rank}位`;

    const name=document.createElement("span");
    name.className="rank-name";
    name.textContent=rank===eventRank?"この配信":`テスト配信 ${String(rank).padStart(2,"0")}`;

    const points=document.createElement("span");
    points.className="rank-points";
    const value=rank===eventRank?eventPoints:Math.max(0,12330-(rank-1)*300);
    points.textContent=`${formatMetric(value)}pt`;

    item.append(no,name,points);
    list.append(item);
  }
}

function updateTestMetrics(){
  const score=calculateSupportScore(testMetrics);
  const daily=calculateDailyRankPoint(score);
  const eventPoints=calculateEventPoints(score);
  const eventRank=calculateEventRank(eventPoints);

  document.querySelectorAll("[data-support-score]").forEach(el=>el.textContent=formatMetric(score));
  document.querySelectorAll("[data-daily-rank-points]").forEach(el=>el.textContent=String(daily.points));
  document.querySelectorAll("[data-event-points]").forEach(el=>el.textContent=formatMetric(eventPoints));
  document.querySelectorAll("[data-event-rank]").forEach(el=>el.textContent=formatMetric(eventRank));
  document.querySelectorAll("[data-listener-count]").forEach(el=>el.textContent=formatMetric(testMetrics.listeners));
  document.querySelectorAll("[data-listener-max]").forEach(el=>el.textContent=formatMetric(testMetrics.maxListeners));
  document.querySelectorAll("[data-like-count]").forEach(el=>el.textContent=formatMetric(testMetrics.likes));

  renderScoreZones(score);
  renderEventRanking(eventPoints,eventRank);
  renderTestListeners();
}

let currentStep=1;
let selectedMode="";
let backgroundChoice="";
let selectedAudioInputDeviceId="";
let micDevicesKnown=false;
let micPermissionConfirmed=false;
let micPermissionRequest=null;
let preparedAudioStream=null;
let grantReady=false;
let realtimeReady=false;
let systemPreparationRequested=false;
let systemAccessReady=document.documentElement.dataset.systemAccessReady==="true";
let standingPreviewReady=false;
let standingPreviewLoading=false;
let standingPreviewUrl="";
let backgroundPreviewReady=false;
let backgroundPreviewLoading=false;
const standingBackgroundUrls=new Map();
let standingActiveBackgroundIndex=-1;
let standingPreparationGeneration=0;
let standingPreparationController=null;
let standingPreparationPromise=null;
let standingActivationQueue=Promise.resolve();
let standingMotionRaf=0;
let standingMotionStartedAt=0;
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

function standingImageIndex(choice=backgroundChoice){
  const match=/^standing-image-([1-4])$/.exec(choice);
  return match?Number(match[1])-1:-1;
}
function standingChoiceValid(choice=backgroundChoice){
  return standingImageIndex(choice)>=0||radioPresets.has(choice);
}
function standingChoiceReady(choice=backgroundChoice){
  const index=standingImageIndex(choice);
  return index>=0?standingBackgroundUrls.has(index):radioPresets.has(choice);
}
function readyForStep(step){
  if(step===1)return supportedModes.has(selectedMode)&&micReady();
  if(step===2)return selectedMode==="standing"
    ?standingPreviewReady&&standingChoiceReady()
    :radioPresets.has(backgroundChoice);
  if(step===3)return streamTitleValue().length>0&&micReady();
  if(step===4)return readyForStep(1)&&readyForStep(2)&&readyForStep(3);
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

function revokeStandingBackgroundUrls(){
  for(const url of standingBackgroundUrls.values())URL.revokeObjectURL(url);
  standingBackgroundUrls.clear();
  document.querySelectorAll("[data-standing-background-swatch]").forEach(el=>{if(el instanceof HTMLElement)el.style.backgroundImage="";});
  document.querySelectorAll("[data-standing-background-index]").forEach(button=>{if(button instanceof HTMLButtonElement)button.disabled=true;});
}
function resetStandingMotionFrame(){
  window.__orikuroStandingFrameState={x:0,y:0,z:0,yaw:0,pitch:0,roll:0,confidence:1,lod:0,faceLocalWarp:0};
  document.querySelectorAll("[data-standing-preview-image]").forEach(img=>{if(img instanceof HTMLImageElement)img.style.transform="";});
}
function stopStandingMotion(reset=true){
  if(standingMotionRaf)cancelAnimationFrame(standingMotionRaf);
  standingMotionRaf=0;standingMotionStartedAt=0;if(reset)resetStandingMotionFrame();
}
function startStandingMotion(){
  if(standingMotionRaf||selectedMode!=="standing"||!standingPreviewReady||document.hidden)return;
  if(!standingMotionStartedAt)standingMotionStartedAt=performance.now();
  const tick=now=>{
    standingMotionRaf=0;
    if(selectedMode!=="standing"||!standingPreviewReady||document.hidden)return;
    const t=(now-standingMotionStartedAt)/1000;
    const breath=(Math.sin(t*Math.PI*2/4.2)+1)*0.5;
    const state={x:Math.sin(t*.85)*.018,y:Math.sin(t*1.15)*.004-breath*.0025,z:Math.sin(t*.52)*.018,yaw:Math.sin(t*.72)*8,pitch:Math.sin(t*.54)*3.5,roll:Math.sin(t*.63)*2.4,confidence:1,lod:0,faceLocalWarp:0};
    window.__orikuroStandingFrameState=state;
    const sx=(1+state.z)*(1-Math.min(Math.abs(state.yaw)/18,1)*.06);
    const sy=(1+state.z)*(1-Math.min(Math.abs(state.pitch)/14,1)*.04)*(1+breath*.003);
    document.querySelectorAll("[data-standing-preview-image]").forEach(img=>{
      if(!(img instanceof HTMLImageElement))return;
      img.style.transform=`translate3d(${(state.x*100).toFixed(3)}%,${(state.y*100).toFixed(3)}%,0) perspective(900px) rotateY(${state.yaw.toFixed(3)}deg) rotateX(${(-state.pitch).toFixed(3)}deg) rotateZ(${state.roll.toFixed(3)}deg) scale(${sx.toFixed(5)},${sy.toFixed(5)})`;
    });
    standingMotionRaf=requestAnimationFrame(tick);
  };
  standingMotionRaf=requestAnimationFrame(tick);
}
function renderStandingBackgroundChoice(){
  const imageIndex=standingImageIndex();
  const imageUrl=imageIndex>=0?standingBackgroundUrls.get(imageIndex)||"":"";
  const solid=radioPresets.get(backgroundChoice);
  const useImage=selectedMode==="standing"&&imageIndex>=0&&!!imageUrl;
  const useSolid=selectedMode==="standing"&&!!solid;
  document.querySelectorAll("[data-background-preview-image]").forEach(el=>{
    if(!(el instanceof HTMLImageElement))return;
    if(useImage){if(el.src!==imageUrl)el.src=imageUrl;el.hidden=false;}else el.hidden=true;
  });
  document.querySelectorAll("[data-radio-background]").forEach(el=>{
    if(!(el instanceof HTMLElement))return;
    if(selectedMode==="radio")el.hidden=false;
    else if(useSolid){el.hidden=false;el.dataset.radioPreset=backgroundChoice;el.style.setProperty("--radio-background-color",solid.color);}
    else el.hidden=true;
  });
  document.querySelectorAll("[data-standing-background-choice]").forEach(button=>{
    const active=button.dataset.standingBackgroundChoice===backgroundChoice;
    button.classList.toggle("is-selected",active);button.setAttribute("aria-pressed",active?"true":"false");
  });
}
async function prepareStandingBackend(signal,generation){
  if(selectedMode!=="standing")return;
  const current=getStreamRealtimeGrant();if(!current)throw new Error("STREAM_GRANT_MISSING");
  const response=await fetch(STANDING_PREPARE_URL,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({streamId:current.streamId,controlCapability:current.controlCapability}),
    credentials:"omit",
    cache:"no-store",
    referrerPolicy:"no-referrer",
    signal
  });
  if(!response.ok){
    const payload=await response.json().catch(()=>null);
    throw new Error(typeof payload?.code==="string"?payload.code:"STANDING_PREPARE_FAILED");
  }
  const payload=await response.json().catch(()=>null);
  if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
  if(payload?.ok!==true||payload?.result?.backgroundCount!==STANDING_IMAGE_COUNT)throw new Error("STANDING_PREPARE_INVALID");
  window.dispatchEvent(new CustomEvent("orikuro:standing-backend-ready",{detail:{
    standingReady:payload.result.standingReady===true,
    backgroundCount:payload.result.backgroundCount
  }}));
}
async function loadStandingPreview(signal,generation){
  if(selectedMode!=="standing"||standingPreviewReady||standingPreviewLoading)return;
  const current=getStreamRealtimeGrant();if(!current)return;
  standingPreviewLoading=true;setState("composition","立ち絵を復元中","working");
  document.querySelectorAll("[data-preview-character-label],[data-live-character-label]").forEach(el=>{el.textContent="R2素材を配信用一時コピーへ復元中…";});
  updateWizard();
  try{
    const response=await fetch(STANDING_PREVIEW_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({streamId:current.streamId,controlCapability:current.controlCapability}),credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",signal});
    if(!response.ok){const payload=await response.json().catch(()=>null);throw new Error(typeof payload?.code==="string"?payload.code:"STANDING_PREVIEW_FAILED");}
    const blob=await response.blob();
    if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
    if(!["image/png","image/jpeg","image/webp"].includes(blob.type)||blob.size<1||blob.size>12*1024*1024)throw new Error("STANDING_PREVIEW_INVALID");
    const nextUrl=URL.createObjectURL(blob);
    const images=Array.from(document.querySelectorAll("[data-standing-preview-image]")).filter(img=>img instanceof HTMLImageElement);
    images.forEach(img=>{img.src=nextUrl;img.hidden=false;});
    await Promise.all(images.map(img=>img.decode()));
    if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing"){URL.revokeObjectURL(nextUrl);return;}
    if(standingPreviewUrl)URL.revokeObjectURL(standingPreviewUrl);
    standingPreviewUrl=nextUrl;standingPreviewReady=true;startStandingMotion();
    setState("composition","背景4種を先行準備中","working");setFeedback("立ち絵を復元しました。背景4種を先行準備しています。","info");
  }catch(error){
    if(signal.aborted||error?.name==="AbortError")return;
    standingPreviewReady=false;setState("composition","立ち絵読込失敗","error");
    setFeedback(error instanceof Error?`立ち絵を読み込めません: ${error.message}`:"立ち絵を読み込めません。","error");throw error;
  }finally{if(generation===standingPreparationGeneration)standingPreviewLoading=false;updateWizard();}
}
async function fetchStandingBackground(index,signal,generation){
  const current=getStreamRealtimeGrant();if(!current)throw new Error("STREAM_GRANT_MISSING");
  const response=await fetch(BACKGROUND_PREVIEW_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({streamId:current.streamId,controlCapability:current.controlCapability,backgroundIndex:index}),credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",signal});
  if(!response.ok){const payload=await response.json().catch(()=>null);throw new Error(typeof payload?.code==="string"?payload.code:"BACKGROUND_PREVIEW_FAILED");}
  const blob=await response.blob();
  if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
  if(!["image/png","image/jpeg","image/webp"].includes(blob.type)||blob.size<1||blob.size>12*1024*1024)throw new Error("BACKGROUND_PREVIEW_INVALID");
  const nextUrl=URL.createObjectURL(blob),previous=standingBackgroundUrls.get(index);if(previous)URL.revokeObjectURL(previous);
  standingBackgroundUrls.set(index,nextUrl);
  const swatch=document.querySelector(`[data-standing-background-swatch="${index}"]`);if(swatch instanceof HTMLElement)swatch.style.backgroundImage=`url("${nextUrl}")`;
  const button=document.querySelector(`[data-standing-background-index="${index}"]`);if(button instanceof HTMLButtonElement)button.disabled=false;
  renderStandingBackgroundChoice();
}
async function loadInitialStandingBackground(signal,generation){
  if(selectedMode!=="standing")return;
  if(!standingBackgroundUrls.has(0))await fetchStandingBackground(0,signal,generation);
  if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
  if(!standingChoiceValid(backgroundChoice))backgroundChoice="standing-image-1";
  renderStandingBackgroundChoice();
  updateWizard();
}
async function loadDeferredStandingBackgrounds(signal,generation){
  if(selectedMode!=="standing"||backgroundPreviewReady)return;
  setState("composition","背景2〜4をバックグラウンド準備中","working");updateWizard();
  try{
    const pending=[1,2,3].filter(index=>!standingBackgroundUrls.has(index));
    await Promise.all(pending.map(index=>fetchStandingBackground(index,signal,generation)));
    if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
    backgroundPreviewReady=standingBackgroundUrls.size===STANDING_IMAGE_COUNT;
    renderStandingBackgroundChoice();
    if(backgroundPreviewReady){
      setState("composition","立ち絵・背景10種準備完了","ready");
      window.dispatchEvent(new CustomEvent("orikuro:standing-assets-ready",{detail:{backgroundCount:STANDING_IMAGE_COUNT}}));
      setFeedback("登録背景4種と単色6種の準備が完了しました。","ready");
    }
  }catch(error){
    if(signal.aborted||error?.name==="AbortError")return;
    backgroundPreviewReady=false;setState("composition","背景読込失敗","error");
    setFeedback(error instanceof Error?`背景を読み込めません: ${error.message}`:"背景を読み込めません。","error");
    throw error;
  }finally{if(generation===standingPreparationGeneration)updateWizard();}
}
function beginStandingPreparation(){
  if(selectedMode!=="standing"||standingPreparationPromise)return;
  const current=getStreamRealtimeGrant();if(!current)return;
  if(!standingPreparationController)standingPreparationController=new AbortController();
  const controller=standingPreparationController,generation=standingPreparationGeneration;
  backgroundPreviewLoading=true;
  standingPreparationPromise=(async()=>{
    const backendPromise=prepareStandingBackend(controller.signal,generation);
    const standingPromise=loadStandingPreview(controller.signal,generation);
    const initialBackgroundPromise=loadInitialStandingBackground(controller.signal,generation);

    await Promise.all([standingPromise,initialBackgroundPromise]);
    if(controller.signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;

    if(standingPreviewReady&&standingBackgroundUrls.has(0)){
      setState("composition","初期表示準備完了 / 他背景を準備中","ready");
      updateWizard();
    }

    const chosen=standingImageIndex();
    const activationPromise=chosen>=0&&standingBackgroundUrls.has(chosen)&&chosen!==standingActiveBackgroundIndex
      ?activateStandingBackground(chosen)
      :Promise.resolve(true);
    const deferredPromise=loadDeferredStandingBackgrounds(controller.signal,generation);

    await Promise.all([backendPromise,activationPromise,deferredPromise]);
    if(controller.signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
    if(standingPreviewReady&&backgroundPreviewReady)setState("composition","立ち絵・背景10種準備完了","ready");
  })().catch(error=>{
    if(!controller.signal.aborted&&generation===standingPreparationGeneration&&selectedMode==="standing"){
      const message=error instanceof Error?error.message:"STANDING_PREPARATION_FAILED";
      setFeedback("立ち絵配信の専用準備を完了できません: "+message,"error");
    }
  }).finally(()=>{
    if(generation===standingPreparationGeneration){
      backgroundPreviewLoading=false;
      standingPreparationPromise=null;
      updateWizard();
    }
  });
}
async function stopStandingTemporary(){
  const current=getStreamRealtimeGrant();if(!current)return;
  try{
    const response=await fetch(STANDING_PREVIEW_STOP_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({streamId:current.streamId,controlCapability:current.controlCapability}),credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",keepalive:true});
    try{await response.body?.cancel();}catch{}
  }catch{}
}
function cancelStandingPreparation(stopRemote=true){
  standingPreparationGeneration++;standingPreparationController?.abort();standingPreparationController=null;standingPreparationPromise=null;
  standingPreviewLoading=false;backgroundPreviewLoading=false;standingPreviewReady=false;backgroundPreviewReady=false;standingActiveBackgroundIndex=-1;
  stopStandingMotion(true);
  if(standingPreviewUrl)URL.revokeObjectURL(standingPreviewUrl);standingPreviewUrl="";revokeStandingBackgroundUrls();
  document.querySelectorAll("[data-standing-preview-image]").forEach(img=>{if(img instanceof HTMLImageElement){img.removeAttribute("src");img.hidden=true;}});
  document.querySelectorAll("[data-background-preview-image]").forEach(img=>{if(img instanceof HTMLImageElement){img.removeAttribute("src");img.hidden=true;}});
  if(stopRemote)void stopStandingTemporary();
}
async function activateStandingBackground(index){
  if(index<0||index>=STANDING_IMAGE_COUNT||selectedMode!=="standing"||!standingBackgroundUrls.has(index))return false;
  if(index===standingActiveBackgroundIndex)return true;
  const current=getStreamRealtimeGrant();if(!current)return false;
  standingActivationQueue=standingActivationQueue.catch(()=>undefined).then(async()=>{
    if(selectedMode!=="standing"||standingImageIndex()!==index)return;
    setState("composition","背景を切り替え中","working");
    const response=await fetch(BACKGROUND_ACTIVATE_URL,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({streamId:current.streamId,controlCapability:current.controlCapability,backgroundIndex:index}),credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"});
    if(!response.ok){const payload=await response.json().catch(()=>null);throw new Error(typeof payload?.code==="string"?payload.code:"BACKGROUND_ACTIVATE_FAILED");}
    const payload=await response.json().catch(()=>null);
    if(payload?.ok!==true||payload?.result?.ready!==true)throw new Error("BACKGROUND_ACTIVATE_INVALID");
    standingActiveBackgroundIndex=index;
    if(selectedMode==="standing"&&standingImageIndex()===index)setState("composition","立ち絵・背景10種準備完了","ready");
  }).catch(error=>{if(selectedMode==="standing"){setState("composition","背景切替失敗","error");setFeedback(error instanceof Error?`背景を切り替えられません: ${error.message}`:"背景を切り替えられません。","error");}});
  await standingActivationQueue;return standingActiveBackgroundIndex===index;
}
function applyStandingBackgroundChoice(choiceId){
  if(selectedMode!=="standing"||!standingChoiceValid(choiceId))return;
  backgroundChoice=choiceId;renderStandingBackgroundChoice();updateWizard();
  const index=standingImageIndex(choiceId);if(index>=0&&standingPreviewReady&&standingBackgroundUrls.has(index))void activateStandingBackground(index);
  window.dispatchEvent(new CustomEvent("orikuro:standing-background-change",{detail:{choiceId,index}}));
}

function updateScenePreview(){
  const labels={radio:"ラジオ / 音声配信",standing:"立ち絵配信",live2d:"Live2D配信","3d":"3Dモデル配信",camera:"実写キャプチャー"};
  const characterLabels={standing:"立ち絵プレビュー",live2d:"Live2Dプレビュー","3d":"3Dモデルプレビュー",camera:"カメラプレビュー"};
  document.querySelectorAll("[data-stream-preview-copy]").forEach(el=>{el.textContent=labels[selectedMode]||"配信形式未選択";});
  document.querySelectorAll("[data-radio-scene-main]").forEach(el=>{el.hidden=selectedMode!==""&&selectedMode!=="radio";});
  document.querySelectorAll("[data-preview-character-layer]").forEach(el=>{el.hidden=!characterLabels[selectedMode];});
  document.querySelectorAll("[data-preview-character-label]").forEach(el=>{el.textContent=selectedMode==="standing"?(standingPreviewReady?"":"立ち絵を読み込み中"):(characterLabels[selectedMode]||"配信モデルプレビュー");});
  document.querySelectorAll("[data-live-character-layer]").forEach(el=>{el.hidden=!characterLabels[selectedMode];});
  document.querySelectorAll("[data-live-character-label]").forEach(el=>{el.textContent=selectedMode==="standing"?(standingPreviewReady?"":"立ち絵を読み込み中"):characterLabels[selectedMode]?.replace("プレビュー","")||"配信モデル";});
  document.querySelectorAll("[data-standing-preview-image]").forEach(el=>{el.hidden=selectedMode!=="standing"||!standingPreviewReady;});
  document.querySelectorAll("[data-radio-background-controls]").forEach(el=>{el.hidden=selectedMode==="standing";});
  document.querySelectorAll("[data-standing-background-controls]").forEach(el=>{el.hidden=selectedMode!=="standing";});
  renderStandingBackgroundChoice();
  const title=document.querySelector("[data-step2-title]"),description=document.querySelector("[data-step2-description]"),backgroundLabel=document.querySelector("[data-background-preview-label]");
  if(title)title.textContent="背景を選択";
  if(description)description.textContent=selectedMode==="standing"?"登録済み背景4種または単色6種から選択します。＋はテスト版では使用できません。":"ラジオ画面に使う背景を決めます。";
  if(backgroundLabel)backgroundLabel.textContent=selectedMode==="standing"?(backgroundPreviewReady?"登録背景4種＋単色6種 / 準備完了":standingPreviewReady?"背景4種を先行準備中":"立ち絵を準備中"):"背景プレビュー";
}

function updateSummary(){
  const mode=document.querySelector("[data-summary-mode]");
  const background=document.querySelector("[data-summary-background]");
  const mic=document.querySelector("[data-summary-mic]");
  if(mode)mode.textContent=selectedMode==="radio"?"ラジオ":selectedMode==="standing"?"立ち絵":"未選択";
  if(background){
    if(selectedMode==="standing"){const imageIndex=standingImageIndex();background.textContent=imageIndex>=0?`登録背景${imageIndex+1}`:(radioPresets.get(backgroundChoice)?.label||"準備中");}
    else background.textContent=radioPresets.get(backgroundChoice)?.label||"未選択";
  }
  if(mic)mic.textContent=currentMicLabel();
  updateStreamIdentity();
  updateScenePreview();
  updateTestMetrics();
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
    next.hidden=currentStep===4;
    next.disabled=!readyForStep(currentStep);
  }
  if(start){
    start.hidden=currentStep!==4;
    start.textContent=selectedMode==="standing"?"立ち絵配信スタート":"ラジオ配信スタート";
    start.disabled=currentStep!==4||!readyForStep(4)||!sessionReady()||!compatibility.supported;
  }
  updateSummary();
}

function goStep(step){
  if(step<1||step>4)return;
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
  const previousMode=selectedMode;
  if(previousMode==="standing"&&mode!=="standing")cancelStandingPreparation(true);
  selectedMode=mode;document.documentElement.dataset.streamMode=mode;
  document.querySelectorAll("[data-stream-mode]").forEach(button=>{const active=button.dataset.streamMode===mode;button.classList.toggle("is-selected",active);button.setAttribute("aria-pressed",active?"true":"false");});
  if(mode==="standing"){
    if(previousMode!=="standing"){standingPreparationGeneration++;standingPreparationController=new AbortController();standingPreviewReady=false;backgroundPreviewReady=false;backgroundChoice="standing-image-1";setState("composition","立ち絵・背景を先行準備中","working");}
  }else{if(!radioPresets.has(backgroundChoice))backgroundChoice="";setState("composition","対象外","ready");}
  updateWizard();window.dispatchEvent(new CustomEvent("orikuro:stream-mode-change",{detail:{mode}}));
  if(mode==="standing")beginStandingPreparation();
  if(!micReady()&&!micPermissionRequest)micPermissionRequest=refreshAudioInputs(true).finally(()=>{micPermissionRequest=null;});
  const permission=micPermissionRequest;
  if(permission){void permission.then(()=>{if(selectedMode===mode&&micReady())window.dispatchEvent(new CustomEvent("orikuro:stream-prepare-request",{detail:{mode}}));});}
  else if(micReady())window.dispatchEvent(new CustomEvent("orikuro:stream-prepare-request",{detail:{mode}}));
}

function applyBackgroundPreset(presetId){
  const preset=radioPresets.get(presetId);
  if(!preset||selectedMode!=="radio")return;
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
document.querySelectorAll("[data-standing-background-choice]").forEach(button=>{
  button.addEventListener("click",()=>applyStandingBackgroundChoice(button.dataset.standingBackgroundChoice||""));
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
const liveNotes=document.querySelector("[data-live-notes]");
const liveMemoToggle=document.querySelector("[data-live-memo-toggle]");
const liveListenerPanel=document.querySelector("[data-live-listener-panel]");
const liveListenerToggle=document.querySelector("[data-live-listeners-toggle]");
const liveSupportPanel=document.querySelector("[data-live-support-panel]");
const liveSupportToggle=document.querySelector("[data-live-support-toggle]");
const liveRankingPanel=document.querySelector("[data-live-ranking-panel]");
const liveEventToggle=document.querySelector("[data-live-event-toggle]");
const liveSubtitleForm=document.querySelector("[data-live-subtitle-form]");
const liveSubtitleInput=document.querySelector("[data-live-subtitle-input]");
let liveNoteSequence=0;
let liveNoteZ=20;

function previewBoundsFor(element){
  const preview=element.closest(".broadcast-live-preview");
  return preview instanceof HTMLElement?preview:null;
}

function clampLiveNote(note){
  if(!(note instanceof HTMLElement))return;
  const preview=previewBoundsFor(note);
  if(!preview)return;
  const parent=preview.getBoundingClientRect();
  const rect=note.getBoundingClientRect();
  const left=Math.max(0,Math.min(rect.left-parent.left,Math.max(0,parent.width-rect.width)));
  const top=Math.max(0,Math.min(rect.top-parent.top,Math.max(0,parent.height-rect.height)));
  note.style.left=`${left}px`;
  note.style.top=`${top}px`;
}

function bringLiveNoteFront(note){
  liveNoteZ+=1;
  note.style.zIndex=String(liveNoteZ);
}

function autosizeLiveNote(note,textarea){
  if(!(note instanceof HTMLElement)||!(textarea instanceof HTMLTextAreaElement))return;
  if(note.dataset.userResized==="true")return;
  const preview=previewBoundsFor(note);
  const maxHeight=preview?Math.max(60,preview.clientHeight-note.offsetTop-12):260;
  textarea.style.height="auto";
  const next=Math.min(Math.max(42,textarea.scrollHeight),Math.max(42,maxHeight-18));
  textarea.style.height=`${next}px`;
  textarea.style.overflowY=textarea.scrollHeight>next?"auto":"hidden";
  requestAnimationFrame(()=>clampLiveNote(note));
}

function setLiveNoteEditing(note,editing){
  if(!(note instanceof HTMLElement))return;
  note.classList.toggle("is-editing",editing);
  const textarea=note.querySelector("textarea");
  if(editing&&textarea instanceof HTMLTextAreaElement){
    bringLiveNoteFront(note);
    requestAnimationFrame(()=>textarea.focus({preventScroll:true}));
  }
}

function bindLiveNoteDrag(note,handle){
  handle.addEventListener("pointerdown",event=>{
    const preview=previewBoundsFor(note);
    if(!preview)return;
    event.preventDefault();
    bringLiveNoteFront(note);
    handle.setPointerCapture?.(event.pointerId);
    const parent=preview.getBoundingClientRect();
    const rect=note.getBoundingClientRect();
    const offsetX=event.clientX-rect.left;
    const offsetY=event.clientY-rect.top;
    const move=moveEvent=>{
      const current=note.getBoundingClientRect();
      const left=Math.max(0,Math.min(moveEvent.clientX-parent.left-offsetX,parent.width-current.width));
      const top=Math.max(0,Math.min(moveEvent.clientY-parent.top-offsetY,parent.height-current.height));
      note.style.left=`${left}px`;
      note.style.top=`${top}px`;
    };
    const end=endEvent=>{
      handle.releasePointerCapture?.(endEvent.pointerId);
      handle.removeEventListener("pointermove",move);
      handle.removeEventListener("pointerup",end);
      handle.removeEventListener("pointercancel",end);
      clampLiveNote(note);
    };
    handle.addEventListener("pointermove",move);
    handle.addEventListener("pointerup",end);
    handle.addEventListener("pointercancel",end);
  });
}

function bindLiveNoteResize(note,grip){
  grip.addEventListener("pointerdown",event=>{
    const preview=previewBoundsFor(note);
    if(!preview)return;
    event.preventDefault();
    bringLiveNoteFront(note);
    grip.setPointerCapture?.(event.pointerId);
    const parent=preview.getBoundingClientRect();
    const rect=note.getBoundingClientRect();
    const startX=event.clientX;
    const startY=event.clientY;
    const startW=rect.width;
    const startH=rect.height;
    note.dataset.userResized="true";
    const move=moveEvent=>{
      const maxW=Math.max(110,parent.right-rect.left);
      const maxH=Math.max(50,parent.bottom-rect.top);
      note.style.width=`${Math.max(110,Math.min(startW+(moveEvent.clientX-startX),maxW))}px`;
      note.style.height=`${Math.max(50,Math.min(startH+(moveEvent.clientY-startY),maxH))}px`;
      const textarea=note.querySelector("textarea");
      if(textarea instanceof HTMLTextAreaElement){
        textarea.style.height=`${Math.max(30,note.clientHeight-34)}px`;
        textarea.style.overflowY="auto";
      }
    };
    const end=endEvent=>{
      grip.releasePointerCapture?.(endEvent.pointerId);
      grip.removeEventListener("pointermove",move);
      grip.removeEventListener("pointerup",end);
      grip.removeEventListener("pointercancel",end);
      clampLiveNote(note);
    };
    grip.addEventListener("pointermove",move);
    grip.addEventListener("pointerup",end);
    grip.addEventListener("pointercancel",end);
  });
}

function createLiveNote(){
  if(!(liveNotes instanceof HTMLElement))return;
  const preview=liveNotes.closest(".broadcast-live-preview");
  if(!(preview instanceof HTMLElement))return;
  liveNoteSequence+=1;
  const note=document.createElement("div");
  note.className="broadcast-live-note is-editing";
  note.dataset.liveNote=String(liveNoteSequence);
  note.style.left=`${18+(liveNoteSequence%4)*16}px`;
  note.style.top=`${Math.max(110,Math.min(preview.clientHeight-90,155+(liveNoteSequence%5)*22))}px`;

  const drag=document.createElement("button");
  drag.type="button";
  drag.className="broadcast-live-note-control broadcast-live-note-drag";
  drag.textContent="⋮⋮";
  drag.setAttribute("aria-label","メモを移動");

  const done=document.createElement("button");
  done.type="button";
  done.className="broadcast-live-note-control broadcast-live-note-done";
  done.textContent="✓";
  done.setAttribute("aria-label","メモ編集を完了");

  const remove=document.createElement("button");
  remove.type="button";
  remove.className="broadcast-live-note-control broadcast-live-note-remove";
  remove.textContent="×";
  remove.setAttribute("aria-label","メモを削除");

  const textarea=document.createElement("textarea");
  textarea.spellcheck=true;
  textarea.placeholder="メモを入力";

  const resize=document.createElement("span");
  resize.className="broadcast-live-note-resize";
  resize.textContent="↘";
  resize.setAttribute("aria-hidden","true");

  note.append(drag,done,remove,textarea,resize);
  liveNotes.append(note);
  bringLiveNoteFront(note);
  bindLiveNoteDrag(note,drag);
  bindLiveNoteResize(note,resize);

  textarea.addEventListener("input",()=>autosizeLiveNote(note,textarea));
  done.addEventListener("click",()=>setLiveNoteEditing(note,false));
  remove.addEventListener("click",()=>note.remove());
  note.addEventListener("click",event=>{
    if(note.classList.contains("is-editing"))return;
    if(event.target===note||event.target===textarea)setLiveNoteEditing(note,true);
  });
  requestAnimationFrame(()=>{
    autosizeLiveNote(note,textarea);
    clampLiveNote(note);
    textarea.focus({preventScroll:true});
  });
}

function clearLiveNotes(){
  if(liveNotes instanceof HTMLElement)liveNotes.replaceChildren();
  liveNoteSequence=0;
  liveNoteZ=20;
}

liveMemoToggle?.addEventListener("click",()=>createLiveNote());

function closeLivePanels(except=null){
  [liveSupportPanel,liveRankingPanel,liveListenerPanel].forEach(panel=>{
    if(panel instanceof HTMLElement&&panel!==except)panel.hidden=true;
  });
}

liveSupportToggle?.addEventListener("click",()=>{
  if(!(liveSupportPanel instanceof HTMLElement))return;
  const opening=liveSupportPanel.hidden;
  closeLivePanels(opening?liveSupportPanel:null);
  liveSupportPanel.hidden=!opening;
});
document.querySelector("[data-live-support-close]")?.addEventListener("click",()=>{
  if(liveSupportPanel instanceof HTMLElement)liveSupportPanel.hidden=true;
});

liveEventToggle?.addEventListener("click",()=>{
  if(!(liveRankingPanel instanceof HTMLElement))return;
  const opening=liveRankingPanel.hidden;
  closeLivePanels(opening?liveRankingPanel:null);
  liveRankingPanel.hidden=!opening;
});
document.querySelector("[data-live-ranking-close]")?.addEventListener("click",()=>{
  if(liveRankingPanel instanceof HTMLElement)liveRankingPanel.hidden=true;
});

liveListenerToggle?.addEventListener("click",()=>{
  if(!(liveListenerPanel instanceof HTMLElement))return;
  const opening=liveListenerPanel.hidden;
  closeLivePanels(opening?liveListenerPanel:null);
  liveListenerPanel.hidden=!opening;
});
document.querySelector("[data-live-listeners-close]")?.addEventListener("click",()=>{
  if(liveListenerPanel instanceof HTMLElement)liveListenerPanel.hidden=true;
});

document.querySelector("[data-live-subtitle-edit]")?.addEventListener("click",()=>{
  if(!(liveSubtitleForm instanceof HTMLFormElement)||!(liveSubtitleInput instanceof HTMLInputElement))return;
  closeLivePanels();
  liveSubtitleInput.value=streamSubtitleValue();
  liveSubtitleForm.hidden=false;
  requestAnimationFrame(()=>liveSubtitleInput.focus({preventScroll:true}));
});
document.querySelector("[data-live-subtitle-cancel]")?.addEventListener("click",()=>{
  if(liveSubtitleForm instanceof HTMLFormElement)liveSubtitleForm.hidden=true;
});
liveSubtitleForm?.addEventListener("submit",event=>{
  event.preventDefault();
  if(!(liveSubtitleInput instanceof HTMLInputElement))return;
  const source=document.querySelector("[data-stream-subtitle]");
  if(source instanceof HTMLInputElement)source.value=liveSubtitleInput.value.trim();
  updateStreamIdentity();
  liveSubtitleForm.hidden=true;
});

window.addEventListener("resize",()=>{
  document.querySelectorAll("[data-live-note]").forEach(note=>requestAnimationFrame(()=>clampLiveNote(note)));
});
navigator.mediaDevices?.addEventListener?.("devicechange",()=>{
  if(micDevicesKnown)void refreshAudioInputs(false);
});
window.addEventListener("pagehide",()=>{
  standingPreparationController?.abort();stopStandingMotion(false);
  if(standingPreviewUrl)URL.revokeObjectURL(standingPreviewUrl);standingPreviewUrl="";revokeStandingBackgroundUrls();
  if(!document.documentElement.dataset.broadcastPhase||document.documentElement.dataset.broadcastPhase!=="live")releasePreparedAudioStream();
},{once:true});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){if(standingMotionRaf)cancelAnimationFrame(standingMotionRaf);standingMotionRaf=0;}
  else if(selectedMode==="standing"&&standingPreviewReady)startStandingMotion();
});

if(compatibility.supported){
  setState("transport","対応","ready");
  setState("session","認可確認待ち");
  setState("composition","対象外","ready");
  setState("audio","接続待ち");
  setState("output","接続待ち");
}

setMicMonitor();
updateTestMetrics();
updateWizard();

document.addEventListener("orikuro:system-access-ready",()=>{
  systemAccessReady=true;
  systemPreparationRequested=true;
  setState("session","共通スタンバイ中","working");
  updateWizard();
});
document.addEventListener("orikuro:service-ready",()=>{
  refreshGrantState();
  setState("session","配信経路準備中","waiting");
  if(selectedMode==="standing")beginStandingPreparation();
});
window.addEventListener("orikuro:standing-backend-ready",()=>{
  if(selectedMode==="standing"&&!standingPreviewReady)setState("composition","専用バックエンド準備完了 / 表示素材受信中","working");
  updateWizard();
});
window.addEventListener("orikuro:stream-common-preparing",()=>{
  if(grantReady)setState("session","フロント共通スタンバイ中","working");
  updateWizard();
});
window.addEventListener("orikuro:stream-common-prepared",()=>{
  grantReady=!!getStreamRealtimeGrant();
  if(grantReady)setState("session","共通スタンバイ完了","ready");
  updateWizard();
});
window.addEventListener("orikuro:stream-common-prepare-failed",event=>{
  const message=event?.detail?.message||"共通スタンバイを完了できませんでした。";
  setState("session","共通スタンバイ失敗","error");
  setFeedback(message,"error");
  updateWizard();
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
  if(currentStep===4)setFeedback("配信準備完了","ready");
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
  clearLiveNotes();
  testMetrics={...TEST_METRICS_BASE};
  updateTestMetrics();
  closeLivePanels();
  if(liveSubtitleForm instanceof HTMLFormElement)liveSubtitleForm.hidden=true;
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
  goStep(4);
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
  if(currentStep!==4||!readyForStep(4)||!sessionReady()||!supportedModes.has(selectedMode))return;
  startButton.disabled=true;
  document.documentElement.dataset.broadcastPhase="starting";
  setFeedback("配信を開始しています…","working");
  window.dispatchEvent(new CustomEvent("orikuro:stream-start-request",{detail:{mode:selectedMode,radioPresetId:backgroundChoice}}));
});

if(!compatibility.supported&&root)root.hidden=true;
