import{getStreamRealtimeGrant}from"./assets/js/realtime-grant.js?v=20260914-grant-handoff1";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";
import{StandingFaceTracker}from"./standing-face-tracker.js?v=20261003-fixedruntime2";

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
  {name:"リスナー1",fanLevel:7,state:"応援中",background:true,firstTime:false},
  {name:"リスナー2",fanLevel:6,state:"視聴中",background:true,firstTime:false},
  {name:"リスナー3",fanLevel:null,state:"初見",background:false,firstTime:true},
  {name:"リスナー4",fanLevel:4,state:"視聴中",background:false,firstTime:false},
  {name:"リスナー5",fanLevel:3,state:"応援中",background:false,firstTime:false},
  {name:"リスナー6",fanLevel:2,state:"視聴中",background:false,firstTime:false},
  {name:"リスナー7",fanLevel:null,state:"初見",background:false,firstTime:true},
  {name:"リスナー8",fanLevel:null,state:"視聴中",background:true,firstTime:false},
  {name:"リスナー9",fanLevel:6,state:"視聴中",background:false,firstTime:false},
  {name:"リスナー10",fanLevel:5,state:"応援中",background:false,firstTime:false},
  {name:"リスナー11",fanLevel:null,state:"視聴中",background:false,firstTime:false},
  {name:"リスナー12",fanLevel:2,state:"視聴中",background:false,firstTime:false},
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
let liveMicActiveDeviceId="";
let liveMicActiveLabel="";
let liveMicChanging=false;
let liveMicEnumeration=0;
let grantReady=false;
let realtimeReady=false;
let systemPreparationRequested=false;
let systemAccessReady=document.documentElement.dataset.systemAccessReady==="true";
let standingPreviewReady=false;
let standingPreviewDecoded=false;
let standingPreviewLoading=false;
let standingPreviewUrl="";
let backgroundPreviewReady=false;
let backgroundPreviewLoading=false;
const standingBackgroundUrls=new Map();
let standingBackgroundsPrepared=false;
let standingActiveBackgroundIndex=-1;
let standingPreparationGeneration=0;
let standingPreparationController=null;
let standingPreparationPromise=null;
let standingActivationQueue=Promise.resolve();
let liveBackgroundSwitching=false;
let liveBackgroundGeneration=0;
let liveBackgroundIndependent=false;
let standingMotionRaf=0;
let standingShapePrevious=null;
let standingTrackedState={x:0,y:0,yaw:0,pitch:0,roll:0};
let standingRootState={x:0,y:0};
let standingMotionTarget={x:0,y:0,yaw:0,pitch:0,roll:0,confidence:0,timestampNS:0};
let standingMotionDynamics={
  lastInput:null,
  velocity:{x:0,y:0,yaw:0,pitch:0,roll:0},
  acceleration:{x:0,y:0},
  parts:{
    head:{yaw:0,pitch:0,roll:0},
    neck:{yaw:0,pitch:0,roll:0},
    chest:{yaw:0,pitch:0,roll:0},
    pelvis:{yaw:0,pitch:0,roll:0}
  },
  lastRenderMs:0
};
let standingFaceTracker=null;
let standingCameraReady=false;
let standingTrackingStart=null;
let standingPreliveComposition=null;
let startedAt=0;
let timer=0;
document.documentElement.dataset.broadcastPhase="prep";

const layoutToggle=document.querySelector("[data-layout-toggle]");
function updateLayoutToggle(){
  if(!(layoutToggle instanceof HTMLButtonElement))return;
  const mode=document.documentElement.dataset.streamLayout||"auto";
  layoutToggle.textContent=mode==="desktop"?"スマホ表示":"PC表示";
  layoutToggle.setAttribute("aria-pressed",mode==="desktop"?"true":"false");
}
layoutToggle?.addEventListener("click",()=>{
  const current=document.documentElement.dataset.streamLayout||"auto";
  const next=current==="desktop"?"mobile":"desktop";
  const setter=window.__orikuroSetStreamLayout;
  if(typeof setter==="function")setter(next);
});
updateLayoutToggle();


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
    ?standingPreviewReady&&standingPreviewDecoded&&standingChoiceReady()
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

function releaseUnusedStandingBackgroundUrls(keepIndex=-1){
  for(const [index,url] of standingBackgroundUrls){
    if(index===keepIndex)continue;
    URL.revokeObjectURL(url);
    standingBackgroundUrls.delete(index);
  }
}
function revokeStandingBackgroundUrls(){
  releaseUnusedStandingBackgroundUrls(-1);
  standingBackgroundsPrepared=false;
  document.querySelectorAll("[data-standing-background-swatch]").forEach(el=>{if(el instanceof HTMLElement)el.style.backgroundImage="";});
  document.querySelectorAll("[data-standing-background-index]").forEach(button=>{if(button instanceof HTMLButtonElement)button.disabled=true;});
}
function resetStandingMotionFrame(){
  window.__orikuroStandingFrameState={x:0,y:0,z:0,yaw:0,pitch:0,roll:0,confidence:1,lod:0,faceLocalWarp:0,parts:null};
  document.querySelectorAll("[data-standing-preview-image]").forEach(img=>{if(img instanceof HTMLImageElement)img.style.transform="";});
}
function stopStandingMotion(reset=true){
  if(standingMotionRaf)cancelAnimationFrame(standingMotionRaf);
  standingMotionRaf=0;standingShapePrevious=null;
  standingTrackedState={x:0,y:0,yaw:0,pitch:0,roll:0};
  standingRootState={x:0,y:0};
  standingMotionTarget={x:0,y:0,yaw:0,pitch:0,roll:0,confidence:0,timestampNS:0};
  resetStandingMotionDynamics();
  if(reset)resetStandingMotionFrame();
}
function standingAssetViewActive(el){
  const live=el.closest("[data-live-screen]");
  if(live)return !live.hidden;
  const step=el.closest("[data-wizard-step]");
  const wizard=el.closest("[data-broadcast-wizard]");
  const retainedFrame=document.documentElement.dataset.broadcastPhase==="live"&&step?.dataset.wizardStep==="4";
  if(wizard?.hidden&&!retainedFrame)return false;
  return !step||!step.hidden||retainedFrame;
}
function syncVisibleStandingAssets(){
  const available=selectedMode==="standing"&&standingPreviewReady&&!!standingPreviewUrl;
  document.querySelectorAll("[data-standing-preview-image]").forEach(img=>{
    if(!(img instanceof HTMLImageElement))return;
    if(available&&standingAssetViewActive(img)){
      if(img.getAttribute("src")!==standingPreviewUrl)img.src=standingPreviewUrl;
      img.hidden=false;
    }else{
      img.hidden=true;
      // Do not detach the first DOM image while loadStandingPreview() awaits decode().
      // Microphone/device events also call updateWizard() during that pending decode.
      const primary=document.querySelector("[data-standing-preview-image]");
      if(standingPreviewLoading&&img===primary&&img.hasAttribute("src"))return;
      if(img.hasAttribute("src"))img.removeAttribute("src");
    }
  });
  const currentState=window.__orikuroStandingFrameState;
  if(available&&currentState&&typeof currentState==="object")applyStandingPreviewState(currentState);
  renderStandingBackgroundChoice();
}
const STANDING_SHAPE_GAIN_X=4;
const STANDING_SHAPE_GAIN_Y=4;
// Equivalent to the previous 0.30/frame smoothing at 60fps, but time based.
const STANDING_ROOT_TIME_CONSTANT_MS=46.7;
const STANDING_RETARGET_GAIN=Object.freeze({
  head:.80,
  chest:.68,
  pelvis:.55,
  neck:(.80+.68)/2,
});
const STANDING_FILTER_TIME_MS=Object.freeze({
  head:32,
  chest:42,
  pelvis:48,
  neck:(32+42)/2,
});
const STANDING_POSE_INPUT_NORMALIZER=Object.freeze({yaw:.22,pitch:.18});
const STANDING_POSE_NORMAL_LIMIT_DEG=Object.freeze({yaw:12,pitch:8,roll:18});
const STANDING_POSE_HARD_LIMIT_DEG=Object.freeze({yaw:18,pitch:14,roll:30});
const STANDING_MAX_SPEED_HPS=3;
const STANDING_MAX_ACCEL_HPS2=24;
const STANDING_MAX_ANGULAR_SPEED_DPS=360;
const STANDING_BALANCE_SHIFT_MAX=.025;
const STANDING_TORSO_COUNTER_MAX_DEG=6;
const STANDING_PELVIS_COUNTER_MAX_DEG=4;

