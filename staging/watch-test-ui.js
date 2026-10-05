import{WatchMediaClient}from"./assets/js/watch-media.js?v=20261005-vertical3";
import{WatchDemoPublisher}from"./assets/js/watch-demo-publisher.js?v=20261005-vertical3";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const COMMENT_PROTOCOL="orikuro-comments-v1";
const MAX_RECONNECT_MS=2000;
const compatibility=applyStreamingCompatibility(document);
const unsupportedReason=document.querySelector("[data-stream-unsupported-reason]");
if(!compatibility.supported&&unsupportedReason)unsupportedReason.textContent="この環境では視聴通信を利用できません。";

let mediaClient=null;
let demoPublisher=null;
let roomController=null;
let commentsSocket=null;
let commentsGrant=null;
let commentsAuthenticated=false;
let commentsCanSend=false;
let commentsCanLike=false;
let commentsCanGift=false;
let commentsCanSuperchat=false;
let commentsCanRanking=false;
let commentsReconnectTimer=null;
let commentsReconnectAttempt=0;
let commentLastSequence=0;
let supportScore=0;
let ranking=[];
let audioEnabled=false;
let pageStopping=false;
let toastTimer=null;

const commentInput=document.querySelector("[data-comment-input]");
const commentSend=document.querySelector("[data-comment-send]");
const commentList=document.querySelector("[data-comment-list]");
const commentEmpty=document.querySelector("[data-comment-empty]");
const likeButtons=[...document.querySelectorAll("[data-like-button],[data-like-button-top]")];
const likeCount=document.querySelector("[data-like-count]");
const giftButton=document.querySelector("[data-gift-button]");
const superchatButton=document.querySelector("[data-superchat-button]");
const rankingButtons=[...document.querySelectorAll("[data-ranking-button],[data-ranking-button-side],[data-support-score-button]")];
const rankingPanel=document.querySelector("[data-ranking-panel]");
const rankingClose=document.querySelector("[data-ranking-close]");
const rankingList=document.querySelector("[data-ranking-list]");
const supportScoreNode=document.querySelector("[data-support-score]");
const rankingPosition=document.querySelector("[data-ranking-position]");
const listenerCount=document.querySelector("[data-listener-count]");
const status=document.querySelector("[data-viewer-status]");
const mediaCanvas=document.querySelector("[data-watch-media-canvas]");
const demoCanvas=document.querySelector("[data-watch-demo-canvas]");
const audioButton=document.querySelector("[data-watch-audio]");
const waiting=document.querySelector("[data-watch-waiting]");
const programStatus=document.querySelector("[data-watch-program-status]");
const toast=document.querySelector("[data-watch-toast]");

