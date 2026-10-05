import{WatchMediaClient}from"./assets/js/watch-media.js?v=20261005-upper1";
import{WatchDemoPublisher}from"./assets/js/watch-demo-publisher.js?v=20261005-upper1";
import{applyStreamingCompatibility}from"./stream-compat.js?v=20260920-compat3";

const COMMENT_PROTOCOL="orikuro-comments-v1";
const SUPPORT_PROTOCOL="orikuro-support-v1";
const MAX_RECONNECT_MS=2000;
const TEST_WINDOW_MS=10*60_000;
const WARNING_BEFORE_END_MS=2*60_000;
const compatibility=applyStreamingCompatibility(document);
const unsupportedReason=document.querySelector("[data-stream-unsupported-reason]");
if(!compatibility.supported&&unsupportedReason)unsupportedReason.textContent="この環境では視聴通信を利用できません。";

let mediaClient=null,demoPublisher=null,roomController=null,currentGrant=null;
let commentsSocket=null,commentsAuthenticated=false,commentsCanSend=false,commentsCanLike=false,commentSequence=0,commentsReconnectTimer=null,commentsReconnectAttempt=0;
let supportSocket=null,supportAuthenticated=false,supportCanPublish=false,supportSequence=0,supportReconnectTimer=null,supportReconnectAttempt=0;
let supportGiftCatalog=[],supportSuperchatAmounts=[],selectedSuperchatAmount=0;
let audioEnabled=false,pageStopping=false,warningTimer=null,endTimer=null,clockTimer=null,effectTimer=null;
let giftTotal=0,superchatTotal=0,supportScore=0;
const supportBySubject=new Map(),subjectAliases=new Map();

const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const status=q("[data-viewer-status]"),clock=q("[data-stream-clock]"),waiting=q("[data-watch-waiting]");
const mediaCanvas=q("[data-watch-media-canvas]"),demoCanvas=q("[data-watch-demo-canvas]");
const commentList=q("[data-comment-list]"),commentInput=q("[data-comment-input]");
const likeCounts=qa("[data-like-count]"),audioButton=q("[data-watch-audio]");
const supportEffect=q("[data-support-effect]");
const giftPanel=q("[data-gift-panel]"),superchatPanel=q("[data-superchat-panel]");
const giftOptions=q("[data-gift-options]"),superchatOptions=q("[data-superchat-options]"),superchatMessage=q("[data-superchat-message]");
const supportPanel=q("[data-live-support-panel]"),rankingPanel=q("[data-live-ranking-panel]"),listenerPanel=q("[data-live-listener-panel]");

