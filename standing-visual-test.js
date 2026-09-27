import{getStreamRealtimeGrant}from"./assets/js/realtime-grant.js?v=20260914-grant-handoff1";
const canvas=document.querySelector("[data-visual-canvas]");
const ctx=canvas.getContext("2d",{alpha:true});
const readouts={
  name:document.querySelector("[data-test-name]"),
  confidence:document.querySelector("[data-confidence]"),
  yaw:document.querySelector("[data-yaw]"),
  pitch:document.querySelector("[data-pitch]"),
  depth:document.querySelector("[data-depth]"),
  lod:document.querySelector("[data-lod]"),
};
const playButton=document.querySelector("[data-play-toggle]");
const skeletonToggle=document.querySelector("[data-skeleton-toggle]");
const scenarioButtons=[...document.querySelectorAll("[data-scenario]")];
const accessStatus=document.querySelector("[data-system-access-status]");
const STANDING_PREPARE_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-prepare";
const STANDING_PREVIEW_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-preview";
const STANDING_PREVIEW_STOP_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-preview-stop";

const scenarioNames={follow:"通常追従",head:"頭部回転",depth:"前後・視差",lost:"Lost→再捕捉",lod:"LOD 0→5→0"};
let scenario="follow";
let playing=true;
let hiddenPaused=false;
let started=performance.now();
let last=started;
let phaseTime=0;
let raf=0;
let standingImage=null;
let standingObjectUrl="";
let standingLoadPromise=null;

const state={
  x:0,y:0,z:0,yaw:0,pitch:0,roll:0,
  leftArm:-12,rightArm:12,
  confidence:1,lost:false,lod:0,
  idle:0,hair:0,
};
const held={...state};

function resize(){
  const rect=canvas.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*dpr));
  const height=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==width||canvas.height!==height){
    canvas.width=width;canvas.height=height;
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function ease(t){t=clamp(t,0,1);return t*t*(3-2*t)}

function setAssetStatus(text,state="working"){
  if(!accessStatus)return;
  accessStatus.textContent=text;
  accessStatus.dataset.state=state;
}
async function loadRegisteredStanding(){
  if(standingImage)return standingImage;
  if(standingLoadPromise)return await standingLoadPromise;
  const grant=getStreamRealtimeGrant();
  if(!grant)throw new Error("STREAM_GRANT_MISSING");
  standingLoadPromise=(async()=>{
    setAssetStatus("R2立ち絵を準備しています…");
    const prepare=await fetch(STANDING_PREPARE_URL,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({streamId:grant.streamId,controlCapability:grant.controlCapability}),
      credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"
    });
    const prepared=await prepare.json().catch(()=>null);
    if(!prepare.ok||prepared?.ok!==true||prepared?.result?.standingReady!==true)throw new Error(prepared?.code||"STANDING_PREPARE_FAILED");
    const preview=await fetch(STANDING_PREVIEW_URL,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({streamId:grant.streamId,controlCapability:grant.controlCapability}),
      credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"
    });
    if(!preview.ok){const payload=await preview.json().catch(()=>null);throw new Error(payload?.code||"STANDING_PREVIEW_FAILED");}
    const blob=await preview.blob();
    if(!["image/png","image/jpeg","image/webp"].includes(blob.type)||blob.size<1||blob.size>12*1024*1024)throw new Error("STANDING_PREVIEW_INVALID");
    const url=URL.createObjectURL(blob);
    const image=new Image();
    image.decoding="async";
    image.src=url;
    try{await image.decode();}catch{URL.revokeObjectURL(url);throw new Error("STANDING_PREVIEW_IMAGE_DECODE_FAILED");}
    if(image.naturalWidth<1||image.naturalHeight<1){URL.revokeObjectURL(url);throw new Error("STANDING_PREVIEW_DIMENSIONS_INVALID");}
    if(standingObjectUrl)URL.revokeObjectURL(standingObjectUrl);
    standingObjectUrl=url;
    standingImage=image;
    setAssetStatus("R2立ち絵を使用中","ready");
    draw();
    return image;
  })();
  try{return await standingLoadPromise;}
  finally{standingLoadPromise=null;}
}
async function stopRegisteredStanding(){
  const grant=getStreamRealtimeGrant();
  if(grant){
    try{
      const response=await fetch(STANDING_PREVIEW_STOP_URL,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({streamId:grant.streamId,controlCapability:grant.controlCapability}),
        credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",keepalive:true
      });
      try{await response.body?.cancel();}catch{}
    }catch{}
  }
  standingImage=null;
  if(standingObjectUrl)URL.revokeObjectURL(standingObjectUrl);
  standingObjectUrl="";
}

