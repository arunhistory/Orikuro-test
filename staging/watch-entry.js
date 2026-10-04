import{clearServiceFlowToken}from"./assets/js/service-flow.js?v=20260918-flow3";
import{clearStreamRealtimeGrant}from"./assets/js/realtime-grant.js";
import{clearWatchRealtimeGrant,takeWatchRealtimeGrant}from"./assets/js/watch-grant.js";

const ROOM_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/system-stream-test";
const STOP_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow";
const ACCESS_RE=/^[a-f0-9]{64}$/;
const STREAM_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
const CAP_RE=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

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
async function roomRequest(accessKey){
  const response=await fetch(ROOM_URL,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({accessKey}),
    credentials:"omit",
    cache:"no-store",
    referrerPolicy:"no-referrer"
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload||payload.ok!==true)throw new Error("ROOM_CREATE_FAILED");
  const result=payload.result&&typeof payload.result==="object"?payload.result:null;
  const grant=result?.realtimeGrant&&typeof result.realtimeGrant==="object"?result.realtimeGrant:null;
  if(!grant)throw new Error("ROOM_GRANT_MISSING");
  const streamId=typeof grant.streamId==="string"?grant.streamId:"";
  const monitorCapability=typeof grant.monitorCapability==="string"?grant.monitorCapability:"";
  const controlCapability=typeof grant.controlCapability==="string"?grant.controlCapability:"";
  const mediaWebSocketUrl=typeof grant.mediaWebSocketUrl==="string"?grant.mediaWebSocketUrl:"";
  const expiresAt=Number(grant.expiresAt);
  if(!STREAM_ID_RE.test(streamId)||!CAP_RE.test(monitorCapability)||!CAP_RE.test(controlCapability)||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error("ROOM_GRANT_INVALID");
  const mediaUrl=new URL(mediaWebSocketUrl);
  if(mediaUrl.protocol!=="wss:"||mediaUrl.pathname!=="/realtime/media")throw new Error("ROOM_MEDIA_URL_INVALID");

  let stopped=false;
  const roomController=Object.freeze({
    async stop(){
      if(stopped)return true;
      stopped=true;
      try{
        const stop=await fetch(STOP_URL,{
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({action:"stream_stop",streamId,controlCapability}),
          credentials:"omit",
          cache:"no-store",
          referrerPolicy:"no-referrer",
          keepalive:true
        });
        const data=await stop.json().catch(()=>null);
        const result=data?.result&&typeof data.result==="object"?data.result:null;
        return stop.ok&&data?.ok===true&&result?.streamId===streamId&&result?.cloudflareStopped===true&&result?.northflankRevoked===true;
      }catch{return false;}
    }
  });
  return{
    watchGrant:{streamId,capability:monitorCapability,mediaWebSocketUrl,expiresAt},
    roomController
  };
}
async function authorize(){
  const status=statusTarget();
  if(status)status.textContent="利用準備を確認しています。";
  const accessKey=takeAccessKey();
  try{
    if(accessKey){
      clearStreamRealtimeGrant();
      clearWatchRealtimeGrant();
      clearServiceFlowToken();
      if(status)status.textContent="視聴ルームを準備しています。";
      const room=await roomRequest(accessKey);
      reveal({
        path:"./watch-test.html",
        authorizedDemo:true,
        watchGrant:room.watchGrant,
        roomController:room.roomController
      });
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
