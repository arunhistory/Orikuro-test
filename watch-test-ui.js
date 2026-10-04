import{WatchMediaClient}from"./assets/js/watch-media.js?v=20260918-media2";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const COMMENT_PROTOCOL="orikuro-comments-v1";
const MAX_RECONNECT_MS=2000;
const compatibility=applyStreamingCompatibility(document);
const unsupportedReason=document.querySelector("[data-stream-unsupported-reason]");
if(!compatibility.supported&&unsupportedReason)unsupportedReason.textContent="この環境では視聴通信を利用できません。";

let mediaClient=null;
let roomController=null;
let commentsSocket=null;
let commentsGrant=null;
let commentsAuthenticated=false;
let commentsCanSend=false;
let commentsCanLike=false;
let commentsReconnectTimer=null;
let commentsReconnectAttempt=0;
let commentLastSequence=0;
let audioEnabled=false;
let pageStopping=false;

const commentInput=document.querySelector("[data-comment-input]");
const commentSend=document.querySelector("[data-comment-send]");
const commentList=document.querySelector("[data-comment-list]");
const commentEmpty=document.querySelector("[data-comment-empty]");
const likeButton=document.querySelector("[data-like-button]");
const likeCount=document.querySelector("[data-like-count]");
const status=document.querySelector("[data-viewer-status]");
const canvas=document.querySelector("[data-watch-media-canvas]");
const audioButton=document.querySelector("[data-watch-audio]");
const waiting=document.querySelector("[data-watch-waiting]");
const programStatus=document.querySelector("[data-watch-program-status]");
const fullscreenButton=document.querySelector("[data-fullscreen-button]");
const fullscreenTarget=document.querySelector(".watch-live-screen");

function setStatus(value){if(status)status.textContent=value;}
function showWaiting(value){
  if(!(waiting instanceof HTMLElement))return;
  waiting.hidden=false;
  const text=waiting.querySelector("span");
  if(text)text.textContent=value;
}
function hideWaiting(){if(waiting instanceof HTMLElement)waiting.hidden=true;}
function updateInteractive(){
  if(commentInput)commentInput.disabled=!commentsAuthenticated||!commentsCanSend;
  if(commentSend)commentSend.disabled=!commentsAuthenticated||!commentsCanSend;
  if(likeButton)likeButton.disabled=!commentsAuthenticated||!commentsCanLike;
}
updateInteractive();

function appendComment(message){
  if(!message||typeof message!=="object")return;
  const sequence=Number(message.sequence);
  const text=typeof message.text==="string"?message.text.trim():"";
  const name=typeof message.displayName==="string"?message.displayName.trim():"";
  if(!Number.isSafeInteger(sequence)||sequence<=commentLastSequence||!text)return;
  commentLastSequence=sequence;
  if(commentEmpty instanceof HTMLElement)commentEmpty.remove();
  if(!(commentList instanceof HTMLElement))return;
  const row=document.createElement("p");
  row.className="watch-comment-item";
  const user=document.createElement("strong");
  user.className="watch-comment-name";
  user.textContent=(name||"リスナー").slice(0,80);
  const body=document.createElement("span");
  body.className="watch-comment-text";
  body.textContent=text.slice(0,200);
  row.append(user,body);
  commentList.append(row);
  while(commentList.children.length>100)commentList.firstElementChild?.remove();
  commentList.scrollTop=commentList.scrollHeight;
}
function closeComments(){
  if(commentsReconnectTimer!==null){clearTimeout(commentsReconnectTimer);commentsReconnectTimer=null;}
  if(commentsSocket&&commentsSocket.readyState<WebSocket.CLOSING){
    try{commentsSocket.close(1000,"viewer closed");}catch{}
  }
  commentsSocket=null;
  commentsAuthenticated=false;
  updateInteractive();
}
function reconnectDelay(){return Math.min(MAX_RECONNECT_MS,250*(2**Math.min(commentsReconnectAttempt++,3)));}
function scheduleCommentsReconnect(){
  if(pageStopping||commentsReconnectTimer!==null||!commentsGrant||commentsGrant.expiresAt<=Date.now())return;
  commentsReconnectTimer=setTimeout(()=>{commentsReconnectTimer=null;connectComments(commentsGrant);},reconnectDelay());
}
function connectComments(grant){
  if(pageStopping||!grant||grant.expiresAt<=Date.now())return;
  commentsGrant=grant;
  if(commentsSocket&&(commentsSocket.readyState===WebSocket.OPEN||commentsSocket.readyState===WebSocket.CONNECTING))return;
  const socket=new WebSocket(grant.commentsWebSocketUrl,COMMENT_PROTOCOL);
  commentsSocket=socket;
  commentsAuthenticated=false;
  updateInteractive();
  socket.addEventListener("open",()=>{
    if(socket!==commentsSocket)return;
    socket.send(JSON.stringify({type:"auth",streamId:grant.streamId,capability:grant.capability,lastSequence:commentLastSequence}));
  });
  socket.addEventListener("message",event=>{
    if(socket!==commentsSocket||typeof event.data!=="string"||event.data.length>64000)return;
    let data;try{data=JSON.parse(event.data);}catch{return;}
    if(!data||typeof data!=="object")return;
    if(data.type==="auth_ok"){
      commentsAuthenticated=true;
      commentsCanSend=data.canComment===true;
      commentsCanLike=data.canLike===true;
      commentsReconnectAttempt=0;
      if(Number.isSafeInteger(data.likeCount)&&data.likeCount>=0&&likeCount)likeCount.textContent=String(data.likeCount);
      updateInteractive();
      return;
    }
    if(data.type==="comment"){appendComment(data.message);return;}
    if(data.type==="like_total"){
      if(Number.isSafeInteger(data.count)&&data.count>=0&&likeCount)likeCount.textContent=String(data.count);
      return;
    }
  });
  socket.addEventListener("close",event=>{
    if(socket!==commentsSocket)return;
    commentsSocket=null;
    commentsAuthenticated=false;
    updateInteractive();
    if(!pageStopping&&event.code!==1008)scheduleCommentsReconnect();
  });
  socket.addEventListener("error",()=>{});
}
async function stopMedia(){
  if(mediaClient){try{await mediaClient.stop();}catch{}mediaClient=null;}
  audioEnabled=false;
  if(audioButton){audioButton.disabled=true;audioButton.textContent="音声ON";}
}
async function stopRoom(){
  if(!roomController)return;
  const current=roomController;roomController=null;
  try{await current.stop();}catch{}
}
function startGrant(grant,controller=null){
  if(!compatibility.supported||!grant||!canvas){setStatus("視聴準備エラー");return;}
  roomController=controller||roomController;
  commentsGrant=grant;
  try{
    mediaClient=new WatchMediaClient(grant,canvas,status);
    mediaClient.onEnded(()=>window.dispatchEvent(new CustomEvent("orikuro:stream-ended",{detail:{reason:"ended"}})));
    mediaClient.start();
    canvas.hidden=false;
    if(audioButton){audioButton.disabled=false;audioButton.textContent="音声ON";}
    connectComments(grant);
    setStatus("接続中");
    if(programStatus)programStatus.textContent="配信待ち";
    showWaiting("配信開始を待っています");
  }catch{
    setStatus("視聴開始エラー");
    void stopMedia();
  }
}