// Fixed front-facing definition in YuNet face-box coordinates.
// The face geometry and screen Root are immutable system references.
// Runtime frames are measured against them; no user/session Neutral is learned.
const STANDING_CANONICAL_FRONT=Object.freeze([
  Object.freeze({x:.32,y:.38}),
  Object.freeze({x:.68,y:.38}),
  Object.freeze({x:.50,y:.56}),
  Object.freeze({x:.38,y:.73}),
  Object.freeze({x:.62,y:.73}),
]);
const STANDING_CANONICAL_ROOT=Object.freeze({x:.5,y:.5});
const STANDING_CANONICAL_NOSE_RATIO=(.56-.38)/(.73-.38);
const STANDING_FIXED_DEAD_ZONE=.003;
const STANDING_SCREEN_FRONT_PROFILES=Object.freeze({
  iphone:Object.freeze({faceHeightGain:.18,safeTopGain:.20,minYOffset:.035,maxYOffset:.14,landscapeYScale:.15,pitchGain:.055}),
  ipad:Object.freeze({faceHeightGain:.22,safeTopGain:.15,minYOffset:.030,maxYOffset:.16,landscapeYScale:.12,pitchGain:.050}),
  androidPhone:Object.freeze({faceHeightGain:.17,safeTopGain:.15,minYOffset:.030,maxYOffset:.14,landscapeYScale:.15,pitchGain:.050}),
  androidTablet:Object.freeze({faceHeightGain:.21,safeTopGain:.12,minYOffset:.025,maxYOffset:.16,landscapeYScale:.12,pitchGain:.045}),
  mobileGeneric:Object.freeze({faceHeightGain:.18,safeTopGain:.12,minYOffset:.030,maxYOffset:.14,landscapeYScale:.15,pitchGain:.050}),
  desktop:Object.freeze({faceHeightGain:.30,safeTopGain:0,minYOffset:.020,maxYOffset:.16,landscapeYScale:1,pitchGain:.040}),
});
let standingScreenFrontProfileCache=null;
let standingSafeAreaProbe=null;

