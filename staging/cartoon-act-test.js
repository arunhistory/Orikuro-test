import { getStreamRealtimeGrant } from "./assets/js/realtime-grant.js?v=20260914-grant-handoff1";

const CARTOON_ACT_STAGE_ORIGIN="https://orikuro-cartoon-act-stage.garigarimegane625.workers.dev";
const PLAN_TYPE="cartoon_act_plan_v1";
const CONTROL_TYPE="cartoon_act_v1";
const ACT_IDS=new Set(["surprise","tsukkomi","zukkoke","blast","spin","peek","shiver","camera_rush"]);
const ACT_LABELS=Object.freeze({
  surprise:"びっくり",tsukkomi:"ツッコミ",zukkoke:"ズコー",blast:"吹っ飛ぶ",
  spin:"くるくる",peek:"のぞく",shiver:"ブルブル",camera_rush:"カメラ突撃"
});
const NUMERIC_KEYS=["x","y","z","yaw","pitch","roll","scaleX","scaleY","skewX","skewY","opacity"];
const panel=document.querySelector("[data-cartoon-act-panel]");
const statusEl=document.querySelector("[data-cartoon-act-status]");
const fxLayer=document.querySelector("[data-cartoon-fx-layer]");
const buttons=[...document.querySelectorAll("[data-cartoon-act]")].filter((el)=>el instanceof HTMLButtonElement);

let sequence=0;
let active=null;
let queuedAct=null;
let requestPending=false;
let raf=0;
let fxNodes=[];

