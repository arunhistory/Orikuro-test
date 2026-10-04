import{WatchMediaClient}from"./assets/js/watch-media.js?v=20260918-media2";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const compatibility=applyStreamingCompatibility(document);
const unsupportedReason=document.querySelector("[data-stream-unsupported-reason]");
if(!compatibility.supported&&unsupportedReason)unsupportedReason.textContent="この環境では視聴通信を利用できません。";
let transportReady=false;
let supportCatalog={gifts:[],superchatAmounts:[]};
let mediaClient=null;
let demoController=null;
let authorizedDemo=false;
let audioEnabled=false;

const commentInput=document.querySelector("[data-comment-input]");
const commentSend=document.querySelector("[data-comment-send]");
const likeButton=document.querySelector("[data-like-button]");
const giftButton=document.querySelector("[data-gift-button]");
const superchatButton=document.querySelector("[data-superchat-button]");
const status=document.querySelector("[data-viewer-status]");
const canvas=document.querySelector("[data-watch-media-canvas]");
const audioButton=document.querySelector("[data-watch-audio]");
const waiting=document.querySelector("[data-watch-waiting]");
const programStatus=document.querySelector("[data-watch-program-status]");

function setInteractive(ready){
  transportReady=ready&&compatibility.supported&&!authorizedDemo;
  if(commentInput)commentInput.disabled=!transportReady;
  if(commentSend)commentSend.disabled=!transportReady;
  if(likeButton)likeButton.disabled=!transportReady;
  if(giftButton)giftButton.disabled=!transportReady||supportCatalog.gifts.length===0;
  if(superchatButton)superchatButton.disabled=!transportReady||supportCatalog.superchatAmounts.length===0;
}
setInteractive(false);

async function stopMedia(){
  if(mediaClient){
    try{await mediaClient.stop();}catch{}
    mediaClient=null;
  }
  audioEnabled=false;
  if(audioButton){
    audioButton.disabled=true;
    audioButton.textContent="音声ON";
  }
}
async function stopDemo(){
  if(!demoController)return;
  const current=demoController;
  demoController=null;
  try{await current.stop();}catch{}
}

document.addEventListener("orikuro:service-ready",event=>{
  const detail=event?.detail&&typeof event.detail==="object"?event.detail:{};
  const grant=detail.watchGrant;
  authorizedDemo=detail.authorizedDemo===true;
  demoController=authorizedDemo&&detail.demoController?detail.demoController:null;
  if(!compatibility.supported||!grant||!canvas){
    if(status)status.textContent="視聴準備エラー";
    void stopDemo();
    return;
  }
  try{
    mediaClient=new WatchMediaClient(grant,canvas,status);
    mediaClient.onEnded(()=>window.dispatchEvent(new CustomEvent("orikuro:stream-ended",{detail:{reason:"ended"}})));
    mediaClient.start();
    canvas.hidden=false;
    if(authorizedDemo){
      if(status)status.textContent="立ち絵配信へ接続しています。";
      if(programStatus)programStatus.textContent="立ち絵 自動配信";
      if(audioButton){audioButton.disabled=true;audioButton.textContent="音声なし";}
      setInteractive(false);
      void demoController?.start().catch(()=>{
        if(status)status.textContent="立ち絵配信を開始できません。";
        void stopDemo();
      });
    }else if(audioButton){
      audioButton.disabled=false;
      audioButton.textContent="音声ON";
    }
  }catch{
    if(status)status.textContent="視聴開始エラー";
    void stopMedia();
    void stopDemo();
  }
},{once:true});

audioButton?.addEventListener("click",async()=>{
  if(!mediaClient||authorizedDemo)return;
  try{
    if(audioEnabled){
      await mediaClient.disableAudio();
      audioEnabled=false;
      audioButton.textContent="音声ON";
    }else{
      await mediaClient.enableAudio();
      audioEnabled=true;
      audioButton.textContent="音声OFF";
    }
  }catch{
    if(status)status.textContent="音声再生エラー";
  }
});

window.addEventListener("orikuro:transport-ready",()=>{
  if(waiting instanceof HTMLElement)waiting.hidden=true;
  if(status)status.textContent=authorizedDemo?"立ち絵配信中":"視聴中";
  setInteractive(true);
});
window.addEventListener("orikuro:transport-reconnecting",()=>{
  if(waiting instanceof HTMLElement)waiting.hidden=false;
  if(status)status.textContent="再接続中";
  setInteractive(false);
});
window.addEventListener("orikuro:support-catalog",event=>{
  const detail=event?.detail||{};
  supportCatalog={
    gifts:Array.isArray(detail.gifts)?detail.gifts:[],
    superchatAmounts:Array.isArray(detail.superchatAmounts)?detail.superchatAmounts:[]
  };
  setInteractive(transportReady);
});
window.addEventListener("orikuro:stream-ended",event=>{
  void stopMedia();
  void stopDemo();
  const reason=event?.detail?.reason||"ended";
  location.replace(`./stream-ended.html?reason=${encodeURIComponent(reason)}`);
});

if(likeButton){
  likeButton.addEventListener("click",()=>{
    if(!transportReady)return;
    likeButton.classList.remove("is-pressed");
    void likeButton.offsetWidth;
    likeButton.classList.add("is-pressed");
    window.dispatchEvent(new CustomEvent("orikuro:like-request",{detail:{count:1}}));
  });
}
const commentForm=document.querySelector("[data-comment-form]");
if(commentForm){
  commentForm.addEventListener("submit",event=>{
    event.preventDefault();
    if(!transportReady||!commentInput)return;
    const message=commentInput.value.trim();
    if(!message)return;
    window.dispatchEvent(new CustomEvent("orikuro:comment-request",{detail:{message}}));
    commentInput.value="";
  });
}
if(giftButton){
  giftButton.addEventListener("click",()=>{
    if(!transportReady||supportCatalog.gifts.length===0)return;
    window.dispatchEvent(new CustomEvent("orikuro:gift-picker-request",{detail:{gifts:supportCatalog.gifts}}));
  });
}
if(superchatButton){
  superchatButton.addEventListener("click",()=>{
    if(!transportReady||supportCatalog.superchatAmounts.length===0)return;
    window.dispatchEvent(new CustomEvent("orikuro:superchat-picker-request",{detail:{amounts:supportCatalog.superchatAmounts}}));
  });
}

window.addEventListener("pagehide",()=>{
  void stopMedia();
  void stopDemo();
},{once:true});