function setStatus(value){if(status)status.textContent=value;}
function showWaiting(value){
  if(!(waiting instanceof HTMLElement))return;
  waiting.hidden=false;
  const text=waiting.querySelector("span");
  if(text)text.textContent=value;
}
function hideWaiting(){if(waiting instanceof HTMLElement)waiting.hidden=true;}
function showToast(value){
  if(!(toast instanceof HTMLElement))return;
  if(toastTimer!==null)clearTimeout(toastTimer);
  toast.textContent=value;
  toast.hidden=false;
  toastTimer=setTimeout(()=>{toast.hidden=true;toastTimer=null;},1600);
}
function interactionReady(kind){
  if(!commentsAuthenticated){showToast("操作を接続しています…");return false;}
  if(kind==="comment"&&!commentsCanSend){showToast("コメントは現在利用できません");return false;}
  if(kind==="like"&&!commentsCanLike){showToast("いいねは現在利用できません");return false;}
  if(kind==="gift"&&!commentsCanGift){showToast("ギフトは現在利用できません");return false;}
  if(kind==="superchat"&&!commentsCanSuperchat){showToast("スパチャは現在利用できません");return false;}
  if(kind==="ranking"&&!commentsCanRanking){showToast("ランキングは現在利用できません");return false;}
  return !!commentsSocket&&commentsSocket.readyState===WebSocket.OPEN;
}
function updateInteractionState(){
  const connected=commentsAuthenticated;
  document.documentElement.dataset.watchInteractions=connected?"ready":"connecting";
}
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
function updateRanking(items){
  ranking=Array.isArray(items)?items.filter(item=>item&&typeof item==="object").slice(0,20):[];
  if(rankingList instanceof HTMLElement){
    rankingList.replaceChildren();
    if(!ranking.length){
      const empty=document.createElement("li");
      empty.textContent="まだ応援はありません。";
      rankingList.append(empty);
    }else{
      ranking.forEach((item,index)=>{
        const li=document.createElement("li");
        const rank=document.createElement("span");rank.className="watch-ranking-rank";rank.textContent=String(Number(item.rank)||index+1);
        const name=document.createElement("span");name.className="watch-ranking-name";name.textContent=String(item.displayName||"リスナー").slice(0,80);
        const score=document.createElement("strong");score.className="watch-ranking-score";score.textContent=String(Number(item.score)||0);
        li.append(rank,name,score);rankingList.append(li);
      });
    }
  }
  const me=ranking.find(item=>item&&item.displayName==="リスナー")??ranking[0];
  if(rankingPosition)rankingPosition.textContent=me?String(Number(me.rank)||1):"--";
}
function applySupport(data){
  const score=Number(data?.score);
  if(Number.isSafeInteger(score)&&score>=0)supportScore=score;
  if(supportScoreNode)supportScoreNode.textContent=String(supportScore);
  updateRanking(data?.ranking);
  const kind=data?.supportKind==="superchat"?"スパチャ":"ギフト";
  showToast(kind+"をテスト送信しました");
}
function closeComments(){
  if(commentsReconnectTimer!==null){clearTimeout(commentsReconnectTimer);commentsReconnectTimer=null;}
  if(commentsSocket&&commentsSocket.readyState<WebSocket.CLOSING){try{commentsSocket.close(1000,"viewer closed");}catch{}}
  commentsSocket=null;commentsAuthenticated=false;updateInteractionState();
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
  commentsSocket=socket;commentsAuthenticated=false;updateInteractionState();
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
      commentsCanGift=data.canGift===true;
      commentsCanSuperchat=data.canSuperchat===true;
      commentsCanRanking=data.canRanking===true;
      commentsReconnectAttempt=0;
      if(Number.isSafeInteger(data.likeCount)&&data.likeCount>=0&&likeCount)likeCount.textContent=String(data.likeCount);
      updateRanking(data.ranking);
      updateInteractionState();
      return;
    }
    if(data.type==="comment"){appendComment(data.message);return;}
    if(data.type==="like_total"){
      if(Number.isSafeInteger(data.count)&&data.count>=0&&likeCount)likeCount.textContent=String(data.count);
      return;
    }
    if(data.type==="support"){applySupport(data);return;}
  });
  socket.addEventListener("close",event=>{
    if(socket!==commentsSocket)return;
    commentsSocket=null;commentsAuthenticated=false;updateInteractionState();
    if(!pageStopping&&event.code!==1008)scheduleCommentsReconnect();
  });
  socket.addEventListener("error",()=>{});
}
async function stopMedia(){
  if(mediaClient){try{await mediaClient.stop();}catch{}mediaClient=null;}
  audioEnabled=false;
  if(audioButton)audioButton.textContent="音声";
}
async function stopDemo(keepalive=false){
  if(!demoPublisher)return;
  const current=demoPublisher;demoPublisher=null;
  try{await current.stop(keepalive);}catch{}
}
async function stopRoom(){
  if(!roomController)return;
  const current=roomController;roomController=null;
  try{await current.stop();}catch{}
}
function startGrant(grant,controller=null,demoGrant=null){
  if(!compatibility.supported||!grant||!(mediaCanvas instanceof HTMLCanvasElement)){setStatus("視聴準備エラー");return;}
  roomController=controller||roomController;
  commentsGrant=grant;
  try{
    mediaClient=new WatchMediaClient(grant,mediaCanvas,status);
    mediaClient.onEnded(()=>window.dispatchEvent(new CustomEvent("orikuro:stream-ended",{detail:{reason:"ended"}})));
    mediaClient.start();
    connectComments(grant);
    if(audioButton)audioButton.textContent="音声";
    setStatus("映像接続中");
    if(listenerCount)listenerCount.textContent="1";

    if(demoGrant&&demoCanvas instanceof HTMLCanvasElement){
      demoPublisher=new WatchDemoPublisher(demoGrant,demoCanvas);
      void demoPublisher.start().catch(error=>{
        setStatus("立ち絵送出エラー");
        showWaiting("背景・立ち絵を送出できませんでした");
        window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-failed",{detail:{code:error instanceof Error?error.message:"WATCH_DEMO_START_FAILED"}}));
      });
    }else{
      showWaiting("配信映像を待っています…");
    }
  }catch{
    setStatus("視聴開始エラー");
    void stopMedia();
  }
}

