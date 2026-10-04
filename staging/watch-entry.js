import{clearServiceFlowToken}from"./assets/js/service-flow.js?v=20260918-flow3";
import{clearStreamRealtimeGrant}from"./assets/js/realtime-grant.js";
import{clearWatchRealtimeGrant,takeWatchRealtimeGrant}from"./assets/js/watch-grant.js";
import{prepareStandingDemo}from"./watch-standing-demo.js?v=20261005-standing1";

const ACCESS_RE=/^[a-f0-9]{64}$/;

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
async function authorize(){
  const status=statusTarget();
  if(status)status.textContent="利用準備を確認しています。";
  const accessKey=takeAccessKey();
  try{
    if(accessKey){
      clearStreamRealtimeGrant();
      clearWatchRealtimeGrant();
      clearServiceFlowToken();
      if(status)status.textContent="立ち絵配信を準備しています。";
      const demoController=await prepareStandingDemo(accessKey);
      reveal({
        path:"./watch-test.html",
        authorizedDemo:true,
        watchGrant:demoController.watchGrant,
        demoController
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