function targetFor(t){
  const s={x:0,y:0,z:0,yaw:0,pitch:0,roll:0,leftArm:-12,rightArm:12,confidence:1,lost:false,lod:0,idle:0,hair:0};
  if(scenario==="follow"){
    s.x=Math.sin(t*.85)*.028;
    s.y=Math.sin(t*1.15)*.009;
    s.yaw=Math.sin(t*.72)*10;
    s.pitch=Math.sin(t*.54)*5.5;
    s.roll=Math.sin(t*.63)*7;
    s.leftArm=-12+Math.sin(t*.93)*32;
    s.rightArm=12-Math.sin(t*.87+1.1)*30;
    s.hair=Math.sin(t*2.1)*1;
  }else if(scenario==="head"){
    s.yaw=Math.sin(t*.72)*18;
    s.pitch=Math.sin(t*.51)*14;
    s.roll=Math.sin(t*.43)*24;
    s.x=Math.sin(t*.55)*.012;
    s.hair=Math.sin(t*1.8)*.7;
  }else if(scenario==="depth"){
    s.x=Math.sin(t*.8)*.04;
    s.y=Math.sin(t*.66)*.012;
    s.z=Math.sin(t*.52)*.08;
    s.yaw=Math.sin(t*.7)*8;
    s.hair=Math.sin(t*2.2)*.8;
  }else if(scenario==="lost"){
    const c=t%6;
    if(c<2){
      s.x=Math.sin(t)*.022;s.yaw=Math.sin(t*.9)*8;s.leftArm=-5;s.rightArm=20;s.hair=Math.sin(t*2)*.8;
    }else if(c<2.35){
      Object.assign(s,held);
      s.confidence=.22;s.lost=true;
    }else if(c<3.2){
      const k=ease((c-2.35)/.85);
      Object.assign(s,held);
      s.confidence=.22;s.lost=true;
      s.x=lerp(held.x,0,k);s.y=lerp(held.y,0,k);s.yaw=lerp(held.yaw,0,k);s.pitch=lerp(held.pitch,0,k);s.roll=lerp(held.roll,0,k);
      s.leftArm=lerp(held.leftArm,-12,k);s.rightArm=lerp(held.rightArm,12,k);s.idle=k;
    }else if(c<3.5){
      const k=ease((c-3.2)/.3);
      s.confidence=lerp(.45,1,k);
      s.x=lerp(0,.018,k);s.yaw=lerp(0,-7,k);s.leftArm=lerp(-12,8,k);s.rightArm=lerp(12,-5,k);
    }else{
      s.x=Math.sin(t*.9)*.02;s.yaw=Math.sin(t*.75)*8;s.leftArm=-12+Math.sin(t)*20;s.rightArm=12-Math.sin(t*.9)*20;s.hair=Math.sin(t*2.1)*.8;
    }
  }else if(scenario==="lod"){
    const c=t%8;
    s.x=Math.sin(t*.7)*.025;s.yaw=Math.sin(t*.62)*9;
    if(c<2)s.lod=0;
    else if(c<4)s.lod=Math.min(5,Math.floor((c-2)/.4)+1);
    else if(c<6)s.lod=5;
    else s.lod=Math.max(0,5-Math.floor((c-6)/.4)-1);
    const secondary=1-s.lod*.13;
    s.leftArm=-12+Math.sin(t*.9)*22;s.rightArm=12-Math.sin(t*.85)*22;s.hair=Math.sin(t*2.1)*secondary;
  }
  return s;
}

function applyTarget(target,dt){
  const smoothing=1-Math.exp(-dt*12);
  for(const key of ["x","y","z","yaw","pitch","roll","leftArm","rightArm","idle","hair"]){
    state[key]=lerp(state[key],target[key],smoothing);
  }
  state.confidence=target.confidence;
  state.lost=target.lost;
  state.lod=target.lod;
  if(!target.lost)Object.assign(held,state);
}

function color(alpha=1){return `rgba(240,242,255,${alpha})`}
function line(x1,y1,x2,y2,width=5,stroke=color(.9)){
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=width;ctx.lineCap="round";ctx.strokeStyle=stroke;ctx.stroke();
}
function ellipse(x,y,rx,ry,fill,rotation=0){
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
}
function roundRect(x,y,w,h,r,fill){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
}