document.addEventListener("orikuro:service-ready",event=>{
  const detail=event?.detail&&typeof event.detail==="object"?event.detail:{};
  if(detail.roomPending===true){
    setStatus("配信ルーム接続中");
    if(programStatus)programStatus.textContent="準備中";
    showWaiting("背景と立ち絵を準備しています…");
    return;
  }
  if(detail.watchGrant)startGrant(detail.watchGrant);
},{once:true});

document.addEventListener("orikuro:watch-room-ready",event=>{
  const detail=event?.detail&&typeof event.detail==="object"?event.detail:{};
  startGrant(detail.watchGrant,detail.roomController,detail.demoPublisher);
});
document.addEventListener("orikuro:watch-room-failed",()=>{
  setStatus("ルーム接続エラー");
  if(programStatus)programStatus.textContent="接続失敗";
  showWaiting("視聴ルームへ接続できませんでした");
});

window.addEventListener("orikuro:demo-preview-ready",()=>{
  hideWaiting();
  setStatus("立ち絵送出中");
  if(programStatus)programStatus.textContent="LIVE";
  if(demoCanvas instanceof HTMLCanvasElement)demoCanvas.hidden=false;
});
window.addEventListener("orikuro:demo-publisher-live",()=>{if(programStatus)programStatus.textContent="LIVE";});
window.addEventListener("orikuro:media-first-frame",()=>{
  hideWaiting();
  if(mediaCanvas instanceof HTMLCanvasElement)mediaCanvas.hidden=false;
  if(demoCanvas instanceof HTMLCanvasElement)demoCanvas.hidden=true;
  setStatus("視聴中");
  if(programStatus)programStatus.textContent="LIVE";
});
window.addEventListener("orikuro:transport-ready",()=>{setStatus("映像受信中");});
window.addEventListener("orikuro:transport-reconnecting",()=>{
  setStatus("再接続中");
  if(mediaCanvas instanceof HTMLCanvasElement)mediaCanvas.hidden=true;
  if(demoCanvas instanceof HTMLCanvasElement)demoCanvas.hidden=false;
});
window.addEventListener("orikuro:stream-ended",event=>{
  closeComments();void stopMedia();void stopDemo();void stopRoom();
  const reason=event?.detail?.reason||"ended";
  location.replace(`./stream-ended.html?reason=${encodeURIComponent(reason)}`);
});

audioButton?.addEventListener("click",async()=>{
  if(!mediaClient){showToast("音声を接続しています…");return;}
  try{
    if(audioEnabled){await mediaClient.disableAudio();audioEnabled=false;audioButton.textContent="音声";}
    else{await mediaClient.enableAudio();audioEnabled=true;audioButton.textContent="音声ON";}
  }catch{showToast("音声を開始できません");}
});

const commentForm=document.querySelector("[data-comment-form]");
commentForm?.addEventListener("submit",event=>{
  event.preventDefault();
  const message=commentInput?.value.trim()||"";
  if(!message)return;
  if(!interactionReady("comment"))return;
  commentsSocket.send(JSON.stringify({type:"comment",text:message}));
  commentInput.value="";
});

function sendLike(button){
  if(!interactionReady("like"))return;
  commentsSocket.send(JSON.stringify({type:"like",count:1}));
  button?.classList.remove("watch-like-pop");
  void button?.offsetWidth;
  button?.classList.add("watch-like-pop");
}
likeButtons.forEach(button=>button.addEventListener("click",()=>sendLike(button)));

giftButton?.addEventListener("click",()=>{
  if(!interactionReady("gift"))return;
  commentsSocket.send(JSON.stringify({type:"gift",count:1}));
});
superchatButton?.addEventListener("click",()=>{
  if(!interactionReady("superchat"))return;
  commentsSocket.send(JSON.stringify({type:"superchat",count:1}));
});
function openRanking(){
  if(!interactionReady("ranking"))return;
  if(rankingPanel instanceof HTMLElement)rankingPanel.hidden=false;
}
rankingButtons.forEach(button=>button.addEventListener("click",openRanking));
rankingClose?.addEventListener("click",()=>{if(rankingPanel instanceof HTMLElement)rankingPanel.hidden=true;});

window.addEventListener("pagehide",()=>{
  pageStopping=true;closeComments();
  void stopMedia();
  void stopDemo(true);
  void stopRoom();
},{once:true});
