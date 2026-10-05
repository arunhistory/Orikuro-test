import{clearServiceFlowToken}from"./assets/js/service-flow.js?v=20260918-flow3";
import{clearStreamRealtimeGrant}from"./assets/js/realtime-grant.js";
import{clearWatchRealtimeGrant,takeWatchRealtimeGrant}from"./assets/js/watch-grant.js";

const ROOM_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/system-watch-room";
const STOP_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow";
const ACCESS_RE=/^[a-f0-9]{64}$/;
const STREAM_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
const CAP_RE=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const NF_HOST="health--orikuro-northflank--gzhr8p5vl59b.code.run";
const CF_HOST="orikuro-streaming.garigarimegane625.workers.dev";

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
  // Reusable staging access stays in the URL fragment so reload creates a fresh isolated room.
  return ACCESS_RE.test(value)?value:null;
}
function checkedWs(raw,path,host=NF_HOST){
  if(typeof raw!=="string")throw new Error("ROOM_URL_INVALID");
  const url=new URL(raw);
  if(url.protocol!=="wss:"||url.hostname!==host||(url.port&&url.port!=="443")||url.username||url.password||url.pathname!==path||url.search||url.hash)throw new Error("ROOM_URL_INVALID");
  return url.toString();
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
  if(!response.ok||!payload||payload.ok!==true)throw new Error(typeof payload?.code==="string"?payload.code:"ROOM_CREATE_FAILED");
  const result=payload.result&&typeof payload.result==="object"?payload.result:null;
  const grant=result?.watchGrant&&typeof result.watchGrant==="object"?result.watchGrant:null;
  const demo=result?.demoPublisher&&typeof result.demoPublisher==="object"?result.demoPublisher:null;
  if(!grant||!demo)throw new Error("ROOM_GRANT_MISSING");
  const streamId=typeof grant.streamId==="string"?grant.streamId:"";
  const capability=typeof grant.capability==="string"?grant.capability:"";
  const expiresAt=Number(grant.expiresAt);
  const publisherCapability=typeof demo.publisherCapability==="string"?demo.publisherCapability:"";
  const controlCapability=typeof demo.controlCapability==="string"?demo.controlCapability:"";
  const publisherExpiresAt=Number(demo.expiresAt);
  if(!STREAM_ID_RE.test(streamId)||demo.streamId!==streamId||!CAP_RE.test(capability)||!CAP_RE.test(publisherCapability)||!CAP_RE.test(controlCapability)||!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now()||!Number.isSafeInteger(publisherExpiresAt)||publisherExpiresAt<=Date.now())throw new Error("ROOM_GRANT_INVALID");
  const mediaWebSocketUrl=checkedWs(grant.mediaWebSocketUrl,"/realtime/media");
  const commentsWebSocketUrl=checkedWs(grant.commentsWebSocketUrl,"/realtime/comments");
  const cloudflareWebSocketUrl=checkedWs(demo.cloudflareWebSocketUrl,`/v1/streams/${streamId}/ws`,CF_HOST);

  let stopped=false;
  const roomController=Object.freeze({
    async stop(){
      if(stopped)return true;
      stopped=true;
      try{
        const response=await fetch(STOP_URL,{
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({action:"stream_stop",streamId,controlCapability}),
          credentials:"omit",
          cache:"no-store",
          referrerPolicy:"no-referrer",
          keepalive:true
        });
        const data=await response.json().catch(()=>null);
        const result=data?.result&&typeof data.result==="object"?data.result:null;
        return response.ok&&data?.ok===true&&result?.streamId===streamId&&result?.cloudflareStopped===true&&result?.northflankRevoked===true;
      }catch{return false;}
    }
  });
  return{
    watchGrant:{streamId,capability,expiresAt,mediaWebSocketUrl,commentsWebSocketUrl},
    demoPublisher:{streamId,publisherCapability,controlCapability,cloudflareWebSocketUrl,expiresAt:publisherExpiresAt},
    roomController
  };
}
async function authorize(){
  const status=statusTarget();
  if(status)status.textContent="利用準備を確認しています。";
  const accessKey=takeAccessKey();
  if(accessKey){
    clearStreamRealtimeGrant();
    clearWatchRealtimeGrant();
    clearServiceFlowToken();
    reveal({path:"./watch-test.html",authorizedDemo:true,roomPending:true});
    try{
      const room=await roomRequest(accessKey);
      document.dispatchEvent(new CustomEvent("orikuro:watch-room-ready",{detail:room}));
    }catch(error){
      document.dispatchEvent(new CustomEvent("orikuro:watch-room-failed",{detail:{code:error instanceof Error?error.message:"ROOM_CREATE_FAILED"}}));
    }
    return;
  }
  try{
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