function clampStandingMotion(value,min,max){return Math.max(min,Math.min(max,value));}
function standingShapeAxis(value,deadZone=STANDING_FIXED_DEAD_ZONE){
  const zone=Math.max(0,Number(deadZone)||0);
  const magnitude=Math.abs(value);
  if(magnitude<=zone)return 0;
  return Math.sign(value)*(magnitude-zone);
}
function medianStanding(values){
  const sorted=[...values].filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return 0;
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])*.5;
}
function standingLineTilt(a,b){
  let angle=Math.atan2(b.y-a.y,b.x-a.x);
  while(angle>Math.PI*.5)angle-=Math.PI;
  while(angle<-Math.PI*.5)angle+=Math.PI;
  return angle;
}
function standingFollowValue(current,target,dtMs,timeConstantMs){
  const tau=Math.max(1,Number(timeConstantMs)||1);
  const dt=clampStandingMotion(Number(dtMs)||0,0,50);
  const alpha=1-Math.exp(-dt/tau);
  return current+(target-current)*alpha;
}
function standingPoseToDegrees(pose){
  const yaw=clampStandingMotion(
    (Number(pose?.yaw)||0)/STANDING_POSE_INPUT_NORMALIZER.yaw*STANDING_POSE_NORMAL_LIMIT_DEG.yaw,
    -STANDING_POSE_HARD_LIMIT_DEG.yaw,STANDING_POSE_HARD_LIMIT_DEG.yaw
  );
  const pitch=clampStandingMotion(
    (Number(pose?.pitch)||0)/STANDING_POSE_INPUT_NORMALIZER.pitch*STANDING_POSE_NORMAL_LIMIT_DEG.pitch,
    -STANDING_POSE_HARD_LIMIT_DEG.pitch,STANDING_POSE_HARD_LIMIT_DEG.pitch
  );
  const roll=clampStandingMotion(
    (Number(pose?.roll)||0)*180/Math.PI,
    -STANDING_POSE_HARD_LIMIT_DEG.roll,STANDING_POSE_HARD_LIMIT_DEG.roll
  );
  return {yaw,pitch,roll};
}
function resetStandingMotionDynamics(){
  standingMotionDynamics={
    lastInput:null,
    velocity:{x:0,y:0,yaw:0,pitch:0,roll:0},
    acceleration:{x:0,y:0},
    parts:{
      head:{yaw:0,pitch:0,roll:0},
      neck:{yaw:0,pitch:0,roll:0},
      chest:{yaw:0,pitch:0,roll:0},
      pelvis:{yaw:0,pitch:0,roll:0}
    },
    lastRenderMs:0
  };
}
function updateStandingMotionDynamics(target,timestampNS){
  const ts=Number(timestampNS);
  const previous=standingMotionDynamics.lastInput;
  if(!previous||!Number.isSafeInteger(ts)||ts<=previous.timestampNS){
    standingMotionDynamics.lastInput={...target,timestampNS:ts};
    standingMotionDynamics.velocity={x:0,y:0,yaw:0,pitch:0,roll:0};
    standingMotionDynamics.acceleration={x:0,y:0};
    return;
  }
  const dt=clampStandingMotion((ts-previous.timestampNS)/1_000_000_000,1/120,.10);
  const vx=clampStandingMotion((target.x-previous.x)/dt,-STANDING_MAX_SPEED_HPS,STANDING_MAX_SPEED_HPS);
  const vy=clampStandingMotion((target.y-previous.y)/dt,-STANDING_MAX_SPEED_HPS,STANDING_MAX_SPEED_HPS);
  const vyaw=clampStandingMotion((target.yaw-previous.yaw)/dt,-STANDING_MAX_ANGULAR_SPEED_DPS,STANDING_MAX_ANGULAR_SPEED_DPS);
  const vpitch=clampStandingMotion((target.pitch-previous.pitch)/dt,-STANDING_MAX_ANGULAR_SPEED_DPS,STANDING_MAX_ANGULAR_SPEED_DPS);
  const vroll=clampStandingMotion((target.roll-previous.roll)/dt,-STANDING_MAX_ANGULAR_SPEED_DPS,STANDING_MAX_ANGULAR_SPEED_DPS);
  const oldVelocity=standingMotionDynamics.velocity;
  const ax=clampStandingMotion((vx-oldVelocity.x)/dt,-STANDING_MAX_ACCEL_HPS2,STANDING_MAX_ACCEL_HPS2);
  const ay=clampStandingMotion((vy-oldVelocity.y)/dt,-STANDING_MAX_ACCEL_HPS2,STANDING_MAX_ACCEL_HPS2);
  standingMotionDynamics.velocity={x:vx,y:vy,yaw:vyaw,pitch:vpitch,roll:vroll};
  standingMotionDynamics.acceleration={x:ax,y:ay};
  standingMotionDynamics.lastInput={...target,timestampNS:ts};
}
function standingPartTarget(pose,gain,counterRoll=0){
  return {
    yaw:pose.yaw*gain,
    pitch:pose.pitch*gain,
    roll:clampStandingMotion(pose.roll*gain+counterRoll,-STANDING_POSE_HARD_LIMIT_DEG.roll,STANDING_POSE_HARD_LIMIT_DEG.roll)
  };
}
function followStandingPart(current,target,dtMs,tauMs){
  return {
    yaw:standingFollowValue(current.yaw,target.yaw,dtMs,tauMs),
    pitch:standingFollowValue(current.pitch,target.pitch,dtMs,tauMs),
    roll:standingFollowValue(current.roll,target.roll,dtMs,tauMs)
  };
}
function standingCompositePose(parts){
  return {
    yaw:(parts.head.yaw+parts.neck.yaw+parts.chest.yaw+parts.pelvis.yaw)/4,
    pitch:(parts.head.pitch+parts.neck.pitch+parts.chest.pitch+parts.pelvis.pitch)/4,
    roll:(parts.head.roll+parts.neck.roll+parts.chest.roll+parts.pelvis.roll)/4
  };
}
function standingScreenFrontProfile(){
  if(standingScreenFrontProfileCache)return standingScreenFrontProfileCache;
  const ua=navigator.userAgent||"";
  const platform=navigator.platform||"";
  const touch=Number(navigator.maxTouchPoints)||0;
  const ipad=/iPad/i.test(ua)||(platform==="MacIntel"&&touch>1);
  const iphone=/iPhone|iPod/i.test(ua);
  const android=/Android/i.test(ua);
  const androidTablet=android&&!/Mobile/i.test(ua);
  const mobile=/Mobile/i.test(ua)||touch>1;
  const id=iphone?"iphone":ipad?"ipad":androidTablet?"androidTablet":android?"androidPhone":mobile?"mobileGeneric":"desktop";
  standingScreenFrontProfileCache={id,...STANDING_SCREEN_FRONT_PROFILES[id]};
  return standingScreenFrontProfileCache;
}
function standingSafeAreaTopRatio(){
  if(!document.body||!Number.isFinite(window.innerHeight)||window.innerHeight<=0)return 0;
  if(!(standingSafeAreaProbe instanceof HTMLElement)){
    const probe=document.createElement("div");
    probe.setAttribute("aria-hidden","true");
    probe.style.cssText="position:fixed;visibility:hidden;pointer-events:none;inset:0 auto auto 0;width:0;height:0;padding-top:env(safe-area-inset-top,0px)";
    document.body.append(probe);
    standingSafeAreaProbe=probe;
  }
  const px=Number.parseFloat(getComputedStyle(standingSafeAreaProbe).paddingTop)||0;
  return clampStandingMotion(px/window.innerHeight,0,.15);
}
function standingScreenFrontReference(shape){
  const profile=standingScreenFrontProfile();
  const faceHeight=clampStandingMotion(Number(shape?.contourHeight)||0,.12,.82);
  const portrait=typeof matchMedia==="function"?matchMedia("(orientation: portrait)").matches:window.innerHeight>=window.innerWidth;
  const safeTop=portrait?standingSafeAreaTopRatio():0;
  const orientationScale=portrait?1:profile.landscapeYScale;
  const rawYOffset=(faceHeight*profile.faceHeightGain+safeTop*profile.safeTopGain)*orientationScale;
  const minYOffset=portrait?profile.minYOffset:0;
  const maxYOffset=portrait?profile.maxYOffset:profile.maxYOffset*profile.landscapeYScale;
  const yOffset=clampStandingMotion(rawYOffset,minYOffset,maxYOffset);
  const pitchOffset=faceHeight*profile.pitchGain*orientationScale;
  return Object.freeze({
    x:STANDING_CANONICAL_ROOT.x,
    y:STANDING_CANONICAL_ROOT.y+yOffset,
    pitch:pitchOffset,
    profile:profile.id,
  });
}
function fixedCanonicalPose(shape){
  const [rightEye,leftEye,nose,rightMouth,leftMouth]=shape.local;
  const eyeMid={x:(rightEye.x+leftEye.x)*.5,y:(rightEye.y+leftEye.y)*.5};
  const mouthMid={x:(rightMouth.x+leftMouth.x)*.5,y:(rightMouth.y+leftMouth.y)*.5};
  const eyeSpan=Math.max(Number.EPSILON,Math.abs(leftEye.x-rightEye.x));
  const mouthSpan=Math.max(Number.EPSILON,Math.abs(leftMouth.x-rightMouth.x));
  const verticalSpan=mouthMid.y-eyeMid.y;
  if(!Number.isFinite(verticalSpan)||verticalSpan<=Number.EPSILON)return {yaw:0,pitch:0,roll:0};

  const roll=standingLineTilt(rightEye,leftEye);
  const yawEye=(nose.x-eyeMid.x)/eyeSpan;
  const yawMouth=(nose.x-mouthMid.x)/mouthSpan;
  const yaw=medianStanding([yawEye,yawMouth]);
  const pitch=(nose.y-eyeMid.y)/verticalSpan-STANDING_CANONICAL_NOSE_RATIO;
  return {yaw,pitch,roll};
}
function standingMotionBounds(){
  const images=Array.from(document.querySelectorAll("[data-standing-preview-image]"));
  const usable=item=>item instanceof HTMLImageElement&&item.hasAttribute("src")&&item.naturalWidth>0&&item.naturalHeight>0;
  const live=document.documentElement.dataset.broadcastPhase==="live";
  const image=live
    ? images.find(item=>usable(item)&&item.closest("[data-live-screen]")&&!item.closest("[data-live-screen]").hidden)
    : images.find(item=>usable(item)&&standingAssetViewActive(item));
  if(!(image instanceof HTMLImageElement))return null;
  const layer=image.closest(".broadcast-scene-character");
  const frame=image.closest(".broadcast-background-preview,.broadcast-final-preview,.broadcast-live-preview");
  if(!(layer instanceof HTMLElement)||!(frame instanceof HTMLElement))return null;
  const frameRect=frame.getBoundingClientRect(),layerRect=layer.getBoundingClientRect();
  if(frameRect.width<=0||frameRect.height<=0||layerRect.width<=0||layerRect.height<=0)return null;
  const scale=Math.min(layerRect.width/image.naturalWidth,layerRect.height/image.naturalHeight);
  if(!Number.isFinite(scale)||scale<=0)return null;
  const contentWidth=image.naturalWidth*scale,contentHeight=image.naturalHeight*scale;
  const centerX=(layerRect.left-frameRect.left)+(layerRect.width-contentWidth)/2+contentWidth/2;
  const centerY=(layerRect.top-frameRect.top)+(layerRect.height-contentHeight)+contentHeight/2;
  const unit=frameRect.height;
  const minX=-centerX/unit,maxX=(frameRect.width-centerX)/unit;
  const minY=-centerY/unit,maxY=(frameRect.height-centerY)/unit;
  if(![minX,maxX,minY,maxY].every(Number.isFinite)||minX>maxX||minY>maxY)return null;
  return {minX,maxX,minY,maxY,unit};
}
function standingMotionWithinFrame(x,y,bounds=standingMotionBounds()){
  if(!bounds)return {x,y};
  return {
    x:clampStandingMotion(x,bounds.minX,bounds.maxX),
    y:clampStandingMotion(y,bounds.minY,bounds.maxY)
  };
}
function buildStandingShape(sample){
  if(!Array.isArray(sample?.shape)||sample.shape.length!==5)return null;
  if(!Array.isArray(sample?.localShape)||sample.localShape.length!==STANDING_CANONICAL_FRONT.length)return null;

  const points=sample.shape.map(point=>({x:Number(point?.x),y:Number(point?.y)}));
  const local=sample.localShape.map(point=>({x:Number(point?.x),y:Number(point?.y)}));
  const contourCenter={x:Number(sample?.centerX),y:Number(sample?.centerY)};
  const contourWidth=Number(sample?.width);
  const contourHeight=Number(sample?.height);
  const contourSize=Number(sample?.size);

  if(points.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1))return null;
  if(local.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<-.25||point.x>1.25||point.y<-.25||point.y>1.25))return null;
  if(!Number.isFinite(contourCenter.x)||!Number.isFinite(contourCenter.y)||contourCenter.x<0||contourCenter.x>1||contourCenter.y<0||contourCenter.y>1)return null;
  if(!Number.isFinite(contourWidth)||!Number.isFinite(contourHeight)||contourWidth<=0||contourHeight<=0||contourWidth>1||contourHeight>1)return null;
  if(!Number.isFinite(contourSize)||contourSize<.0001||contourSize>1)return null;

  // Solve the current Root from the immutable Canonical Front projected into
  // the detected face box. Eyes and mouth corners participate; the nose does not,
  // because its 2D displacement is the primary yaw/pitch signal.
  const rootX=[contourCenter.x];
  const rootY=[contourCenter.y];
  for(const index of [0,1,3,4]){
    const canonical=STANDING_CANONICAL_FRONT[index];
    rootX.push(points[index].x-(canonical.x-.5)*contourWidth);
    rootY.push(points[index].y-(canonical.y-.5)*contourHeight);
  }
  const center={x:medianStanding(rootX),y:medianStanding(rootY)};

  return {points,local,center,contourCenter,contourWidth,contourHeight,radius:contourSize};
}
function standingShapeFromFront(current){
  const screenFront=standingScreenFrontReference(current);
  const rawPose=fixedCanonicalPose(current);
  const pose={...rawPose,pitch:rawPose.pitch-screenFront.pitch};
  const translation={
    x:current.center.x-screenFront.x,
    y:current.center.y-screenFront.y
  };
  return {translation,pose,screenFront};
}
function captureStandingPreliveComposition(){
  const frame=document.querySelector('[data-wizard-step="4"] .broadcast-final-preview');
  const image=frame?.querySelector("[data-standing-preview-image]");
  const layer=image?.closest(".broadcast-scene-character");
  if(!(frame instanceof HTMLElement)||!(image instanceof HTMLImageElement)||!(layer instanceof HTMLElement)||image.naturalWidth<1||image.naturalHeight<1)return null;
  const frameRect=frame.getBoundingClientRect(),layerRect=layer.getBoundingClientRect();
  if(frameRect.width<=0||frameRect.height<=0||layerRect.width<=0||layerRect.height<=0)return null;
  const scale=Math.min(layerRect.width/image.naturalWidth,layerRect.height/image.naturalHeight);
  if(!Number.isFinite(scale)||scale<=0)return null;
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  const left=(layerRect.left-frameRect.left)+(layerRect.width-width)/2;
  const top=(layerRect.top-frameRect.top)+(layerRect.height-height);
  const value={
    centerX:(left+width/2)/frameRect.width,
    bottom:(top+height)/frameRect.height,
    height:height/frameRect.height,
    aspect:image.naturalWidth/image.naturalHeight
  };
  if(!Object.values(value).every(Number.isFinite)||value.height<=0||value.aspect<=0)return null;
  standingPreliveComposition=value;
  return value;
}
function clearStandingLiveComposition(){
  const layer=document.querySelector("[data-live-character-layer]");
  const image=layer?.querySelector("[data-standing-preview-image]");
  if(layer instanceof HTMLElement)layer.style.removeProperty("inset");
  if(image instanceof HTMLImageElement){
    for(const property of ["inset","left","top","right","bottom","width","height","object-fit"])image.style.removeProperty(property);
  }
}
function applyStandingLiveComposition(){
  if(selectedMode!=="standing"||!standingPreliveComposition)return;
  const frame=document.querySelector("[data-live-screen] .broadcast-live-preview");
  const layer=document.querySelector("[data-live-character-layer]");
  const image=layer?.querySelector("[data-standing-preview-image]");
  if(!(frame instanceof HTMLElement)||!(layer instanceof HTMLElement)||!(image instanceof HTMLImageElement)||image.naturalWidth<1||image.naturalHeight<1)return;
  const frameRect=frame.getBoundingClientRect();
  if(frameRect.width<=0||frameRect.height<=0)return;
  const composition=standingPreliveComposition;
  const height=composition.height*frameRect.height;
  const width=height*composition.aspect;
  const left=composition.centerX*frameRect.width-width/2;
  const top=composition.bottom*frameRect.height-height;
  if(![height,width,left,top].every(Number.isFinite)||height<=0||width<=0)return;
  layer.style.inset="0";
  image.style.inset="auto";
  image.style.left=left.toFixed(2)+"px";
  image.style.top=top.toFixed(2)+"px";
  image.style.right="auto";
  image.style.bottom="auto";
  image.style.width=width.toFixed(2)+"px";
  image.style.height=height.toFixed(2)+"px";
  image.style.objectFit="fill";
}
function applyStandingPreviewState(state){
  window.__orikuroStandingFrameState=state;
  document.querySelectorAll("[data-standing-preview-image]").forEach(img=>{
    if(!(img instanceof HTMLImageElement)||!img.hasAttribute("src")||!standingAssetViewActive(img))return;
    const frame=img.closest(".broadcast-background-preview,.broadcast-final-preview,.broadcast-live-preview");
    const unit=frame instanceof HTMLElement?frame.clientHeight:0;
    if(unit<=0)return;
    const yaw=clampStandingMotion(Number(state.yaw)||0,-STANDING_POSE_HARD_LIMIT_DEG.yaw,STANDING_POSE_HARD_LIMIT_DEG.yaw);
    const pitch=clampStandingMotion(Number(state.pitch)||0,-STANDING_POSE_HARD_LIMIT_DEG.pitch,STANDING_POSE_HARD_LIMIT_DEG.pitch);
    const roll=clampStandingMotion(Number(state.roll)||0,-STANDING_POSE_HARD_LIMIT_DEG.roll,STANDING_POSE_HARD_LIMIT_DEG.roll);
    const live=!!img.closest("[data-live-screen]");
    if(live&&window.__orikuroCartoonActRunning===true)return;
    const baseX=(state.x*unit*.35);
    const baseY=(state.y*unit*.25);
    const baseRoll=roll*.18;
    const baseSkew=clampStandingMotion(yaw*.04,-1.5,1.5);
    const baseScaleY=clampStandingMotion(1-pitch*.0015,.97,1.03);
    img.style.transformOrigin="50% 62%";
    img.style.transform=`translate3d(${baseX.toFixed(2)}px,${baseY.toFixed(2)}px,0) rotate(${baseRoll.toFixed(3)}deg) skewX(${baseSkew.toFixed(3)}deg) scale(1,${baseScaleY.toFixed(4)})`;
  });
}
function acceptStandingFaceRegion(sample){
  if(selectedMode!=="standing"||!sample||typeof sample!=="object")return;
  const frameId=Number(sample.frameId),timestampNS=Number(sample.timestampNS),confidence=Number(sample.confidence);
  if(!Number.isSafeInteger(frameId)||frameId<=0||!Number.isSafeInteger(timestampNS)||timestampNS<=0)return;
  const previous=standingShapePrevious;
  if(previous&&(frameId<=previous.frameId||timestampNS<=previous.timestampNS))return;

  if(sample.present!==true){
    standingShapePrevious={frameId,timestampNS,shape:null,confidence:0};
    // Detection loss is a normal runtime condition. Preparation remains complete;
    // character motion freezes at the last displayed state until tracking resumes.
    if(standingMotionRaf)cancelAnimationFrame(standingMotionRaf);
    standingMotionRaf=0;
    standingRootState={x:standingTrackedState.x,y:standingTrackedState.y};
    standingMotionTarget={...standingMotionTarget,x:standingTrackedState.x,y:standingTrackedState.y,yaw:standingTrackedState.yaw,pitch:standingTrackedState.pitch,roll:standingTrackedState.roll,confidence:0};
    standingMotionDynamics.lastInput=null;
    standingMotionDynamics.acceleration={x:0,y:0};
    standingMotionDynamics.velocity={x:0,y:0,yaw:0,pitch:0,roll:0};
    return;
  }

  const currentShape=buildStandingShape(sample);
  if(!currentShape)return;
  const current={frameId,timestampNS,shape:currentShape,confidence:Number.isFinite(confidence)?clampStandingMotion(confidence,0,1):0};
  standingShapePrevious=current;

  const direction=standingShapeFromFront(currentShape);
  if(!direction)return;

  // Root XY and face pose are separate signals. In particular, Pitch must
  // never be converted into Root Y; doing so makes a front-facing phone/face
  // appear as a large vertical character translation.
  const translateX=standingShapeAxis(direction.translation.x);
  const translateY=standingShapeAxis(direction.translation.y);
  const moveX=translateX;
  const moveY=translateY;
  const neutralLocked=translateX===0&&translateY===0;

  const bounds=standingMotionBounds();
  if(!bounds){
    standingMotionTarget={...standingMotionTarget,confidence:current.confidence};
    return;
  }

  const targetX=neutralLocked?0:moveX*STANDING_SHAPE_GAIN_X;
  const targetY=neutralLocked?0:moveY*STANDING_SHAPE_GAIN_Y;
  const poseDeg=standingPoseToDegrees(direction.pose);
  if(!Number.isFinite(targetX)||!Number.isFinite(targetY)||Object.values(poseDeg).some(value=>!Number.isFinite(value)))return;
  const bounded=standingMotionWithinFrame(targetX,targetY,bounds);
  const target={
    x:bounded.x,y:bounded.y,
    yaw:poseDeg.yaw,pitch:poseDeg.pitch,roll:poseDeg.roll,
    confidence:current.confidence,timestampNS
  };
  updateStandingMotionDynamics(target,timestampNS);
  standingMotionTarget=target;
  startStandingMotion();
}
function startStandingMotion(){
  if(standingMotionRaf||selectedMode!=="standing"||!standingPreviewReady||document.hidden)return;
  const tick=now=>{
    standingMotionRaf=0;
    if(selectedMode!=="standing"||!standingPreviewReady||document.hidden)return;
    const last=standingMotionDynamics.lastRenderMs||now-16.6667;
    const dtMs=clampStandingMotion(now-last,1,50);
    standingMotionDynamics.lastRenderMs=now;

    const boundedTarget=standingMotionWithinFrame(standingMotionTarget.x,standingMotionTarget.y);
    standingMotionTarget={...standingMotionTarget,x:boundedTarget.x,y:boundedTarget.y};

    const rootX=standingFollowValue(standingRootState.x,standingMotionTarget.x,dtMs,STANDING_ROOT_TIME_CONSTANT_MS);
    const rootY=standingFollowValue(standingRootState.y,standingMotionTarget.y,dtMs,STANDING_ROOT_TIME_CONSTANT_MS);
    standingRootState=standingMotionWithinFrame(rootX,rootY);

    const accelXNorm=clampStandingMotion(standingMotionDynamics.acceleration.x/STANDING_MAX_ACCEL_HPS2,-1,1);
    const accelYNorm=clampStandingMotion(standingMotionDynamics.acceleration.y/STANDING_MAX_ACCEL_HPS2,-1,1);
    const balanceShift={
      x:-accelXNorm*STANDING_BALANCE_SHIFT_MAX,
      y:-accelYNorm*STANDING_BALANCE_SHIFT_MAX
    };
    const torsoCounter=-accelXNorm*STANDING_TORSO_COUNTER_MAX_DEG;
    const pelvisCounter=-accelXNorm*STANDING_PELVIS_COUNTER_MAX_DEG;

    const pose={yaw:standingMotionTarget.yaw,pitch:standingMotionTarget.pitch,roll:standingMotionTarget.roll};
    const targets={
      head:standingPartTarget(pose,STANDING_RETARGET_GAIN.head),
      neck:standingPartTarget(pose,STANDING_RETARGET_GAIN.neck),
      chest:standingPartTarget(pose,STANDING_RETARGET_GAIN.chest,torsoCounter),
      pelvis:standingPartTarget(pose,STANDING_RETARGET_GAIN.pelvis,pelvisCounter)
    };
    const parts=standingMotionDynamics.parts;
    standingMotionDynamics.parts={
      head:followStandingPart(parts.head,targets.head,dtMs,STANDING_FILTER_TIME_MS.head),
      neck:followStandingPart(parts.neck,targets.neck,dtMs,STANDING_FILTER_TIME_MS.neck),
      chest:followStandingPart(parts.chest,targets.chest,dtMs,STANDING_FILTER_TIME_MS.chest),
      pelvis:followStandingPart(parts.pelvis,targets.pelvis,dtMs,STANDING_FILTER_TIME_MS.pelvis)
    };

    const composite=standingCompositePose(standingMotionDynamics.parts);
    const targetComposite=standingCompositePose(targets);
    const renderedPosition=standingMotionWithinFrame(standingRootState.x+balanceShift.x,standingRootState.y+balanceShift.y);
    standingTrackedState={
      x:renderedPosition.x,y:renderedPosition.y,
      yaw:composite.yaw,pitch:composite.pitch,roll:composite.roll
    };
    applyStandingPreviewState({
      ...standingTrackedState,z:0,
      confidence:standingMotionTarget.confidence,lod:0,faceLocalWarp:0,
      velocity:{...standingMotionDynamics.velocity},
      acceleration:{...standingMotionDynamics.acceleration},
      parts:{
        head:{...standingMotionDynamics.parts.head},
        neck:{...standingMotionDynamics.parts.neck},
        chest:{...standingMotionDynamics.parts.chest},
        pelvis:{...standingMotionDynamics.parts.pelvis}
      }
    });

    const positionSettled=Math.abs(standingMotionTarget.x-standingRootState.x)<.0002&&Math.abs(standingMotionTarget.y-standingRootState.y)<.0002;
    const rotationSettled=Math.abs(targetComposite.yaw-composite.yaw)<.05
      &&Math.abs(targetComposite.pitch-composite.pitch)<.05
      &&Math.abs(targetComposite.roll-composite.roll)<.05;
    const balanceSettled=Math.abs(balanceShift.x)<.0002&&Math.abs(balanceShift.y)<.0002;
    if(!(positionSettled&&rotationSettled&&balanceSettled))standingMotionRaf=requestAnimationFrame(tick);
  };
  standingMotionRaf=requestAnimationFrame(tick);
}

