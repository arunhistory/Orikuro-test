// ACT operation input (staging). The browser only selects an ACT; Cloudflare's
// render-2d performs it in the composed stream picture. Nothing is animated
// locally: the preview shows the Cloudflare -> Northflank output.
const ACT_IDS=new Set(["surprise","tsukkomi","zukkoke","blast","spin","peek","shiver","camera_rush"]);
const ACT_LABELS=Object.freeze({
  surprise:"びっくり",tsukkomi:"ツッコミ",zukkoke:"ズコー",blast:"吹っ飛ぶ",
  spin:"くるくる",peek:"のぞく",shiver:"ブルブル",camera_rush:"カメラ突撃"
});
const overlay=document.querySelector("[data-cartoon-act-overlay]");
const panel=document.querySelector("[data-cartoon-act-panel]");
const toggle=document.querySelector("[data-cartoon-act-toggle]");
const closeButton=document.querySelector("[data-cartoon-act-close]");
const statusEl=document.querySelector("[data-cartoon-act-status]");
const buttons=[...document.querySelectorAll("[data-cartoon-act]")].filter((el)=>el instanceof HTMLButtonElement);

const pending=new Map();
let resetTimer=0;

function setStatus(text,state="waiting"){
  if(!(statusEl instanceof HTMLElement))return;
  statusEl.textContent=text;
  statusEl.dataset.state=state;
}
function standingLiveReady(){
  const root=document.documentElement;
  return root.dataset.broadcastPhase==="live"&&root.dataset.streamMode==="standing";
}
function setPanelOpen(open){
  const allowed=open&&standingLiveReady();
  if(panel instanceof HTMLElement)panel.hidden=!allowed;
  if(toggle instanceof HTMLButtonElement)toggle.setAttribute("aria-expanded",allowed?"true":"false");
}
function syncPanel(){
  const ready=standingLiveReady();
  if(overlay instanceof HTMLElement)overlay.hidden=!ready;
  if(!ready){setPanelOpen(false);setStatus("待機");}
}
function eventId(){
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return "act_"+Array.from(bytes,(b)=>b.toString(16).padStart(2,"0")).join("");
}
function markPressed(act){
  for(const button of buttons)button.setAttribute("aria-pressed",button.dataset.cartoonAct===act?"true":"false");
}
function scheduleIdle(ms){
  clearTimeout(resetTimer);
  resetTimer=setTimeout(()=>{markPressed(null);if(standingLiveReady())setStatus("待機");},Math.max(400,ms));
}
function requestAct(act){
  if(!ACT_IDS.has(act)||!standingLiveReady())return;
  const id=eventId();
  pending.set(id,act);
  markPressed(act);
  setStatus(`${ACT_LABELS[act]} を送信中`,"working");
  window.dispatchEvent(new CustomEvent("orikuro:cartoon-act-request",{detail:{eventId:id,act}}));
  setTimeout(()=>{if(pending.delete(id)){setStatus("応答がありません","error");scheduleIdle(1500);}},4000);
}

window.addEventListener("orikuro:cartoon-act-result",(event)=>{
  const detail=event?.detail||{};
  const id=typeof detail.eventId==="string"?detail.eventId:"";
  const act=pending.get(id)||detail.act;
  if(id)pending.delete(id);
  if(detail.ok===true){
    setStatus(`${ACT_LABELS[act]||"演技"} ${detail.queued?"（次に再生）":"再生中"}`,"ready");
    scheduleIdle((Number(detail.durationMs)||1200)+(detail.queued?1500:0));
  }else{
    setStatus(`演技できません: ${String(detail.code||"ACT_FAILED").slice(0,40)}`,"error");
    scheduleIdle(2000);
  }
});
window.addEventListener("orikuro:support-act-applied",(event)=>{
  const detail=event?.detail||{};
  if(detail.ok!==true||!ACT_IDS.has(detail.act))return;
  setStatus(`${detail.supportKind==="superchat"?"スパチャ":"ギフト"}: ${ACT_LABELS[detail.act]}`,"ready");
  scheduleIdle(1800);
});

if(toggle instanceof HTMLButtonElement){
  toggle.addEventListener("click",()=>setPanelOpen(panel instanceof HTMLElement&&panel.hidden));
}
if(closeButton instanceof HTMLButtonElement){
  closeButton.addEventListener("click",()=>setPanelOpen(false));
}
for(const button of buttons){
  button.addEventListener("click",()=>requestAct(button.dataset.cartoonAct||""));
}
window.addEventListener("orikuro:stream-live",()=>requestAnimationFrame(syncPanel));
window.addEventListener("orikuro:stream-start-failed",syncPanel);
window.addEventListener("orikuro:stream-ended",()=>{if(overlay instanceof HTMLElement)overlay.hidden=true;setPanelOpen(false);});
new MutationObserver(syncPanel).observe(document.documentElement,{attributes:true,attributeFilter:["data-broadcast-phase","data-stream-mode"]});
syncPanel();
