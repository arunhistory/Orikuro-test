import{WatchMediaClient}from"./assets/js/watch-media.js?v=20260918-media2";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260919-compat2";

const compatibility=applyStreamingCompatibility(document);
let transportReady=false;
let supportCatalog={gifts:[],superchatAmounts:[]};
let mediaClient=null;
let audioEnabled=false;

const commentInput=document.querySelector("[data-comment-input]");
const commentSend=document.querySelector("[data-comment-send]");
const likeButton=document.querySelector("[data-like-button]");
const giftButton=document.querySelector("[data-gift-button]");
const superchatButton=document.querySelector("[data-superchat-button]");
const status=document.querySelector("[data-viewer-status]");
const canvas=document.querySelector("[data-watch-media-canvas]");
const placeholder=document.querySelector("[data-watch-placeholder]");
const audioButton=document.querySelector("[data-watch-audio]");

function setInteractive(ready){
  transportReady=ready&&compatibility.supported;
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
    audioButton.textContent="音量";
  }
}

document.addEventListener("orikuro:service-ready",event=>{
  const detail=event?.detail&&typeof event.detail==="object"?event.detail:{};
  const grant=detail.watchGrant;
  if(!compatibility.supported||!grant||!canvas){
    if(status)status.textContent="視聴準備エラー";
    return;
  }
  try{
    mediaClient=new WatchMediaClient(grant,canvas,status);
    mediaClient.onEnded(()=>window.dispatchEvent(new CustomEvent("orikuro:stream-ended",{detail:{reason:"ended"}})));
    mediaClient.start();
    if(placeholder)placeholder.hidden=true;
    canvas.hidden=false;
    if(audioButton){
      audioButton.disabled=false;
      audioButton.textContent="音声ON";
    }
    setInteractive(true);
  }catch{
    if(status)status.textContent="視聴開始エラー";
    void stopMedia();
  }
},{once:true});

audioButton?.addEventListener("click",async()=>{
  if(!mediaClient)return;
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
  if(status)status.textContent="接続済み";
  setInteractive(true);
});
window.addEventListener("orikuro:transport-reconnecting",()=>{
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
window.addEventListener("pagehide",()=>{void stopMedia();},{once:true});