function setStatus(value){if(status)status.textContent=value;}
function showWaiting(value){if(waiting instanceof HTMLElement){waiting.hidden=false;const span=waiting.querySelector("span");if(span)span.textContent=value;}}
function hideWaiting(){if(waiting instanceof HTMLElement)waiting.hidden=true;}
function closePanels(except=null){for(const panel of [supportPanel,rankingPanel,listenerPanel,giftPanel,superchatPanel])if(panel instanceof HTMLElement&&panel!==except)panel.hidden=true;}
function openPanel(panel){if(!(panel instanceof HTMLElement))return;closePanels(panel);panel.hidden=false;}
function closePanel(panel){if(panel instanceof HTMLElement)panel.hidden=true;}
function formatPoint(value){return new Intl.NumberFormat("ja-JP").format(Math.max(0,Math.floor(Number(value)||0)));}
function requestId(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
function aliasFor(subject){
  if(!subjectAliases.has(subject))subjectAliases.set(subject,`リスナー ${subjectAliases.size+1}`);
  return subjectAliases.get(subject);
}

function appendFeed(kind,name,text){
  if(!(commentList instanceof HTMLOListElement))return;
  const li=document.createElement("li");li.className="realtime-comment-item";li.dataset.feedKind=kind;
  const who=document.createElement("span");who.className="realtime-comment-name";who.textContent=name;
  const body=document.createElement("span");body.className=kind==="comment"?"realtime-comment-text":"realtime-system-text";body.textContent=text;
  li.append(who,body);commentList.append(li);
  while(commentList.children.length>100)commentList.firstElementChild?.remove();
  commentList.scrollTop=commentList.scrollHeight;
}
function showEffect(kind,text){
  if(!(supportEffect instanceof HTMLElement))return;
  if(effectTimer!==null)clearTimeout(effectTimer);
  supportEffect.className="watch-support-effect "+(kind==="gift"?"is-gift":"is-superchat");
  supportEffect.textContent=text;supportEffect.hidden=false;
  effectTimer=setTimeout(()=>{supportEffect.hidden=true;effectTimer=null;},kind==="gift"?950:1900);
}
function renderSupportTotals(){
  qa("[data-support-score]").forEach(el=>el.textContent=formatPoint(supportScore));
  const gift=q("[data-gift-total]"),superchat=q("[data-superchat-total]"),eventPoints=q("[data-event-points]");
  if(gift)gift.textContent=formatPoint(giftTotal)+"pt";
  if(superchat)superchat.textContent=formatPoint(superchatTotal)+"pt";
  if(eventPoints)eventPoints.textContent=formatPoint(supportScore);
}
function renderRanking(){
  const rows=[...supportBySubject.entries()].map(([subject,score])=>({subject,score})).sort((a,b)=>b.score-a.score||a.subject.localeCompare(b.subject));
  const list=q("[data-event-ranking-list]");if(list instanceof HTMLOListElement){list.replaceChildren();
    if(!rows.length){const li=document.createElement("li");li.textContent="まだ応援はありません。";list.append(li);}
    rows.forEach((row,index)=>{const li=document.createElement("li");li.innerHTML=`<strong>${index+1}位</strong><span></span><b>${formatPoint(row.score)}pt</b>`;const span=li.querySelector("span");if(span)span.textContent=aliasFor(row.subject);list.append(li);});
  }
  const rank=q("[data-event-rank]");if(rank)rank.textContent=rows.length?"1":"--";
}
function applySupportEvent(event){
  if(!event||typeof event!=="object")return;
  const sequence=Number(event.sequence);if(!Number.isSafeInteger(sequence)||sequence<=supportSequence)return;supportSequence=sequence;
  const effectPoints=Number(event.effectPoints),chargedPoints=Number(event.chargedPoints),subject=typeof event.subject==="string"?event.subject:"";
  if(!Number.isSafeInteger(effectPoints)||effectPoints<=0||chargedPoints!==0||!subject)return;
  supportScore+=effectPoints;supportBySubject.set(subject,(supportBySubject.get(subject)||0)+effectPoints);
  const alias=aliasFor(subject);
  if(event.kind==="gift"){
    giftTotal+=effectPoints;
    const name=typeof event.giftName==="string"&&event.giftName?event.giftName:"ギフト";
    appendFeed("gift",alias,`🎁 ${name}（${formatPoint(effectPoints)}pt演出）`);
    showEffect("gift",`🎁 ${name}\n${formatPoint(effectPoints)}pt`);
  }else if(event.kind==="superchat"){
    superchatTotal+=effectPoints;
    const message=typeof event.message==="string"?event.message:"";
    appendFeed("superchat",alias,`💬 ${formatPoint(effectPoints)}pt　${message}`);
    showEffect("superchat",`💬 ${formatPoint(effectPoints)}pt スパチャ\n${message}`);
  }
  renderSupportTotals();renderRanking();
}
function renderCatalog(){
  if(giftOptions instanceof HTMLElement){giftOptions.replaceChildren();
    supportGiftCatalog.forEach(gift=>{const button=document.createElement("button");button.type="button";button.className="watch-support-option";
      button.textContent=`${gift.name}　${formatPoint(gift.points)}pt`;
      button.addEventListener("click",()=>{sendSupport({type:"gift",requestId:requestId(),giftId:gift.id});closePanel(giftPanel);});
      giftOptions.append(button);
    });
    if(!supportGiftCatalog.length)giftOptions.textContent="利用できるギフトがありません。";
  }
  if(superchatOptions instanceof HTMLElement){superchatOptions.replaceChildren();
    if(!selectedSuperchatAmount&&supportSuperchatAmounts.length)selectedSuperchatAmount=supportSuperchatAmounts[0];
    supportSuperchatAmounts.forEach(amount=>{const button=document.createElement("button");button.type="button";button.className="watch-support-option"+(amount===selectedSuperchatAmount?" is-selected":"");
      button.textContent=formatPoint(amount)+"pt";button.addEventListener("click",()=>{selectedSuperchatAmount=amount;renderCatalog();});superchatOptions.append(button);
    });
    if(!supportSuperchatAmounts.length)superchatOptions.textContent="利用できる金額がありません。";
  }
}
function sendSupport(payload){
  if(!supportAuthenticated||!supportCanPublish||!supportSocket||supportSocket.readyState!==WebSocket.OPEN){setStatus("応援機能へ接続しています");return;}
  supportSocket.send(JSON.stringify(payload));
}

function reconnectDelay(attempt){return Math.min(MAX_RECONNECT_MS,250*(2**Math.min(attempt,3)));}
function connectComments(grant){
  if(pageStopping||!grant?.commentsWebSocketUrl||grant.expiresAt<=Date.now())return;
  if(commentsSocket&&(commentsSocket.readyState===WebSocket.OPEN||commentsSocket.readyState===WebSocket.CONNECTING))return;
  const socket=new WebSocket(grant.commentsWebSocketUrl,COMMENT_PROTOCOL);commentsSocket=socket;commentsAuthenticated=false;
  socket.addEventListener("open",()=>{if(socket===commentsSocket)socket.send(JSON.stringify({type:"auth",streamId:grant.streamId,capability:grant.capability,lastSequence:commentSequence}));});
  socket.addEventListener("message",event=>{
    if(socket!==commentsSocket||typeof event.data!=="string"||event.data.length>64000)return;
    let data;try{data=JSON.parse(event.data);}catch{return;}if(!data||typeof data!=="object")return;
    if(data.type==="auth_ok"){commentsAuthenticated=true;commentsCanSend=data.canComment===true;commentsCanLike=data.canLike===true;commentsReconnectAttempt=0;if(Number.isSafeInteger(data.likeCount))likeCounts.forEach(node=>node.textContent=String(data.likeCount));return;}
    if(data.type==="comment"){const m=data.message;if(!m||typeof m!=="object")return;const seq=Number(m.sequence);if(!Number.isSafeInteger(seq)||seq<=commentSequence)return;commentSequence=seq;appendFeed("comment",String(m.displayName||"リスナー").slice(0,80),String(m.text||"").slice(0,200));return;}
    if(data.type==="like_total"&&Number.isSafeInteger(data.count))likeCounts.forEach(node=>node.textContent=String(data.count));
  });
  socket.addEventListener("close",event=>{if(socket!==commentsSocket)return;commentsSocket=null;commentsAuthenticated=false;if(!pageStopping&&event.code!==1008&&grant.expiresAt>Date.now()){const delay=reconnectDelay(commentsReconnectAttempt++);commentsReconnectTimer=setTimeout(()=>{commentsReconnectTimer=null;connectComments(grant);},delay);}});
}
function connectSupport(grant){
  if(pageStopping||!grant?.supportWebSocketUrl||grant.expiresAt<=Date.now())return;
  if(supportSocket&&(supportSocket.readyState===WebSocket.OPEN||supportSocket.readyState===WebSocket.CONNECTING))return;
  const socket=new WebSocket(grant.supportWebSocketUrl,SUPPORT_PROTOCOL);supportSocket=socket;supportAuthenticated=false;
  socket.addEventListener("open",()=>{if(socket===supportSocket)socket.send(JSON.stringify({type:"auth",streamId:grant.streamId,capability:grant.capability,after:supportSequence}));});
  socket.addEventListener("message",event=>{
    if(socket!==supportSocket||typeof event.data!=="string"||event.data.length>64000)return;
    let data;try{data=JSON.parse(event.data);}catch{return;}if(!data||typeof data!=="object")return;
    if(data.type==="support_ready"){
      supportAuthenticated=true;supportCanPublish=data.canPublish===true&&data.settlementMode==="test_zero_charge";supportReconnectAttempt=0;
      supportGiftCatalog=Array.isArray(data.gifts)?data.gifts.filter(x=>x&&typeof x==="object"&&typeof x.id==="string"&&typeof x.name==="string"&&Number.isSafeInteger(x.points)&&x.points>0):[];
      supportSuperchatAmounts=Array.isArray(data.superchatAmounts)?data.superchatAmounts.map(Number).filter(x=>Number.isSafeInteger(x)&&x>0):[];
      renderCatalog();return;
    }
    if(data.type==="support_event"){applySupportEvent(data.event);return;}
    if(data.type==="receipt"&&data.ok!==true){setStatus("応援送信エラー: "+String(data.error||"SUPPORT_FAILED"));}
  });
  socket.addEventListener("close",event=>{if(socket!==supportSocket)return;supportSocket=null;supportAuthenticated=false;if(!pageStopping&&event.code!==1008&&grant.expiresAt>Date.now()){const delay=reconnectDelay(supportReconnectAttempt++);supportReconnectTimer=setTimeout(()=>{supportReconnectTimer=null;connectSupport(grant);},delay);}});
}

function closeRealtime(){
  if(commentsReconnectTimer!==null){clearTimeout(commentsReconnectTimer);commentsReconnectTimer=null}
  if(supportReconnectTimer!==null){clearTimeout(supportReconnectTimer);supportReconnectTimer=null}
  if(commentsSocket&&commentsSocket.readyState<WebSocket.CLOSING)try{commentsSocket.close(1000,"viewer closed")}catch{}
  if(supportSocket&&supportSocket.readyState<WebSocket.CLOSING)try{supportSocket.close(1000,"viewer closed")}catch{}
  commentsSocket=null;supportSocket=null;commentsAuthenticated=false;supportAuthenticated=false;
}
async function stopMedia(){if(mediaClient){try{await mediaClient.stop()}catch{}mediaClient=null}audioEnabled=false;if(audioButton){audioButton.textContent="🔊";audioButton.setAttribute("aria-label","音声をオンにする")}}
async function stopDemo(keepalive=false){if(!demoPublisher)return;const current=demoPublisher;demoPublisher=null;try{await current.stop(keepalive)}catch{}}
async function stopRoom(){if(!roomController)return;const current=roomController;roomController=null;try{await current.stop()}catch{}}
function clearSessionTimers(){for(const id of [warningTimer,endTimer,clockTimer])if(id!==null)clearTimeout(id);warningTimer=endTimer=clockTimer=null;}
function scheduleSession(grant){
  clearSessionTimers();currentGrant=grant;
  const assumedStart=grant.expiresAt-TEST_WINDOW_MS;
  const tick=()=>{const elapsed=Math.max(0,Math.min(TEST_WINDOW_MS,Date.now()-assumedStart));if(clock)clock.textContent=`${String(Math.floor(elapsed/60000)).padStart(2,"0")}:${String(Math.floor(elapsed/1000)%60).padStart(2,"0")}`;if(!pageStopping&&Date.now()<grant.expiresAt)clockTimer=setTimeout(tick,1000);};tick();
  const warningDelay=Math.max(0,grant.expiresAt-WARNING_BEFORE_END_MS-Date.now());
  warningTimer=setTimeout(()=>{setStatus("そろそろ終了します");},warningDelay);
  endTimer=setTimeout(()=>{void finishNatural();},Math.max(0,grant.expiresAt-Date.now()));
}
async function finishNatural(){
  if(pageStopping)return;pageStopping=true;clearSessionTimers();closeRealtime();await stopMedia();await stopDemo();await stopRoom();location.replace("./index.html");
}
async function earlyFailure(message){
  if(pageStopping)return;clearSessionTimers();closeRealtime();await stopMedia();await stopDemo();await stopRoom();setStatus(message);showWaiting(message+"。再読み込みで新しいテスト枠を開始できます。");
}

function startGrant(grant,controller=null,demoGrant=null){
  if(!compatibility.supported||!grant||!(mediaCanvas instanceof HTMLCanvasElement)){setStatus("視聴準備エラー");return}
  roomController=controller||roomController;scheduleSession(grant);connectComments(grant);connectSupport(grant);qa("[data-listener-count]").forEach(node=>node.textContent="1");
  try{
    mediaClient=new WatchMediaClient(grant,mediaCanvas,status);
    mediaClient.onEnded(()=>{const expected=Date.now()>=grant.expiresAt-5000;if(expected)void finishNatural();else void earlyFailure("配信が予期せず終了しました");});
    mediaClient.start();setStatus("映像接続中");
    if(demoGrant&&demoCanvas instanceof HTMLCanvasElement){
      demoPublisher=new WatchDemoPublisher(demoGrant,demoCanvas);
      void demoPublisher.start().catch(error=>{void earlyFailure("立ち絵配信を開始できません: "+(error instanceof Error?error.message:"WATCH_DEMO_FAILED"));});
    }else showWaiting("配信映像を待っています…");
  }catch{void earlyFailure("視聴開始エラー")}
}

document.addEventListener("orikuro:service-ready",event=>{const d=event?.detail&&typeof event.detail==="object"?event.detail:{};if(d.roomPending===true){setStatus("配信ルーム接続中");showWaiting("背景と立ち絵を準備しています…");return}if(d.watchGrant)startGrant(d.watchGrant)},{once:true});
document.addEventListener("orikuro:watch-room-ready",event=>{const d=event?.detail&&typeof event.detail==="object"?event.detail:{};startGrant(d.watchGrant,d.roomController,d.demoPublisher)});
document.addEventListener("orikuro:watch-room-failed",()=>{setStatus("ルーム接続エラー");showWaiting("視聴ルームへ接続できませんでした")});
window.addEventListener("orikuro:demo-preview-ready",()=>{hideWaiting();setStatus("配信開始中");if(demoCanvas instanceof HTMLCanvasElement)demoCanvas.hidden=false});
window.addEventListener("orikuro:media-first-frame",()=>{hideWaiting();if(mediaCanvas instanceof HTMLCanvasElement)mediaCanvas.hidden=false;if(demoCanvas instanceof HTMLCanvasElement)demoCanvas.hidden=true;setStatus("視聴中")});
window.addEventListener("orikuro:transport-reconnecting",()=>{setStatus("再接続中");if(mediaCanvas instanceof HTMLCanvasElement)mediaCanvas.hidden=true;if(demoCanvas instanceof HTMLCanvasElement)demoCanvas.hidden=false});
window.addEventListener("orikuro:demo-publisher-failed",event=>{const code=event?.detail?.code||"DEMO_PUBLISHER_FAILED";setStatus("配信経路エラー: "+code)});

q("[data-comment-form]")?.addEventListener("submit",event=>{event.preventDefault();const message=commentInput?.value.trim()||"";if(!message)return;if(!commentsAuthenticated||!commentsCanSend||!commentsSocket||commentsSocket.readyState!==WebSocket.OPEN){setStatus("コメントへ接続しています");return}commentsSocket.send(JSON.stringify({type:"comment",text:message}));commentInput.value=""});
function burstLike(clientX=null,clientY=null){
  const layer=q("[data-like-burst-layer]");
  if(!(layer instanceof HTMLElement))return;
  const rect=layer.getBoundingClientRect();
  const heart=document.createElement("span");
  heart.className="watch-like-burst";
  heart.textContent="♥";
  const x=clientX===null?rect.width*.72:Math.max(24,Math.min(rect.width-24,clientX-rect.left));
  const y=clientY===null?rect.height*.62:Math.max(60,Math.min(rect.height-80,clientY-rect.top));
  heart.style.left=x+"px";heart.style.top=y+"px";
  layer.append(heart);
  setTimeout(()=>heart.remove(),760);
}
function sendLike(source=null,clientX=null,clientY=null){
  if(!commentsAuthenticated||!commentsCanLike||!commentsSocket||commentsSocket.readyState!==WebSocket.OPEN){setStatus("いいねへ接続しています");return}
  commentsSocket.send(JSON.stringify({type:"like",count:1}));
  if(source instanceof HTMLElement){source.classList.remove("is-pressed");void source.offsetWidth;source.classList.add("is-pressed")}
  burstLike(clientX,clientY);
}
q("[data-like-button]")?.addEventListener("click",event=>sendLike(event.currentTarget));
let lastSurfaceTap=0;
q("[data-like-surface]")?.addEventListener("pointerup",event=>{
  if(event.target instanceof Element&&event.target.closest("button,input,textarea,form,a,aside,nav,.watch-comment-form,.watch-live-comments"))return;
  const now=performance.now();
  if(now-lastSurfaceTap<330){lastSurfaceTap=0;sendLike(null,event.clientX,event.clientY);return}
  lastSurfaceTap=now;
});
audioButton?.addEventListener("click",async()=>{if(!mediaClient){setStatus("音声を接続しています");return}try{if(audioEnabled){await mediaClient.disableAudio();audioEnabled=false;audioButton.textContent="🔊";audioButton.setAttribute("aria-label","音声をオンにする")}else{await mediaClient.enableAudio();audioEnabled=true;audioButton.textContent="🔈";audioButton.setAttribute("aria-label","音声をオフにする")}}catch{setStatus("音声再生エラー")}});

q("[data-live-support-toggle]")?.addEventListener("click",()=>openPanel(supportPanel));
q("[data-live-support-close]")?.addEventListener("click",()=>closePanel(supportPanel));
q("[data-live-event-toggle]")?.addEventListener("click",()=>openPanel(rankingPanel));
q("[data-live-ranking-close]")?.addEventListener("click",()=>closePanel(rankingPanel));
q("[data-live-listeners-toggle]")?.addEventListener("click",()=>openPanel(listenerPanel));
q("[data-live-listeners-close]")?.addEventListener("click",()=>closePanel(listenerPanel));
q("[data-gift-button]")?.addEventListener("click",()=>{if(!supportAuthenticated){setStatus("ギフトへ接続しています");return}openPanel(giftPanel)});
q("[data-gift-close]")?.addEventListener("click",()=>closePanel(giftPanel));
q("[data-superchat-button]")?.addEventListener("click",()=>{if(!supportAuthenticated){setStatus("スパチャへ接続しています");return}openPanel(superchatPanel)});
q("[data-superchat-close]")?.addEventListener("click",()=>closePanel(superchatPanel));
q("[data-superchat-form]")?.addEventListener("submit",event=>{event.preventDefault();const message=superchatMessage?.value.trim()||"";if(!message||!selectedSuperchatAmount)return;sendSupport({type:"superchat",requestId:requestId(),amountPoints:selectedSuperchatAmount,message});superchatMessage.value="";closePanel(superchatPanel)});

window.addEventListener("pagehide",()=>{pageStopping=true;clearSessionTimers();closeRealtime();void stopMedia();void stopDemo(true);void stopRoom()},{once:true});
