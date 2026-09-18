const FLOW_URL='https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow';
const FLOW_KEY='oc_service_flow_token_v1';
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
const STREAM_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
const CAP_RE=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TARGET_WIDTH=640;
const TARGET_HEIGHT=360;
const TARGET_FPS=5;
const FRAME_INTERVAL_MS=Math.round(1000/TARGET_FPS);
const MAX_FRAME_BYTES=1024*1024;
const MAX_WS_BUFFER=2*1024*1024;

const $=(s)=>document.querySelector(s);
const statusEl=$('[data-stream-status]');
const gateEl=$('[data-service-gate-status]');
const contentEl=$('[data-service-content]');
const videoEl=$('[data-stream-preview]');
const startButton=$('[data-stream-start]');
const stopButton=$('[data-stream-stop]');
const streamIdEl=$('[data-stream-id]');
const sentEl=$('[data-stream-sent]');
const ackEl=$('[data-stream-ack]');
const detailEl=$('[data-stream-detail]');

let grant=null;
let mediaStream=null;
let ws=null;
let timer=null;
let canvas=null;
let ctx=null;
let sequence=1;
let sent=0;
let acked=0;
let sending=false;
let startedAt=0;
let stopped=false;
let backpressureUntil=0;

function setStatus(message,kind=''){
  if(statusEl){statusEl.textContent=message;statusEl.dataset.kind=kind;}
}
function setDetail(message){if(detailEl)detailEl.textContent=message;}
function updateCounters(){
  if(sentEl)sentEl.textContent=String(sent);
  if(ackEl)ackEl.textContent=String(acked);
}
function currentPath(){
  const file=location.pathname.split('/').filter(Boolean).at(-1)||'stream-test.html';
  return './'+file;
}
function clearFlowToken(){sessionStorage.removeItem(FLOW_KEY);}
async function checkFlow(){
  const token=sessionStorage.getItem(FLOW_KEY)||'';
  if(!TOKEN_RE.test(token))throw new Error('FLOW_MISSING');
  const response=await fetch(FLOW_URL,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'touch',token}),
    credentials:'omit',
    cache:'no-store',
    referrerPolicy:'no-referrer',
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw new Error(typeof data.code==='string'?data.code:'FLOW_FAILED');
  if(data.status!=='delivery_ready')throw new Error('FLOW_NOT_READY');
}
function validGrant(value){
  if(!value||typeof value!=='object')return false;
  const g=value.realtimeGrant;
  if(!g||typeof g!=='object')return false;
  return STREAM_ID_RE.test(String(value.streamId||'')) &&
    CAP_RE.test(String(g.publisherCapability||'')) &&
    CAP_RE.test(String(g.controlCapability||'')) &&
    typeof g.cloudflareWebSocketUrl==='string' &&
    g.cloudflareWebSocketUrl.startsWith('wss://orikuro-streaming.') &&
    Number.isFinite(Number(g.expiresAt));
}
async function consumeGrant(){
  const token=sessionStorage.getItem(FLOW_KEY)||'';
  if(!TOKEN_RE.test(token))throw new Error('FLOW_MISSING');
  const response=await fetch(FLOW_URL,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'consume',token,path:currentPath()}),
    credentials:'omit',
    cache:'no-store',
    referrerPolicy:'no-referrer',
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true)throw new Error(typeof data.code==='string'?data.code:'FLOW_FAILED');
  if(!validGrant(data))throw new Error('STREAM_GRANT_INVALID');
  clearFlowToken();
  return data;
}
function buildPacket(kind,payload,keyframe=false){
  const pts=Math.max(0,Math.floor(performance.now()-startedAt));
  const buffer=new ArrayBuffer(44+payload.byteLength);
  const view=new DataView(buffer);
  view.setUint32(0,0x4f52494b,false);
  view.setUint8(4,1);
  view.setUint8(5,kind);
  view.setUint16(6,keyframe?1:0,false);
  view.setUint32(8,sequence++,false);
  view.setUint16(12,0,false);
  view.setUint16(14,0,false);
  view.setUint32(16,1,false);
  view.setUint32(20,1000,false);
  view.setBigInt64(24,BigInt(pts),false);
  view.setBigInt64(32,BigInt(pts),false);
  view.setUint32(40,payload.byteLength,false);
  new Uint8Array(buffer,44).set(payload);
  return buffer;
}
async function frameBytes(){
  if(!videoEl||!ctx||!canvas)return null;
  ctx.drawImage(videoEl,0,0,TARGET_WIDTH,TARGET_HEIGHT);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.72));
  if(!blob||blob.size<1||blob.size>MAX_FRAME_BYTES)return null;
  return new Uint8Array(await blob.arrayBuffer());
}
async function sendFrame(){
  if(sending||!ws||ws.readyState!==WebSocket.OPEN||Date.now()<backpressureUntil)return;
  if(ws.bufferedAmount>MAX_WS_BUFFER){setStatus('送信待機中です。','warning');return;}
  sending=true;
  try{
    const payload=await frameBytes();
    if(!payload)return;
    ws.send(buildPacket(1,payload,true));
    sent+=1;
    updateCounters();
  }catch{
    setStatus('映像フレームの送信に失敗しました。','error');
  }finally{
    sending=false;
  }
}
function waitOpen(socket){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('WEBSOCKET_TIMEOUT')),10000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('WEBSOCKET_ERROR'));},{once:true});
  });
}
function handleControl(raw){
  let data;
  try{data=JSON.parse(raw);}catch{return;}
  if(data?.type==='ack'){
    if(Number.isInteger(data.sequence))acked=Math.max(acked,data.sequence);
    updateCounters();
    setStatus('配信中です。','live');
    return;
  }
  if(data?.type==='backpressure'){
    backpressureUntil=Date.now()+1000;
    setStatus('送信先が混雑しています。自動で待機します。','warning');
    return;
  }
  if(data?.type==='session_warning'){
    setStatus(typeof data.message==='string'?data.message:'そろそろ終了します。','warning');
    return;
  }
  if(data?.type==='downstream_unavailable'||data?.type==='downstream_disconnected'||data?.type==='fatal'){
    setStatus('送信先との接続が切れました。','error');
    void stopStreaming(false);
    return;
  }
  if(data?.type==='session_ended'){
    setStatus('配信テストを終了しました。','');
    void stopStreaming(false).finally(()=>{
      if(data.homeRedirect===true)setTimeout(()=>location.replace('./index.html'),900);
    });
  }
}
async function requestMedia(){
  if(mediaStream)return;
  mediaStream=await navigator.mediaDevices.getUserMedia({
    video:{width:{ideal:TARGET_WIDTH},height:{ideal:TARGET_HEIGHT},frameRate:{ideal:TARGET_FPS,max:10}},
    audio:false,
  });
  videoEl.srcObject=mediaStream;
  await videoEl.play();
}
async function startStreaming(){
  if(stopped===false&&ws?.readyState===WebSocket.OPEN)return;
  startButton.disabled=true;
  setStatus('カメラを準備しています。');
  try{
    await requestMedia();
    if(!grant){
      setStatus('配信権限と送信経路を確定しています。');
      grant=await consumeGrant();
      if(streamIdEl)streamIdEl.textContent=grant.streamId;
    }
    if(Date.now()>Number(grant.realtimeGrant.expiresAt)-15000)throw new Error('STREAM_GRANT_EXPIRED');
    canvas=document.createElement('canvas');
    canvas.width=TARGET_WIDTH;
    canvas.height=TARGET_HEIGHT;
    ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
    if(!ctx)throw new Error('CANVAS_UNAVAILABLE');
    const g=grant.realtimeGrant;
    ws=new WebSocket(g.cloudflareWebSocketUrl,['orikuro-stream-v1',`bearer.${g.publisherCapability}`]);
    ws.binaryType='arraybuffer';
    ws.addEventListener('message',event=>{if(typeof event.data==='string')handleControl(event.data);});
    ws.addEventListener('close',()=>{if(!stopped)setStatus('WebSocket接続が終了しました。','warning');});
    await waitOpen(ws);
    stopped=false;
    startedAt=performance.now();
    sequence=1;sent=0;acked=0;updateCounters();
    const config=new TextEncoder().encode(JSON.stringify({codec:'jpeg-test-v1',width:TARGET_WIDTH,height:TARGET_HEIGHT,fps:TARGET_FPS}));
    ws.send(buildPacket(2,config,false));
    sent+=1;updateCounters();
    timer=setInterval(()=>{void sendFrame();},FRAME_INTERVAL_MS);
    stopButton.disabled=false;
    setStatus('配信中です。','live');
    setDetail('カメラ映像を5fpsの検証用JPEGパケットとして Cloudflare → Northflank へ送信しています。');
  }catch(error){
    setStatus(error?.name==='NotAllowedError'?'カメラの利用が許可されませんでした。':'配信開始に失敗しました。','error');
    startButton.disabled=false;
    stopTracks();
    if(ws){try{ws.close();}catch{}ws=null;}
  }
}
function stopTracks(){
  if(mediaStream){for(const track of mediaStream.getTracks())track.stop();mediaStream=null;}
  if(videoEl)videoEl.srcObject=null;
}
async function requestServerStop(){
  if(!grant)return;
  const g=grant.realtimeGrant;
  try{
    await fetch(FLOW_URL,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'stream_stop',streamId:grant.streamId,controlCapability:g.controlCapability}),
      credentials:'omit',
      cache:'no-store',
      referrerPolicy:'no-referrer',
    });
  }catch{}
}
async function stopStreaming(notifyServer=true){
  if(stopped)return;
  stopped=true;
  if(timer){clearInterval(timer);timer=null;}
  if(ws){try{ws.close(1000,'publisher stop');}catch{}ws=null;}
  stopTracks();
  stopButton.disabled=true;
  if(notifyServer)await requestServerStop();
  setStatus('配信を停止しました。','');
  setDetail('再開するには配信テストを最初から開始してください。');
}
async function initialize(){
  setStatus('配信利用状態を確認しています。');
  try{
    await checkFlow();
    if(gateEl)gateEl.textContent='';
    if(contentEl)contentEl.hidden=false;
    if(streamIdEl)streamIdEl.textContent='開始時に発行';
    startButton.disabled=false;
    setStatus('配信開始の準備ができました。');
    setDetail('配信開始を押すまでは Cloudflare / Northflank の配信セッションを起動しません。現在は映像送信経路の実地テストです。音声送出はまだ接続しません。');
  }catch(error){
    clearFlowToken();
    if(gateEl)gateEl.textContent=error?.message==='FLOW_MISSING'?'このサービスを直接開くことはできません。':'配信準備を完了できませんでした。';
    setTimeout(()=>location.replace('./index.html'),1400);
  }
}

startButton?.addEventListener('click',()=>{void startStreaming();});
stopButton?.addEventListener('click',()=>{void stopStreaming(true);});
window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer);stopTracks();if(ws){try{ws.close();}catch{}}},{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void initialize();},{once:true});else void initialize();
