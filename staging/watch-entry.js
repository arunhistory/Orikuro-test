import{clearServiceFlowToken}from"./assets/js/service-flow.js?v=20260918-flow3";
import{clearStreamRealtimeGrant}from"./assets/js/realtime-grant.js";
import{clearWatchRealtimeGrant,takeWatchRealtimeGrant}from"./assets/js/watch-grant.js";

const ACCESS_RE=/^[a-f0-9]{64}$/;
const STAGE_CHECK_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/system-stream-stage-check";
const REQUEST_TIMEOUT_MS=12000;

function statusTarget(){return document.querySelector("[data-service-gate-status]");}
function contentTarget(){return document.querySelector("[data-service-content]");}
function reveal(detail){
  const status=statusTarget();
  if(status)status.textContent="";
  const content=contentTarget();
  if(content)content.hidden=false;
  document.dispatchEvent(new CustomEvent("orikuro:service-ready",{detail}));
}
function returnHome(message){
  const status=statusTarget();
  if(status)status.textContent=message;
  const content=contentTarget();
  if(content)content.hidden=true;
  clearStreamRealtimeGrant();
  clearWatchRealtimeGrant();
  clearServiceFlowToken();
  setTimeout(()=>location.replace("./index.html"),1100);
}
function takeAccessKey(){
  const hash=location.hash.startsWith("#")?location.hash.slice(1):"";
  const params=new URLSearchParams(hash);
  const value=params.get("access")||params.get("op")||"";
  if(location.hash)history.replaceState(null,"",location.pathname+location.search);
  return ACCESS_RE.test(value)?value:null;
}
async function validateAccess(accessKey){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(STAGE_CHECK_URL,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({accessKey}),
      credentials:"omit",
      cache:"no-store",
      referrerPolicy:"no-referrer",
      signal:controller.signal
    });
    const raw=await response.text();
    if(raw.length>128000)throw new Error("ACCESS_RESPONSE_TOO_LARGE");
    let data={};
    try{data=raw?JSON.parse(raw):{};}catch{}
    if(!response.ok||data?.ok!==true)throw new Error(typeof data?.code==="string"?data.code:"ACCESS_REJECTED");
    return data.result&&typeof data.result==="object"?data.result:{};
  }finally{clearTimeout(timer);}
}
async function authorize(){
  const status=statusTarget();
  if(status)status.textContent="利用準備を確認しています。";
  const accessKey=takeAccessKey();
  try{
    if(accessKey){
      const verification=await validateAccess(accessKey);
      clearStreamRealtimeGrant();
      clearWatchRealtimeGrant();
      clearServiceFlowToken();
      reveal({path:"./watch-test.html",authorizedDemo:true,stageVerification:verification});
      return;
    }
    const watchGrant=takeWatchRealtimeGrant();
    if(!watchGrant)throw new Error("WATCH_GRANT_MISSING");
    clearStreamRealtimeGrant();
    clearServiceFlowToken();
    reveal({path:"./watch-test.html",watchGrant});
  }catch{
    returnHome("利用準備ができません。");
  }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{void authorize();},{once:true});
else void authorize();