function draw(){
  resize();
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);

  const H=Math.min(h*.72,w*.94);
  const centerX=w*.5+state.x*H;
  const baseY=h*.90+state.y*H;

  if(standingImage&&standingImage.complete&&standingImage.naturalWidth>0){
    const baseScale=Math.min((w*.88)/standingImage.naturalWidth,(h*.82)/standingImage.naturalHeight);
    const width=standingImage.naturalWidth*baseScale;
    const height=standingImage.naturalHeight*baseScale;
    const depthScale=1+clamp(state.z,-.08,.08);
    const yawScale=1-clamp(Math.abs(state.yaw)/18,0,1)*.06;
    const pitchScale=1-clamp(Math.abs(state.pitch)/14,0,1)*.04;

    ctx.save();
    ctx.translate(centerX+state.yaw*.0015*H,baseY+state.pitch*.0008*H);
    ctx.rotate(state.roll*Math.PI/180);
    ctx.scale(depthScale*yawScale,depthScale*pitchScale);
    ctx.drawImage(standingImage,-width/2,-height,width,height);
    ctx.restore();

    if(skeletonToggle.checked){
      const top=baseY-height*depthScale*pitchScale;
      const shoulderY=top+height*.32;
      const hipY=top+height*.66;
      ctx.save();
      ctx.strokeStyle="rgba(99,225,190,.92)";
      ctx.fillStyle="rgba(99,225,190,.98)";
      ctx.lineWidth=1.4;
      line(centerX,top+height*.16,centerX,hipY,1.4,"rgba(99,225,190,.92)");
      line(centerX-width*.17,shoulderY,centerX+width*.17,shoulderY,1.4,"rgba(99,225,190,.92)");
      line(centerX-width*.12,hipY,centerX+width*.12,hipY,1.4,"rgba(99,225,190,.92)");
      for(const [x,y] of [[centerX,top+height*.16],[centerX,shoulderY],[centerX,hipY],[centerX-width*.17,shoulderY],[centerX+width*.17,shoulderY]])ellipse(x,y,2.6,2.6,"rgba(99,225,190,.98)");
      ctx.restore();
    }
  }else{
    ctx.fillStyle="rgba(255,255,255,.72)";
    ctx.font="900 11px -apple-system,BlinkMacSystemFont,sans-serif";
    ctx.textAlign="center";
    ctx.fillText("R2立ち絵を読み込み中…",w*.5,h*.52);
  }

  if(state.lost){
    ctx.fillStyle="rgba(255,188,94,.95)";
    ctx.font="900 11px -apple-system,BlinkMacSystemFont,sans-serif";
    ctx.textAlign="center";
    ctx.fillText("TRACKING LOST / HOLD → IDLE",w*.5,h*.12);
  }

  readouts.name.textContent=scenarioNames[scenario];
  readouts.confidence.textContent=state.confidence.toFixed(2);
  readouts.yaw.textContent=`${state.yaw.toFixed(1)}°`;
  readouts.pitch.textContent=`${state.pitch.toFixed(1)}°`;
  readouts.depth.textContent=`${state.z.toFixed(3)}H`;
  readouts.lod.textContent=String(state.lod);
}

function tick(now){
  raf=0;
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));
  last=now;
  if(playing){
    phaseTime+=(now-started)/1000-(phaseTime||0);
    started=now-phaseTime*1000;
    const target=targetFor(phaseTime);
    applyTarget(target,dt);
  }
  draw();
  if(playing&&!document.hidden)raf=requestAnimationFrame(tick);
}
function schedule(){
  if(raf||document.hidden)return;
  last=performance.now();
  raf=requestAnimationFrame(tick);
}
function selectScenario(next){
  if(!scenarioNames[next])return;
  scenario=next;phaseTime=0;started=performance.now();last=started;
  Object.assign(state,{x:0,y:0,z:0,yaw:0,pitch:0,roll:0,leftArm:-12,rightArm:12,confidence:1,lost:false,lod:0,idle:0,hair:0});
  Object.assign(held,state);
  scenarioButtons.forEach(button=>button.classList.toggle("is-active",button.dataset.scenario===scenario));
  draw();schedule();
}
scenarioButtons.forEach(button=>button.addEventListener("click",()=>selectScenario(button.dataset.scenario)));
playButton.addEventListener("click",()=>{
  playing=!playing;
  playButton.textContent=playing?"一時停止":"再生";
  if(playing){started=performance.now()-phaseTime*1000;schedule();}
  else if(raf){cancelAnimationFrame(raf);raf=0;draw();}
});
skeletonToggle.addEventListener("change",draw);
window.addEventListener("resize",draw,{passive:true});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    hiddenPaused=playing;
    if(raf){cancelAnimationFrame(raf);raf=0;}
  }else if(hiddenPaused&&playing){
    started=performance.now()-phaseTime*1000;
    hiddenPaused=false;schedule();
  }
});
document.addEventListener("orikuro:service-ready",()=>{
  void loadRegisteredStanding().then(()=>{resize();draw();schedule();}).catch(error=>{
    setAssetStatus(error instanceof Error?`立ち絵読込失敗: ${error.message}`:"立ち絵読込失敗","error");
    draw();
  });
});
window.addEventListener("pagehide",()=>{void stopRegisteredStanding();},{once:true});
resize();draw();