document.addEventListener("orikuro:service-ready",event=>{
  const detail=event?.detail&&typeof event.detail==="object"?event.detail:{};
  if(detail.roomPending===true){
    setStatus("ルーム接続中");
    if(programStatus)programStatus.textContent="接続中";
    showWaiting("ルームへ接続しています…");
    return;
  }
  if(detail.watchGrant)startGrant(detail.watchGrant);
},{once:true});

document.addEventListener("orikuro:watch-room-ready",event=>{
  const detail=event?.detail&&typeof event.detail==="object"?event.detail:{};
  startGrant(detail.watchGrant,detail.roomController);
});
document.addEventListener("orikuro:watch-room-failed",()=>{
  setStatus("ルーム接続エラー");
  if(programStatus)programStatus.textContent="接続失敗";
  showWaiting("視聴ルームへ接続できませんでした");
});

audioButton?.addEventListener("click",async()=>{
  if(!mediaClient)return;
  try{
    if(audioEnabled){
      await mediaClient.disableAudio();audioEnabled=false;audioButton.textContent="音声ON";
    }else{
      await mediaClient.enableAudio();audioEnabled=true;audioButton.textContent="音声OFF";
    }
  }catch{setStatus("音声再生エラー");}
});

window.addEventListener("orikuro:transport-ready",()=>{
  hideWaiting();
  setStatus("視聴接続済み");
  if(programStatus)programStatus.textContent="配信待ち";
});
window.addEventListener("orikuro:transport-reconnecting",()=>{
  setStatus("再接続中");
  showWaiting("再接続しています…");
});
window.addEventListener("orikuro:stream-ended",event=>{
  closeComments();
  void stopMedia();
  void stopRoom();
  const reason=event?.detail?.reason||"ended";
  location.replace(`./stream-ended.html?reason=${encodeURIComponent(reason)}`);
});

const commentForm=document.querySelector("[data-comment-form]");
commentForm?.addEventListener("submit",event=>{
  event.preventDefault();
  if(!commentsAuthenticated||!commentsCanSend||!commentInput||!commentsSocket||commentsSocket.readyState!==WebSocket.OPEN)return;
  const message=commentInput.value.trim();
  if(!message)return;
  commentsSocket.send(JSON.stringify({type:"comment",text:message}));
  commentInput.value="";
});

likeButton?.addEventListener("click",()=>{
  if(!commentsAuthenticated||!commentsCanLike||!commentsSocket||commentsSocket.readyState!==WebSocket.OPEN)return;
  commentsSocket.send(JSON.stringify({type:"like",count:1}));
  likeButton.classList.remove("is-pressed");
  void likeButton.offsetWidth;
  likeButton.classList.add("is-pressed");
});

fullscreenButton?.addEventListener("click",async()=>{
  if(!(fullscreenTarget instanceof HTMLElement))return;
  try{
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    if(typeof fullscreenTarget.requestFullscreen==="function"){await fullscreenTarget.requestFullscreen();}
  }catch{}
});
document.addEventListener("fullscreenchange",()=>{
  if(fullscreenButton)fullscreenButton.textContent=document.fullscreenElement?"全画面終了":"全画面";
});

window.addEventListener("pagehide",()=>{
  pageStopping=true;
  closeComments();
  void stopMedia();
  void stopRoom();
},{once:true});