function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function setStatus(text,state="waiting"){
  if(!(statusEl instanceof HTMLElement))return;
  statusEl.textContent=text;
  statusEl.dataset.state=state;
}
function liveFrame(){return document.querySelector("[data-live-screen] .broadcast-live-preview");}
function liveImage(){return document.querySelector("[data-live-screen] [data-standing-preview-image]");}
function standingLiveReady(){
  const layer=document.querySelector("[data-live-character-layer]");
  const image=liveImage();
  return document.documentElement.dataset.broadcastPhase==="live"
    &&layer instanceof HTMLElement&&!layer.hidden
    &&image instanceof HTMLImageElement&&!image.hidden&&!!image.getAttribute("src");
}
function syncPanel(){
  if(!(panel instanceof HTMLElement))return;
  panel.hidden=!standingLiveReady();
  if(panel.hidden)setStatus("待機");
}
function eventId(){
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return "act_"+Array.from(bytes,(b)=>b.toString(16).padStart(2,"0")).join("");
}
function validateFrame(frame,lastT,duration){
  if(!frame||typeof frame!=="object"||Array.isArray(frame))throw new Error("ACT_PLAN_FRAME_INVALID");
  const t=Number(frame.t);
  if(!Number.isInteger(t)||t<lastT||t<0||t>duration)throw new Error("ACT_PLAN_TIME_INVALID");
  for(const key of NUMERIC_KEYS)if(!Number.isFinite(Number(frame[key])))throw new Error("ACT_PLAN_VALUE_INVALID");
  const ease=String(frame.ease||"linear");
  if(!["linear","ease-in","ease-out","ease-in-out","cubic-in","cubic-out","hold"].includes(ease))throw new Error("ACT_PLAN_EASE_INVALID");
  return t;
}
function validatePlan(raw,act,id,seq){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("ACT_PLAN_INVALID");
  if(raw.type!==PLAN_TYPE||raw.version!==1||raw.act!==act||raw.eventId!==id||Number(raw.sequence)!==seq)throw new Error("ACT_PLAN_IDENTITY_INVALID");
  if(raw.actorModel!=="2d-actor-3d-motion-v1"||raw.projection!=="cartoon-perspective-v1"||raw.persistence!==false)throw new Error("ACT_PLAN_MODEL_INVALID");
  const duration=Number(raw.durationMs);
  if(!Number.isInteger(duration)||duration<100||duration>10000)throw new Error("ACT_PLAN_DURATION_INVALID");
  if(!Array.isArray(raw.frames)||raw.frames.length<2||raw.frames.length>64)throw new Error("ACT_PLAN_FRAMES_INVALID");
  let last=-1;
  for(const frame of raw.frames)last=validateFrame(frame,last,duration);
  if(raw.frames[0].t!==0||last!==duration)throw new Error("ACT_PLAN_RECOVERY_INVALID");
  const fx=Array.isArray(raw.fx)?raw.fx:[];
  if(fx.length>16)throw new Error("ACT_PLAN_FX_INVALID");
  for(const item of fx){
    if(!item||typeof item!=="object"||Array.isArray(item))throw new Error("ACT_PLAN_FX_INVALID");
    if(!["impact","stars","smear","vibration_lines"].includes(String(item.type||"")))throw new Error("ACT_PLAN_FX_TYPE_INVALID");
    const start=Number(item.startMs),end=Number(item.endMs);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration)throw new Error("ACT_PLAN_FX_TIME_INVALID");
  }
  return raw;
}
function easing(name,t){
  const p=clamp(t,0,1);
  if(name==="hold")return 0;
  if(name==="ease-in")return p*p;
  if(name==="ease-out")return 1-(1-p)*(1-p);
  if(name==="ease-in-out")return p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
  if(name==="cubic-in")return p*p*p;
  if(name==="cubic-out")return 1-Math.pow(1-p,3);
  return p;
}
function sample(plan,elapsed){
  const frames=plan.frames;
  if(elapsed<=0)return frames[0];
  if(elapsed>=plan.durationMs)return frames.at(-1);
  let right=1;
  while(right<frames.length&&frames[right].t<elapsed)right++;
  const a=frames[right-1],b=frames[right];
  const span=Math.max(1,b.t-a.t);
  const p=easing(String(b.ease||"linear"),(elapsed-a.t)/span);
  const out={t:elapsed};
  for(const key of NUMERIC_KEYS)out[key]=Number(a[key])+(Number(b[key])-Number(a[key]))*p;
  return out;
}
function baseState(){
  const state=window.__orikuroStandingFrameState;
  return state&&typeof state==="object"?state:{x:0,y:0,yaw:0,pitch:0,roll:0};
}
function applyTransform(actState){
  const image=liveImage(),frame=liveFrame();
  if(!(image instanceof HTMLImageElement)||!(frame instanceof HTMLElement))return;
  const unit=frame.clientHeight;
  if(!(unit>0))return;
  const base=baseState();
  const baseX=(Number(base.x)||0)*unit*.35;
  const baseY=(Number(base.y)||0)*unit*.25;
  const baseRoll=clamp(Number(base.roll)||0,-30,30)*.18;
  const baseSkew=clamp((Number(base.yaw)||0)*.04,-1.5,1.5);
  const baseScaleY=clamp(1-(Number(base.pitch)||0)*.0015,.97,1.03);
  const z=clamp(Number(actState.z)||0,-1,1);
  const depth=clamp(1+z*1.15,.42,2.15);
  const yaw=clamp(Number(actState.yaw)||0,-70,70);
  const pitch=clamp(Number(actState.pitch)||0,-60,60);
  const yawCompression=clamp(1-Math.abs(yaw)/120,.42,1);
  const pitchCompression=clamp(1-Math.abs(pitch)/150,.6,1);
  const sx=clamp((Number(actState.scaleX)||1)*depth*yawCompression,.2,3);
  const sy=clamp((Number(actState.scaleY)||1)*depth*pitchCompression*baseScaleY,.2,3);
  const skewX=clamp((Number(actState.skewX)||0)+yaw*.12+baseSkew,-25,25);
  const skewY=clamp((Number(actState.skewY)||0)-pitch*.08,-20,20);
  const x=baseX+(Number(actState.x)||0)*unit;
  const y=baseY+(Number(actState.y)||0)*unit;
  const roll=baseRoll+(Number(actState.roll)||0);
  image.style.transformOrigin="50% 62%";
  image.style.opacity=String(clamp(Number(actState.opacity)||1,0,1));
  image.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${roll.toFixed(3)}deg) skew(${skewX.toFixed(3)}deg,${skewY.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
}
function applyBase(){
  applyTransform({x:0,y:0,z:0,yaw:0,pitch:0,roll:0,scaleX:1,scaleY:1,skewX:0,skewY:0,opacity:1});
}
function clearFx(){
  for(const node of fxNodes)node.remove();
  fxNodes=[];
  if(fxLayer instanceof HTMLElement)fxLayer.textContent="";
}
function node(className,text=""){
  const el=document.createElement("span");
  el.className=className;
  el.textContent=text;
  fxLayer?.append(el);fxNodes.push(el);
  return el;
}
function setupFx(plan){
  clearFx();
  if(!(fxLayer instanceof HTMLElement))return;
  for(const fx of plan.fx){
    if(fx.type==="stars"){
      const count=clamp(Math.trunc(Number(fx.count)||3),1,6);
      fx._nodes=Array.from({length:count},()=>node("broadcast-cartoon-star","★"));
    }else if(fx.type==="impact"){
      fx._nodes=[node("broadcast-cartoon-impact")];
    }else if(fx.type==="smear"){
      fx._nodes=Array.from({length:3},(_,i)=>{
        const n=node("broadcast-cartoon-streak");
        n.style.top=`${38+i*10}%`;n.style.left="5%";return n;
      });
    }else if(fx.type==="vibration_lines"){
      fx._nodes=[node("broadcast-cartoon-vibration"),node("broadcast-cartoon-vibration")];
    }
  }
}
function updateFx(plan,elapsed){
  if(!(fxLayer instanceof HTMLElement))return;
  const frame=liveFrame(),image=liveImage();
  if(!(frame instanceof HTMLElement)||!(image instanceof HTMLImageElement))return;
  const fr=frame.getBoundingClientRect(),ir=image.getBoundingClientRect();
  for(const fx of plan.fx){
    const start=Number(fx.startMs),end=Number(fx.endMs),inside=elapsed>=start&&elapsed<=end;
    const p=inside?clamp((elapsed-start)/(end-start),0,1):0;
    if(fx.type==="stars"){
      const nodes=Array.isArray(fx._nodes)?fx._nodes:[];
      const count=nodes.length||1,turns=clamp(Number(fx.turns)||2,0,8);
      const rx=clamp(Number(fx.radiusX)||.15,.02,.4)*Math.max(40,ir.height);
      const ry=clamp(Number(fx.radiusY)||.05,.01,.25)*Math.max(40,ir.height);
      const cx=(ir.left-fr.left)+ir.width/2;
      const cy=(ir.top-fr.top)+ir.height*.12;
      nodes.forEach((n,i)=>{
        if(!(n instanceof HTMLElement))return;
        if(!inside){n.style.opacity="0";return;}
        const angle=p*turns*Math.PI*2+i*Math.PI*2/count;
        const fade=p>.78?clamp((1-p)/.22,0,1):1;
        n.style.opacity=String(fade);
        n.style.left=(cx+Math.cos(angle)*rx).toFixed(1)+"px";
        n.style.top=(cy+Math.sin(angle)*ry).toFixed(1)+"px";
        n.style.transform=`translate(-50%,-50%) rotate(${(angle*180/Math.PI).toFixed(1)}deg)`;
      });
    }else if(fx.type==="impact"){
      const n=fx._nodes?.[0];
      if(!(n instanceof HTMLElement))continue;
      const cx=(ir.left-fr.left)+ir.width/2,cy=(ir.top-fr.top)+ir.height*.45;
      n.style.left=cx.toFixed(1)+"px";n.style.top=cy.toFixed(1)+"px";
      n.style.opacity=inside?String(1-p):"0";
      n.style.transform=`translate(-50%,-50%) scale(${(.35+p*2.8).toFixed(3)})`;
    }else if(fx.type==="smear"){
      for(const [i,n] of (fx._nodes||[]).entries()){
        if(!(n instanceof HTMLElement))continue;
        n.style.opacity=inside?String((1-Math.abs(.5-p)*1.5)*.55):"0";
        n.style.transform=`translateX(${(-8-i*5+p*25).toFixed(1)}%) scaleX(${(1+p*1.4).toFixed(2)})`;
      }
    }else if(fx.type==="vibration_lines"){
      const nodes=fx._nodes||[];
      nodes.forEach((n,i)=>{
        if(!(n instanceof HTMLElement))return;
        n.style.opacity=inside?String(.35+.45*Math.sin(p*Math.PI*14+i)):"0";
        n.style.left=i===0?"12%":"84%";n.style.top="36%";
      });
    }
  }
}
function resetActVisual(){
  if(raf)cancelAnimationFrame(raf);
  raf=0;active=null;
  window.__orikuroCartoonActRunning=false;
  clearFx();applyBase();
  for(const button of buttons)button.removeAttribute("aria-pressed");
}
function finishAct(){
  const next=queuedAct;
  queuedAct=null;
  resetActVisual();
  setStatus("待機","ready");
  if(next)void requestAct(next);
}
function runPlan(plan){
  if(!standingLiveReady())return;
  resetActVisual();
  active={plan,start:performance.now()};
  window.__orikuroCartoonActRunning=true;
  setupFx(plan);
  for(const button of buttons)button.setAttribute("aria-pressed",button.dataset.cartoonAct===plan.act?"true":"false");
  setStatus(ACT_LABELS[plan.act]+" 実行中","working");
  const tick=(now)=>{
    raf=0;
    if(!active||!standingLiveReady()){finishAct();return;}
    const elapsed=clamp(now-active.start,0,active.plan.durationMs);
    applyTransform(sample(active.plan,elapsed));
    updateFx(active.plan,elapsed);
    if(elapsed>=active.plan.durationMs){finishAct();return;}
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
}
async function requestAct(act){
  if(!ACT_IDS.has(act)||!standingLiveReady())return;
  if(active){
    if(!queuedAct){queuedAct=act;setStatus(ACT_LABELS[act]+" を次に予約","working");}
    else setStatus("次の演技は予約済み","working");
    return;
  }
  if(requestPending)return;
  const grant=getStreamRealtimeGrant();
  if(!grant?.streamId||!grant?.publisherCapability){setStatus("配信認可を確認できません","error");return;}
  requestPending=true;
  const seq=++sequence,id=eventId();
  for(const button of buttons)button.disabled=true;
  setStatus(ACT_LABELS[act]+" をCloudflareへ送信","working");
  try{
    const response=await fetch(`${CARTOON_ACT_STAGE_ORIGIN}/v1/streams/${encodeURIComponent(grant.streamId)}/act`,{
      method:"POST",
      headers:{"content-type":"application/json","authorization":`Bearer ${grant.publisherCapability}`},
      body:JSON.stringify({type:CONTROL_TYPE,eventId:id,sequence:seq,act}),
      credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer"
    });
    const payload=await response.json().catch(()=>null);
    if(!response.ok||payload?.ok!==true)throw new Error(typeof payload?.code==="string"?payload.code:"CARTOON_ACT_REQUEST_FAILED");
    const plan=validatePlan(payload.result,act,id,seq);
    if(!standingLiveReady())return;
    runPlan(plan);
  }catch(error){
    setStatus("演技取得失敗: "+(error instanceof Error?error.message:"UNKNOWN"),"error");
  }finally{
    requestPending=false;
    for(const button of buttons)button.disabled=false;
  }
}
for(const button of buttons){
  button.addEventListener("click",()=>{const act=String(button.dataset.cartoonAct||"");void requestAct(act);});
}
window.addEventListener("orikuro:stream-live",()=>requestAnimationFrame(syncPanel));
window.addEventListener("orikuro:stream-start-failed",()=>{if(panel instanceof HTMLElement)panel.hidden=true;resetActVisual();});
window.addEventListener("orikuro:stream-ended",()=>resetActVisual());
window.addEventListener("pagehide",()=>resetActVisual(),{once:true});
window.addEventListener("resize",()=>{if(active)applyTransform(sample(active.plan,clamp(performance.now()-active.start,0,active.plan.durationMs)));});
syncPanel();