function liveBackgroundStatus(message,state="waiting"){
  const el=document.querySelector("[data-live-background-status]");
  if(el){el.textContent=message;el.dataset.state=state;}
}
function updateLiveBackgroundOptions(){
  const current=document.querySelector("[data-live-background-current]");
  if(current){
    const index=standingImageIndex();
    const label=index>=0?"登録背景"+String(index+1):(radioPresets.get(backgroundChoice)?.label||"未選択");
    current.textContent="使用中: "+label;
  }
  document.querySelectorAll("[data-live-background-choice]").forEach(button=>{
    if(!(button instanceof HTMLButtonElement))return;
    const choice=button.dataset.liveBackgroundChoice||"";
    const index=standingImageIndex(choice);
    const allowed=(index>=0 ? selectedMode==="standing"&&standingBackgroundsPrepared : radioPresets.has(choice));
    const visible=selectedMode==="standing"||index<0;
    button.hidden=!visible;
    button.disabled=!allowed||liveBackgroundSwitching||document.documentElement.dataset.broadcastPhase!=="live";
    button.classList.toggle("is-selected",backgroundChoice===choice);
    button.setAttribute("aria-pressed",backgroundChoice===choice?"true":"false");
    if(index>=0){
      const thumbnail=button.querySelector("[data-live-background-thumb]");
      const original=document.querySelector('[data-standing-background-swatch="'+String(index)+'"]');
      if(thumbnail instanceof HTMLElement&&original instanceof HTMLElement)thumbnail.style.backgroundImage=original.style.backgroundImage;
    }
  });
}
function renderStandingBackgroundChoice(){
  const imageIndex=standingImageIndex();
  const imageUrl=imageIndex>=0?standingBackgroundUrls.get(imageIndex)||"":"";
  const solid=radioPresets.get(backgroundChoice);
  const useImage=selectedMode==="standing"&&imageIndex>=0&&!!imageUrl;
  const useSolid=selectedMode==="standing"&&!!solid;
  document.querySelectorAll("[data-background-preview-image]").forEach(el=>{
    if(!(el instanceof HTMLImageElement))return;
    if(useImage&&standingAssetViewActive(el)&&!(liveBackgroundIndependent&&document.documentElement.dataset.broadcastPhase==="live"&&el.closest('[data-wizard-step="4"]'))){
      if(el.getAttribute("src")!==imageUrl)el.src=imageUrl;
      el.hidden=false;
    }else{
      el.hidden=true;
      if(el.hasAttribute("src"))el.removeAttribute("src");
    }
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
  if(payload?.ok!==true||payload?.result?.standingReady!==true||payload?.result?.backgroundCount!==STANDING_IMAGE_COUNT||!Array.isArray(payload?.result?.backgroundReady)||payload.result.backgroundReady.length!==STANDING_IMAGE_COUNT||payload.result.backgroundReady.some(value=>value!==true))throw new Error("STANDING_PREPARE_INVALID");
  standingBackgroundsPrepared=true;
  document.querySelectorAll("[data-standing-background-index]").forEach(button=>{if(button instanceof HTMLButtonElement)button.disabled=false;});
  window.dispatchEvent(new CustomEvent("orikuro:standing-backend-ready",{detail:{
    standingReady:payload.result.standingReady===true,
    backgroundCount:payload.result.backgroundCount
  }}));
}
async function verifyStandingPreviewDecode(url,signal,generation){
  const probe=new Image();
  probe.decoding="async";
  probe.src=url;
  try{
    await probe.decode();
  }catch{
    if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing"||standingPreviewUrl!==url)return;
    standingPreviewDecoded=false;
    standingPreviewReady=false;
    standingPreviewUrl="";
    URL.revokeObjectURL(url);
    syncVisibleStandingAssets();
    setState("composition","立ち絵表示失敗","error");
    setFeedback("立ち絵の受信は完了しましたが、画像デコードに失敗しました。","error");
    updateWizard();
    return;
  }
  if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing"||standingPreviewUrl!==url)return;
  standingPreviewDecoded=true;
  if(backgroundPreviewReady){
    setState("composition","立ち絵・背景準備完了","ready");
    window.dispatchEvent(new CustomEvent("orikuro:standing-assets-ready",{detail:{backgroundCount:STANDING_IMAGE_COUNT,lazyFullResolution:true}}));
    setFeedback("立ち絵と背景の表示準備が完了しました。","ready");
  }else{
    setState("composition","立ち絵表示準備完了 / 背景を準備中","working");
  }
  updateWizard();
}
async function loadStandingPreview(signal,generation){
  if(selectedMode!=="standing"||standingPreviewReady||standingPreviewLoading)return;
  const current=getStreamRealtimeGrant();if(!current)return;
  standingPreviewLoading=true;standingPreviewDecoded=false;setState("composition","立ち絵を復元中","working");
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
    if(images.length<1){URL.revokeObjectURL(nextUrl);throw new Error("STANDING_PREVIEW_IMAGE_MISSING");}
    if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing"){URL.revokeObjectURL(nextUrl);return;}
    if(standingPreviewUrl)URL.revokeObjectURL(standingPreviewUrl);
    standingPreviewUrl=nextUrl;
    standingPreviewReady=true;
    standingPreviewDecoded=false;
    syncVisibleStandingAssets();
    startStandingMotion();
    setState("composition","立ち絵受信完了 / 表示確認中","working");
    setFeedback("立ち絵データを受信しました。表示確認をバックグラウンドで続けています。","info");
    void verifyStandingPreviewDecode(nextUrl,signal,generation);
  }catch(error){
    if(signal.aborted||error?.name==="AbortError")return;
    standingPreviewDecoded=false;standingPreviewReady=false;setState("composition","立ち絵読込失敗","error");
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
  const nextUrl=URL.createObjectURL(blob);
  if(signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing"){
    URL.revokeObjectURL(nextUrl);return;
  }
  const previous=standingBackgroundUrls.get(index);if(previous)URL.revokeObjectURL(previous);
  standingBackgroundUrls.set(index,nextUrl);
  const swatch=document.querySelector(`[data-standing-background-swatch="${index}"]`);
  if(swatch instanceof HTMLElement)swatch.style.backgroundImage=`url("${nextUrl}")`;
  const button=document.querySelector(`[data-standing-background-index="${index}"]`);
  if(button instanceof HTMLButtonElement)button.disabled=false;
  renderStandingBackgroundChoice();
  updateLiveBackgroundOptions();
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
  if(selectedMode!=="standing"||!standingBackgroundsPrepared)return;
  if(signal.aborted||generation!==standingPreparationGeneration)return;
  backgroundPreviewReady=standingPreviewReady&&standingBackgroundUrls.has(0);
  renderStandingBackgroundChoice();
  if(backgroundPreviewReady){
    if(standingPreviewDecoded){
      setState("composition","立ち絵・背景準備完了","ready");
      window.dispatchEvent(new CustomEvent("orikuro:standing-assets-ready",{detail:{backgroundCount:STANDING_IMAGE_COUNT,lazyFullResolution:false}}));
      setFeedback("登録背景4種と単色6種を使用できます。登録背景4種はすべて読み込み済みです。","ready");
    }else{
      setState("composition","背景準備完了 / 立ち絵表示確認中","working");
    }
  }
  updateWizard();
}
function beginStandingPreparation(){
  if(selectedMode!=="standing"||standingPreparationPromise)return;
  const current=getStreamRealtimeGrant();if(!current)return;
  if(!standingPreparationController)standingPreparationController=new AbortController();
  const controller=standingPreparationController,generation=standingPreparationGeneration;
  backgroundPreviewLoading=true;
  standingPreparationPromise=(async()=>{
    // Start the authenticated Cloudflare preparation and immediately request the
    // avatar preview in parallel. The preview endpoint already waits for the
    // prepared avatar source, so the avatar no longer waits for all four
    // background decrypt/copy operations to finish.
    const backendPromise=prepareStandingBackend(controller.signal,generation);
    const standingPromise=loadStandingPreview(controller.signal,generation);

    await standingPromise;
    if(controller.signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
    if(standingPreviewReady){
      setState("composition","立ち絵表示完了 / 背景を準備中","working");
      updateWizard();
    }

    await backendPromise;
    if(controller.signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;

    // Backend has confirmed all four temporary copies. Fetch all four previews now,
    // so every registered background is visible and selectable in STEP2.
    await Promise.all(Array.from({length:STANDING_IMAGE_COUNT},(_,index)=>
      standingBackgroundUrls.has(index)
        ?Promise.resolve()
        :fetchStandingBackground(index,controller.signal,generation)
    ));
    if(controller.signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;

    if(!standingChoiceValid(backgroundChoice))backgroundChoice="standing-image-1";
    renderStandingBackgroundChoice();
    updateWizard();

    if(standingPreviewReady&&standingBackgroundUrls.size===STANDING_IMAGE_COUNT){
      setState("composition","立ち絵・背景4種を表示準備済み","ready");
      updateWizard();
    }

    const chosen=standingImageIndex();
    const activationPromise=chosen>=0&&standingBackgroundUrls.has(chosen)&&chosen!==standingActiveBackgroundIndex
      ?activateStandingBackground(chosen)
      :Promise.resolve(true);
    const deferredPromise=loadDeferredStandingBackgrounds(controller.signal,generation);

    await Promise.all([activationPromise,deferredPromise]);
    if(controller.signal.aborted||generation!==standingPreparationGeneration||selectedMode!=="standing")return;
    if(standingPreviewReady&&backgroundPreviewReady)setState("composition","立ち絵・背景10種準備完了","ready");
  })().catch(error=>{
    if(!controller.signal.aborted&&generation===standingPreparationGeneration&&selectedMode==="standing"){
      const message=error instanceof Error?error.message:"STANDING_PREPARATION_FAILED";
      setState("composition","立ち絵・背景準備失敗","error");
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
  standingPreviewLoading=false;backgroundPreviewLoading=false;standingPreviewReady=false;standingPreviewDecoded=false;backgroundPreviewReady=false;standingBackgroundsPrepared=false;standingActiveBackgroundIndex=-1;
  stopStandingMotion(true);
  if(standingPreviewUrl)URL.revokeObjectURL(standingPreviewUrl);standingPreviewUrl="";revokeStandingBackgroundUrls();
  document.querySelectorAll("[data-standing-preview-image]").forEach(img=>{if(img instanceof HTMLImageElement){img.removeAttribute("src");img.hidden=true;}});
  document.querySelectorAll("[data-background-preview-image]").forEach(img=>{if(img instanceof HTMLImageElement){img.removeAttribute("src");img.hidden=true;}});
  if(stopRemote)void stopStandingTemporary();
}
async function activateStandingBackground(index,allowLiveCandidate=false){
  if(index<0||index>=STANDING_IMAGE_COUNT||selectedMode!=="standing"||!standingBackgroundUrls.has(index))return false;
  if(index===standingActiveBackgroundIndex)return true;
  const current=getStreamRealtimeGrant();if(!current)return false;
  standingActivationQueue=standingActivationQueue.catch(()=>undefined).then(async()=>{
    if(selectedMode!=="standing"||(standingImageIndex()!==index&&!(allowLiveCandidate&&document.documentElement.dataset.broadcastPhase==="live")))return;
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
async function applyLiveBackgroundChoice(choiceId){
  if(document.documentElement.dataset.broadcastPhase!=="live"||liveBackgroundSwitching||choiceId===backgroundChoice)return;
  const index=standingImageIndex(choiceId);
  const solid=radioPresets.get(choiceId);
  if(selectedMode==="radio" ? !solid : selectedMode==="standing" ? (index<0&&!solid)||index>=0&&!standingBackgroundsPrepared : true)return;
  const generation=++liveBackgroundGeneration;
  liveBackgroundSwitching=true;
  updateLiveBackgroundOptions();
  liveBackgroundStatus("新しい背景を準備しています。現在の配信を維持します…","working");
  try{
    let image=null;
    if(selectedMode==="standing"&&index>=0){
      if(!standingBackgroundUrls.has(index)){
        const controller=new AbortController();
        await fetchStandingBackground(index,controller.signal,standingPreparationGeneration);
        if(!standingBackgroundUrls.has(index))throw new Error("LIVE_BACKGROUND_LOAD_FAILED");
      }
      // Decode only the requested prepared R2 temporary-copy image.
      image=new Image();
      image.decoding="async";
      image.src=standingBackgroundUrls.get(index);
      await image.decode();
      if(!image.complete||image.naturalWidth<1||image.naturalHeight<1)throw new Error("LIVE_BACKGROUND_DECODE_INVALID");
      if(generation!==liveBackgroundGeneration||document.documentElement.dataset.broadcastPhase!=="live")return;
      if(!await activateStandingBackground(index,true))throw new Error("LIVE_BACKGROUND_ACTIVATE_FAILED");
    }
    if(generation!==liveBackgroundGeneration||document.documentElement.dataset.broadcastPhase!=="live")return;
    if(selectedMode==="radio"){
      applyBackgroundPreset(choiceId);
    }else{
      // Transactional live-background handoff. The encoder must explicitly
      // acknowledge this exact request before the UI commits the new choice.
      const requestId=globalThis.crypto?.randomUUID?.()||("bg_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2));
      const rendered=await new Promise((resolve,reject)=>{
        let settled=false;
        const cleanup=()=>{
          window.removeEventListener("orikuro:live-background-rendered",onRendered);
          window.removeEventListener("orikuro:live-background-render-failed",onFailed);
          clearTimeout(timer);
        };
        const onRendered=(event)=>{
          const detail=event?.detail;
          if(!detail||detail.requestId!==requestId||detail.choiceId!==choiceId)return;
          settled=true;cleanup();resolve(true);
        };
        const onFailed=(event)=>{
          const detail=event?.detail;
          if(!detail||detail.requestId!==requestId||detail.choiceId!==choiceId)return;
          settled=true;cleanup();reject(new Error(typeof detail.code==="string"?detail.code:"LIVE_BACKGROUND_RENDERER_REJECTED"));
        };
        const timer=setTimeout(()=>{
          if(settled)return;
          cleanup();reject(new Error("LIVE_BACKGROUND_RENDERER_TIMEOUT"));
        },2000);
        window.addEventListener("orikuro:live-background-rendered",onRendered);
        window.addEventListener("orikuro:live-background-render-failed",onFailed);
        window.dispatchEvent(new CustomEvent("orikuro:standing-background-change",{
          detail:{requestId,choiceId,index,image,color:solid?.color||null}
        }));
      });
      if(!rendered)throw new Error("LIVE_BACKGROUND_RENDERER_NOT_READY");
      backgroundChoice=choiceId;
      liveBackgroundIndependent=true;
      releaseUnusedStandingBackgroundUrls(index);
      // The encoder now holds the selected decoded source independently.
      renderStandingBackgroundChoice();
      updateWizard();
    }
    liveBackgroundStatus("背景の切り替えが完了しました。","ready");
  }catch(error){
    if(generation!==liveBackgroundGeneration||document.documentElement.dataset.broadcastPhase!=="live")return;
    const code=error instanceof Error?error.message:"LIVE_BACKGROUND_SWITCH_FAILED";
    liveBackgroundStatus("背景を切り替えられません: "+code+"。以前の背景を維持しています。","error");
  }finally{
    if(generation===liveBackgroundGeneration){liveBackgroundSwitching=false;updateLiveBackgroundOptions();}
  }
}
async function applyStandingBackgroundChoice(choiceId){
  if(selectedMode!=="standing"||!standingChoiceValid(choiceId))return;
  const index=standingImageIndex(choiceId);
  if(index>=0&&!standingBackgroundUrls.has(index)){
    if(!standingBackgroundsPrepared)return;
    const controller=new AbortController();
    setState("composition","選択した背景を読み込み中","working");
    try{await fetchStandingBackground(index,controller.signal,standingPreparationGeneration);}
    catch(error){
      setState("composition","背景読込失敗","error");
      setFeedback(error instanceof Error?`背景を読み込めません: ${error.message}`:"背景を読み込めません。","error");
      return;
    }
    if(!standingBackgroundUrls.has(index))return;
  }
  backgroundChoice=choiceId;renderStandingBackgroundChoice();updateWizard();
  if(index>=0&&standingPreviewReady){
    const activated=await activateStandingBackground(index);
    if(!activated)return;
  }else if(index<0){
    // Keep the four registered background previews in memory during setup so
    // switching back to them remains immediate and their STEP2 thumbnails stay visible.
  }
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
    start.disabled=currentStep!==4||!readyForStep(4)||!sessionReady()||!compatibility.supported||(selectedMode==="standing"&&!standingCameraReady);
  }
  updateSummary();
  syncVisibleStandingAssets();
}

function goStep(step){
  if(step<1||step>4)return;
  currentStep=step;
  if(step===4&&selectedMode==="standing"&&!standingCameraReady){
    setFeedback("カメラ接続を確認しています。接続できれば立ち絵配信の準備完了です。","working");
    void ensureStandingTracking();
  }
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

function setCameraTrackingStatus(text,state="waiting",visible=selectedMode==="standing"){
  const el=document.querySelector("[data-camera-tracking-status]");
  if(!el)return;
  el.hidden=!visible;
  el.textContent=text;
  el.dataset.state=state;
}

function releaseStandingTracking(){
  standingTrackingStart=null;
  standingCameraReady=false;
  standingFaceTracker?.stop?.();
  standingFaceTracker=null;
  setCameraTrackingStatus("立ち絵を選択するとカメラの使用許可を確認します。","waiting",false);
}

async function ensureStandingTracking(){
  if(selectedMode!=="standing"||standingCameraReady||standingFaceTracker?.running)return;
  if(standingTrackingStart)return await standingTrackingStart;
  if(!standingFaceTracker)standingFaceTracker=new StandingFaceTracker();
  const tracker=standingFaceTracker;
  standingCameraReady=false;
  setCameraTrackingStatus("カメラの使用許可を確認しています…","working",true);
  standingTrackingStart=tracker.start().then(()=>{
    if(selectedMode!=="standing"||standingFaceTracker!==tracker){tracker.stop();return;}
    standingCameraReady=true;
    setCameraTrackingStatus("カメラ接続済み。立ち絵配信の準備完了です。","ready",true);
    if(currentStep===4){
      setFeedback(sessionReady()?"カメラ接続済み。配信を開始できます。":"カメラ接続済み。配信経路の準備を待っています。",sessionReady()?"ready":"working");
    }
    updateWizard();
  }).catch(error=>{
    if(standingFaceTracker===tracker){tracker.stop();standingFaceTracker=null;}
    standingCameraReady=false;
    if(selectedMode==="standing"){
      const code=error instanceof Error?error.message:"STANDING_CAMERA_START_FAILED";
      const message=code==="NotAllowedError"||code==="CAMERA_PERMISSION_DENIED"
        ?"カメラの使用が許可されていません。ブラウザのカメラ許可を確認してください。"
        :code==="NotFoundError"||code==="CAMERA_TRACK_MISSING"
          ?"使用できるカメラが見つかりません。"
          :`カメラを開始できません: ${code}`;
      setCameraTrackingStatus(message,"error",true);
      setFeedback(message,"error");
      updateWizard();
    }
  }).finally(()=>{if(standingTrackingStart)standingTrackingStart=null;});
  await standingTrackingStart;
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

function liveMicSwitchMessage(message,state="waiting"){
  const status=document.querySelector("[data-live-mic-switch-status]");
  if(status){status.textContent=message;status.dataset.state=state;}
}
function updateLiveMicSelection(){
  const select=document.querySelector("[data-live-mic-device]");
  const button=document.querySelector("[data-live-mic-apply]");
  const active=document.querySelector("[data-live-mic-active]");
  if(active)active.textContent=liveMicActiveLabel?"使用中: "+liveMicActiveLabel:"使用中のマイクを確認中";
  if(!(select instanceof HTMLSelectElement)||!(button instanceof HTMLButtonElement))return;
  const live=document.documentElement.dataset.broadcastPhase==="live";
  select.disabled=!live||liveMicChanging||select.options.length===0||!select.value;
  button.disabled=!live||liveMicChanging||!select.value||select.value===liveMicActiveDeviceId;
}
async function listLiveMicDevices(){
  const panel=document.querySelector("[data-live-mic-panel]");
  const select=document.querySelector("[data-live-mic-device]");
  if(panel?.hidden||!(select instanceof HTMLSelectElement)||document.documentElement.dataset.broadcastPhase!=="live")return;
  const request=++liveMicEnumeration;
  select.disabled=true;
  liveMicSwitchMessage("利用できるマイクを確認しています…","working");
  try{
    if(!navigator.mediaDevices?.enumerateDevices)throw new Error("ENUMERATE_UNAVAILABLE");
    const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==="audioinput"&&device.deviceId);
    if(request!==liveMicEnumeration||panel.hidden)return;
    const preferred=inputs.some(device=>device.deviceId===select.value)?select.value:liveMicActiveDeviceId;
    select.replaceChildren();
    for(const [index,device] of inputs.entries()){
      const option=document.createElement("option");
      option.value=device.deviceId;
      option.textContent=device.label||"マイク "+String(index+1);
      select.append(option);
    }
    const selected=inputs.find(device=>device.deviceId===preferred)||inputs[0]||null;
    if(selected)select.value=selected.deviceId;
    const activeInput=inputs.find(device=>device.deviceId===liveMicActiveDeviceId);
    if(activeInput?.label)liveMicActiveLabel=activeInput.label;
    updateLiveMicSelection();
    liveMicSwitchMessage(inputs.length?String(inputs.length)+"台の入力を認識しました。選択後に切り替えてください。":"使用可能なマイクがありません。",inputs.length?"ready":"error");
  }catch{
    if(request!==liveMicEnumeration||panel.hidden)return;
    liveMicSwitchMessage("マイク一覧を取得できませんでした。現在の配信音声は維持しています。","error");
  }
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
  if(previousMode==="standing"&&mode!=="standing"){
    cancelStandingPreparation(true);
    releaseStandingTracking();
    standingPreliveComposition=null;
    clearStandingLiveComposition();
  }
  selectedMode=mode;document.documentElement.dataset.streamMode=mode;
  document.querySelectorAll("[data-stream-mode]").forEach(button=>{const active=button.dataset.streamMode===mode;button.classList.toggle("is-selected",active);button.setAttribute("aria-pressed",active?"true":"false");});
  if(mode==="standing"){
    if(previousMode!=="standing"){standingPreparationGeneration++;standingPreparationController=new AbortController();standingPreviewReady=false;backgroundPreviewReady=false;backgroundChoice="standing-image-1";setState("composition","立ち絵・背景を先行準備中","working");}
  }else{if(!radioPresets.has(backgroundChoice))backgroundChoice="";setState("composition","対象外","ready");}
  updateWizard();window.dispatchEvent(new CustomEvent("orikuro:stream-mode-change",{detail:{mode}}));
  if(mode==="standing"){beginStandingPreparation();setCameraTrackingStatus("マイク許可の確認後にカメラ許可を確認します。","waiting",true);}
  else setCameraTrackingStatus("", "waiting", false);
  if(!micReady()&&!micPermissionRequest)micPermissionRequest=refreshAudioInputs(true).finally(()=>{micPermissionRequest=null;});
  const permission=micPermissionRequest;
  if(permission){void permission.then(()=>{
    if(selectedMode!==mode||!micReady())return;
    if(mode==="standing")void ensureStandingTracking();
    window.dispatchEvent(new CustomEvent("orikuro:stream-prepare-request",{detail:{mode}}));
  });}
  else if(micReady()){
    if(mode==="standing")void ensureStandingTracking();
    window.dispatchEvent(new CustomEvent("orikuro:stream-prepare-request",{detail:{mode}}));
  }
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
  button.addEventListener("click",()=>{void applyStandingBackgroundChoice(button.dataset.standingBackgroundChoice||"");});
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
document.querySelector("[data-live-background-toggle]")?.addEventListener("click",event=>{
  const button=event.currentTarget;
  const panel=document.querySelector("[data-live-background-panel]");
  if(!(button instanceof HTMLButtonElement)||!panel||document.documentElement.dataset.broadcastPhase!=="live")return;
  panel.hidden=!panel.hidden;
  button.setAttribute("aria-expanded",panel.hidden?"false":"true");
  if(!panel.hidden){
    const micPanel=document.querySelector("[data-live-mic-panel]");
    if(micPanel)micPanel.hidden=true;
    document.querySelector("[data-live-mic-switch-toggle]")?.setAttribute("aria-expanded","false");
    updateLiveBackgroundOptions();
  }
});
document.querySelectorAll("[data-live-background-choice]").forEach(button=>{
  button.addEventListener("click",()=>{
    if(button instanceof HTMLButtonElement&&!button.disabled)void applyLiveBackgroundChoice(button.dataset.liveBackgroundChoice||"");
  });
});
document.querySelector("[data-live-mic-switch-toggle]")?.addEventListener("click",event=>{
  const button=event.currentTarget;
  const panel=document.querySelector("[data-live-mic-panel]");
  if(!(button instanceof HTMLButtonElement)||!panel||document.documentElement.dataset.broadcastPhase!=="live")return;
  panel.hidden=!panel.hidden;
  button.setAttribute("aria-expanded",panel.hidden?"false":"true");
  if(!panel.hidden){
    const backgroundPanel=document.querySelector("[data-live-background-panel]");
    if(backgroundPanel)backgroundPanel.hidden=true;
    document.querySelector("[data-live-background-toggle]")?.setAttribute("aria-expanded","false");
    void listLiveMicDevices();
  }
});
document.querySelector("[data-live-mic-device]")?.addEventListener("change",()=>updateLiveMicSelection());
document.querySelector("[data-live-mic-apply]")?.addEventListener("click",()=>{
  const select=document.querySelector("[data-live-mic-device]");
  if(!(select instanceof HTMLSelectElement)||liveMicChanging||document.documentElement.dataset.broadcastPhase!=="live")return;
  const deviceId=select.value;
  if(!deviceId||deviceId===liveMicActiveDeviceId)return;
  liveMicChanging=true;
  liveMicSwitchMessage("新しいマイクを準備しています。元の配信音声を維持します…","working");
  updateLiveMicSelection();
  window.dispatchEvent(new CustomEvent("orikuro:live-audio-input-change",{detail:{deviceId}}));
});
navigator.mediaDevices?.addEventListener?.("devicechange",()=>{
  const panel=document.querySelector("[data-live-mic-panel]");
  if(panel&&!panel.hidden&&!liveMicChanging)void listLiveMicDevices();
});
window.addEventListener("orikuro:live-audio-input-switched",event=>{
  const d=event?.detail||{};
  liveMicChanging=false;
  liveMicActiveDeviceId=typeof d.deviceId==="string"?d.deviceId:liveMicActiveDeviceId;
  liveMicActiveLabel=typeof d.label==="string"&&d.label?d.label:liveMicActiveLabel;
  selectedAudioInputDeviceId=liveMicActiveDeviceId;
  liveMicSwitchMessage("マイクの切り替えが完了しました。","ready");
  const wizard=document.querySelector("[data-mic-device]");
  if(wizard instanceof HTMLSelectElement&&[...wizard.options].some(o=>o.value===liveMicActiveDeviceId))wizard.value=liveMicActiveDeviceId;
  const select=document.querySelector("[data-live-mic-device]");
  if(select instanceof HTMLSelectElement&&[...select.options].some(o=>o.value===liveMicActiveDeviceId))select.value=liveMicActiveDeviceId;
  updateLiveMicSelection();
});
window.addEventListener("orikuro:live-audio-input-switch-failed",event=>{
  liveMicChanging=false;
  const code=event?.detail?.code||"LIVE_MIC_SWITCH_FAILED";
  liveMicSwitchMessage("切り替えに失敗しました（"+code+"）。以前のマイクを継続しています。","error");
  updateLiveMicSelection();
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
  if(selectedMode==="standing"&&standingPreviewReady){
    const boundedTarget=standingMotionWithinFrame(standingMotionTarget.x,standingMotionTarget.y);
    const boundedState=standingMotionWithinFrame(standingTrackedState.x,standingTrackedState.y);
    standingRootState=standingMotionWithinFrame(standingRootState.x,standingRootState.y);
    standingMotionTarget={...standingMotionTarget,x:boundedTarget.x,y:boundedTarget.y};
    standingTrackedState={...standingTrackedState,x:boundedState.x,y:boundedState.y};
    if(document.documentElement.dataset.broadcastPhase==="live")applyStandingLiveComposition();
    startStandingMotion();
  }
});
navigator.mediaDevices?.addEventListener?.("devicechange",()=>{
  if(micDevicesKnown)void refreshAudioInputs(false);
});
window.addEventListener("pagehide",()=>{
  standingPreparationController?.abort();stopStandingMotion(false);releaseStandingTracking();
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
  if(systemTest){
    const stage=document.querySelector("[data-stage-wasm-status]");
    if(stage){stage.textContent="0%ステージ: 認証付き診断ページで合成入力を確認できます。配信WebSocketは現行版・実カメラE2Eは未検証です。";stage.dataset.state="waiting";}
  }
  setState("session","配信経路準備中","waiting");
  if(selectedMode==="standing")beginStandingPreparation();
});
window.addEventListener("orikuro:standing-backend-ready",()=>{
  if(selectedMode==="standing"&&!standingPreviewReady)setState("composition","専用バックエンド準備完了 / 表示素材受信中","working");
  updateWizard();
});
window.addEventListener("orikuro:face-region-sample",event=>{
  if(selectedMode==="standing")acceptStandingFaceRegion(event?.detail);
});
window.addEventListener("orikuro:standing-tracking-ready",event=>{
  if(selectedMode!=="standing"||!standingCameraReady)return;
  const backend=event?.detail?.backend==="webgpu"?"WebGPU":"WASM";
  setCameraTrackingStatus(`カメラ接続済み / 立ち絵追従動作中（YuNet / ${backend}）`,"ready",true);
});
window.addEventListener("orikuro:standing-tracking-failed",event=>{
  if(selectedMode!=="standing")return;
  const code=event?.detail?.code||"STANDING_TRACKING_FAILED";
  if(event?.detail?.camera===true){
    standingCameraReady=false;
    setCameraTrackingStatus(`カメラ接続を継続できません: ${code}`,"error",true);
    setFeedback("カメラ接続が失われました。再接続してください。","error");
  }else{
    setCameraTrackingStatus(`カメラ接続済み / 立ち絵追従エラー: ${code}`,"error",true);
  }
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
  if(typeof detail.deviceId==="string"&&detail.deviceId)liveMicActiveDeviceId=detail.deviceId;
  liveMicActiveLabel=label;
  updateLiveMicSelection();
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
  liveBackgroundIndependent=false;
  document.documentElement.dataset.broadcastPhase="live";
  document.querySelector("[data-broadcast-wizard]")?.setAttribute("hidden","");
  document.querySelector("[data-live-screen]")?.removeAttribute("hidden");
  syncVisibleStandingAssets();
  applyStandingLiveComposition();
  document.querySelectorAll("[data-mic-test]").forEach(el=>el.hidden=true);
  const liveMicPanel=document.querySelector("[data-live-mic-panel]");
  if(liveMicPanel)liveMicPanel.hidden=true;
  const liveBackgroundPanel=document.querySelector("[data-live-background-panel]");
  if(liveBackgroundPanel)liveBackgroundPanel.hidden=true;
  document.querySelector("[data-live-background-toggle]")?.setAttribute("aria-expanded","false");
  liveBackgroundSwitching=false;
  updateLiveBackgroundOptions();
  const micSwitchToggle=document.querySelector("[data-live-mic-switch-toggle]");
  micSwitchToggle?.setAttribute("aria-expanded","false");
  liveMicChanging=false;
  updateLiveMicSelection();
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
  liveBackgroundIndependent=false;
  liveBackgroundGeneration++;
  liveBackgroundSwitching=false;
  const backgroundPanel=document.querySelector("[data-live-background-panel]");
  if(backgroundPanel)backgroundPanel.hidden=true;
  document.querySelector("[data-live-background-toggle]")?.setAttribute("aria-expanded","false");
  document.documentElement.dataset.broadcastPhase="prep";
  liveMicChanging=false;
  liveMicEnumeration++;
  const liveMicPanel=document.querySelector("[data-live-mic-panel]");
  if(liveMicPanel)liveMicPanel.hidden=true;
  document.querySelector("[data-live-screen]")?.setAttribute("hidden","");
  clearStandingLiveComposition();
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
  liveBackgroundGeneration++;
  liveBackgroundSwitching=false;
  stopButton.disabled=true;
  document.querySelectorAll("[data-stream-status]").forEach(status=>status.textContent="停止処理中");
});

const startButton=document.querySelector("[data-stream-start]");
startButton?.addEventListener("click",()=>{
  if(currentStep!==4||!readyForStep(4)||!sessionReady()||!supportedModes.has(selectedMode)||(selectedMode==="standing"&&!standingCameraReady))return;
  startButton.disabled=true;
  document.documentElement.dataset.broadcastPhase="starting";
  const requestedMode=selectedMode,requestedChoice=backgroundChoice;
  setFeedback("配信画像を確認しています…","working");
  void (async()=>{
    try{
      if(requestedMode==="standing"){
        const final=document.querySelector('[data-wizard-step="4"]');
        const avatar=final?.querySelector("[data-standing-preview-image]");
        if(!(avatar instanceof HTMLImageElement)||!avatar.src)throw new Error("STANDING_PREVIEW_MISSING");
        await avatar.decode();
        if(!captureStandingPreliveComposition())throw new Error("STANDING_PRELIVE_LAYOUT_MISSING");
        if(standingImageIndex(requestedChoice)>=0){
          const background=final?.querySelector("[data-background-preview-image]");
          if(!(background instanceof HTMLImageElement)||!background.src)throw new Error("BACKGROUND_PREVIEW_MISSING");
          await background.decode();
        }
      }
      if(selectedMode!==requestedMode||backgroundChoice!==requestedChoice||document.documentElement.dataset.broadcastPhase!=="starting")return;
      setFeedback("配信を開始しています…","working");
      window.dispatchEvent(new CustomEvent("orikuro:stream-start-request",{detail:{mode:requestedMode,radioPresetId:requestedChoice}}));
    }catch(error){
      if(document.documentElement.dataset.broadcastPhase!=="starting")return;
      document.documentElement.dataset.broadcastPhase="prep";
      const code=error instanceof Error&&error.name==="EncodingError"
        ?"STREAM_IMAGE_DECODE_FAILED":error instanceof Error?error.message:"STREAM_IMAGE_PREPARE_FAILED";
      setFeedback("配信開始前の画像確認に失敗しました: "+code,"error");
      updateWizard();
    }
  })();
});

if(!compatibility.supported&&root)root.hidden=true;
