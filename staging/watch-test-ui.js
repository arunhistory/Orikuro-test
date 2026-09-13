import{applyStreamingCompatibility}from"./stream-compat.js";

const compatibility=applyStreamingCompatibility(document);
let transportReady=false;
let supportCatalog={gifts:[],superchatAmounts:[]};

const commentInput=document.querySelector("[data-comment-input]");
const commentSend=document.querySelector("[data-comment-send]");
const likeButton=document.querySelector("[data-like-button]");
const giftButton=document.querySelector("[data-gift-button]");
const superchatButton=document.querySelector("[data-superchat-button]");
const status=document.querySelector("[data-viewer-status]");

function setInteractive(ready){
  transportReady=ready&&compatibility.supported;
  if(commentInput)commentInput.disabled=!transportReady;
  if(commentSend)commentSend.disabled=!transportReady;
  if(likeButton)likeButton.disabled=!transportReady;
  if(giftButton)giftButton.disabled=!transportReady||supportCatalog.gifts.length===0;
  if(superchatButton)superchatButton.disabled=!transportReady||supportCatalog.superchatAmounts.length===0;
}
setInteractive(false);

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
