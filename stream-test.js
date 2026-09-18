const FLOW_URL='https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow';
const FLOW_KEY='oc_service_flow_token_v1';
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
const STREAM_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
const CAP_RE=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TARGET_WIDTH=640;
const TARGET_HEIGHT=360;
const TARGET_FPS=5;
const FRAME_INTERVAL_MS=Math.round(1000/TARGET_FPS);
const AUDIO_FRAMES=1024;
const MAX_FRAME_BYTES=1024*1024;
const MAX_WS_BUFFER=2*1024*1024;
const MAX_AUDIO_WS_BUFFER=512*1024;

const $=(s)=>document.querySelector(s);
const statusEl=$('[data-stream-status]');
const gateEl=$('[data-service-gate-status]');
const contentEl=$('[data-service-content]');
const videoEl=$('[data-stream-preview]');
const startButton=$('[data-stream-start]');
const stopButton=$('[data-stream-stop]');
const streamIdEl=$('[data-stream-id]');
const videoSentEl=$('[data-video-sent]');
const videoAckEl=$('[data-video-ack]');
const audioSentEl=$('[data-audio-sent]');
const audioAckEl=$('[data-audio-ack]');
const detailEl=$('[data-stream-detail]');

let grant=null;
let mediaStream=null;
let videoWs=null;
let audioWs=null;
let timer=null;
let canvas=null;
let ctx=null;
let videoSequence=1;
let audioSequence=1;
let videoSent=0;
let videoAcked=0;
let audioSent=0;
let audioAcked=0;
let sending=false;
let startedAt=0;
let stopped=true;
let backpressureUntil=0;
let audioContext=null;
let audioSource=null;
let audioNode=null;
let audioClockOriginMs=0;

function setStatus(message,kind=''){
  if(statusEl){statusEl.textContent=message;statusEl.dataset.kind=kind;}
}
function setDetail(message){if(detailEl)detailEl.textContent=message;}
function updateCounters(){
  if(videoSentEl)videoSentEl.textContent=String(videoSent);
  if(videoAckEl)videoAckEl.textContent=String(videoAcked);
  if(audioSentEl)audioSentEl.textContent=String(audioSent);
  if(audioAckEl)audioAckEl.textContent=String(audioAcked);
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
  if(!g||typeof g!=='object'||!STREAM_ID_RE.test(String(value.streamId||'')))return false;
  if(!CAP_RE.test(String(g.publisherCapability||''))||!CAP_RE.test(String(g.controlCapability||'')))return false;
  if(typeof g.cloudflareWebSocketUrl!=='string'||!g.cloudflareWebSocketUrl.startsWith('wss://orikuro-streaming.'))return false;
  if(typeof g.audioWebSocketUrl!=='string')return false;
  try{
    const u=new URL(g.audioWebSocketUrl);
    if(u.protocol!=='wss:'||!u.hostname.endsWith('.code.run')||u.pathname!=='/realtime/audio'||u.searchParams.get('stream_id')!==value.streamId)return false;
  }catch{return false;}
  return Number.isFinite(Number(g.expiresAt));
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
function buildVideoPacket(kind,payload,keyframe=false){
  const pts=Math.max(0,Math.floor(performance.now()-startedAt));
  const buffer=new ArrayBuffer(44+payload.byteLength);
  const view=new DataView(buffer);
  view.setUint32(0,0x4f52494b,false);
  view.setUint8(4,1);
  view.setUint8(5,kind);
  view.setUint16(6,keyframe?1:0,false);
  view.setUint32(8,videoSequence++,false);
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
function buildAudioPacket(planes,sampleRate,timestampSeconds){
  if(!Array.isArray(planes)||planes.length<1||planes.length>8)throw new Error('AUDIO_CHANNELS_INVALID');
  if(!planes.every((p)=>p instanceof Float32Array&&p.length===AUDIO_FRAMES))throw new Error('AUDIO_BLOCK_INVALID');
  const channels=planes.length;
  const payloadBytes=channels*AUDIO_FRAMES*4;
  const buffer=new ArrayBuffer(32+payloadBytes);
  const view=new DataView(buffer);
  const timestampMs=audioClockOriginMs+Number(timestampSeconds)*1000-startedAt;
  const timestampNs=BigInt(Math.max(0,Math.round(timestampMs*1_000_000)));
  view.setUint32(0,0x4f434155,false);
  view.setUint8(4,1);
  view.setUint8(5,channels);
  view.setUint8(6,1);
  view.setUint8(7,0);
  view.setUint32(8,Number(sampleRate),false);
  view.setUint16(12,AUDIO_FRAMES,false);
  view.setUint16(14,0,false);
  view.setUint32(16,audioSequence++,false);
  view.setBigInt64(20,timestampNs,false);
  view.setUint32(28,payloadBytes,false);
  let offset=32;
  for(const plane of planes){
    for(let i=0;i<plane.length;i++){
      view.setFloat32(offset,Number.isFinite(plane[i])?plane[i]:0,true);
      offset+=4;
    }
  }
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
  if(sending||!videoWs||videoWs.readyState!==WebSocket.OPEN||Date.now()<backpressureUntil)return;
  if(videoWs.bufferedAmount>MAX_WS_BUFFER){setStatus('映像送信を一時待機しています。','warning');return;}
  sending=true;
  try{
    const payload=await frameBytes();
    if(!payload)return;
    videoWs.send(buildVideoPacket(1,payload,true));
    videoSent+=1;
    updateCounters();
  }catch{
    setStatus('映像フレームの送信に失敗しました。','error');
  }finally{
    sending=false;
  }
}
function waitOpen(socket){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('WEBSOCKET_TIMEOUT')),10000);
    socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('WEBSOCKET_ERROR'));},{once:true});
  });
}
function handleVideoControl(raw){
  let data;
  try{data=JSON.parse(raw);}catch{return;}
  if(data?.type==='ack'){
    if(Number.isInteger(data.sequence))videoAcked=Math.max(videoAcked,data.sequence);
    updateCounters();
    setStatus('映像・音声を送信中です。','live');
    return;
  }
  if(data?.type==='backpressure'){
    backpressureUntil=Date.now()+1000;
    setStatus('映像送信先が混雑しています。自動で待機します。','warning');
    return;
  }
  if(data?.type==='session_warning'){
    setStatus(typeof data.message==='string'?data.message:'そろそろ終了します。','warning');
    return;
  }
  if(data?.type==='downstream_unavailable'||data?.type==='downstream_disconnected'||data?.type==='fatal'){
    setStatus('映像送信先との接続が切れました。','error');
    void stopStreaming(true);
    return;
  }
  if(data?.type==='session_ended'){
    setStatus('配信テストを終了しました。','');
    void stopStreaming(false).finally(()=>{
      if(data.homeRedirect===true)setTimeout(()=>location.replace('./index.html'),900);
    });
  }
}
function handleAudioControl(raw){
  let data;
  try{data=JSON.parse(raw);}catch{return;}
  if(data?.type==='audio_ack'){
    if(Number.isInteger(data.sequence))audioAcked=Math.max(audioAcked,data.sequence);
    updateCounters();
    return;
  }
  if(data?.type==='audio_error'){
    setStatus('音声入力経路でエラーが発生しました。','error');
    setDetail(typeof data.code==='string'?data.code:'AUDIO_INGRESS_ERROR');
    void stopStreaming(true);
  }
}
async function prepareAudioContext(){
  if(audioContext)return;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
  audioContext=new Ctx({sampleRate:48000,latencyHint:'interactive'});
  await audioContext.resume();
}
async function requestMedia(){
  if(mediaStream)return;
  mediaStream=await navigator.mediaDevices.getUserMedia({
    video:{width:{ideal:TARGET_WIDTH},height:{ideal:TARGET_HEIGHT},frameRate:{ideal:TARGET_FPS,max:10}},
    audio:{channelCount:{ideal:1},sampleRate:{ideal:48000},echoCancellation:false,noiseSuppression:false,autoGainControl:false},
  });
  videoEl.srcObject=mediaStream;
  await videoEl.play();
}
async function startAudioCapture(){
  if(!audioContext||!mediaStream||!audioWs)throw new Error('AUDIO_CAPTURE_NOT_READY');
  await audioContext.audioWorklet.addModule('./stream-audio-worklet.js?v=20260918-1');
  audioClockOriginMs=performance.now()-audioContext.currentTime*1000;
  audioSource=audioContext.createMediaStreamSource(mediaStream);
  const channels=Math.max(1,Math.min(8,Number(mediaStream.getAudioTracks()[0]?.getSettings?.().channelCount)||1));
  audioNode=new AudioWorkletNode(audioContext,'orikuro-audio-capture',{
    numberOfInputs:1,
    numberOfOutputs:0,
    channelCount:channels,
    channelCountMode:'explicit',
    channelInterpretation:'speakers',
  });
  audioNode.port.onmessage=(event)=>{
    const data=event.data;
    if(stopped||data?.type!=='audio_block'||!audioWs||audioWs.readyState!==WebSocket.OPEN)return;
    if(audioWs.bufferedAmount>MAX_AUDIO_WS_BUFFER){
      setStatus('音声送信先が混雑しています。配信を停止します。','error');
      void stopStreaming(true);
      return;
    }
    try{
      audioWs.send(buildAudioPacket(data.planes,Number(data.sampleRate),Number(data.timestampSeconds)));
      audioSent+=1;
      updateCounters();
    }catch{
      setStatus('音声ブロックの送信に失敗しました。','error');
      void stopStreaming(true);
    }
  };
  audioSource.connect(audioNode);
}
async function startStreaming(){
  if(!stopped)return;
  startButton.disabled=true;
  setStatus('カメラとマイクを準備しています。');
  try{
    await prepareAudioContext();
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
    videoWs=new WebSocket(g.cloudflareWebSocketUrl,['orikuro-stream-v1',`bearer.${g.publisherCapability}`]);
    videoWs.binaryType='arraybuffer';
    videoWs.addEventListener('message',event=>{if(typeof event.data==='string')handleVideoControl(event.data);});
    videoWs.addEventListener('close',()=>{if(!stopped)setStatus('映像WebSocket接続が終了しました。','warning');});

    audioWs=new WebSocket(g.audioWebSocketUrl,['orikuro-audio-v1',`bearer.${g.publisherCapability}`]);
    audioWs.binaryType='arraybuffer';
    audioWs.addEventListener('message',event=>{if(typeof event.data==='string')handleAudioControl(event.data);});
    audioWs.addEventListener('close',()=>{if(!stopped){setStatus('音声WebSocket接続が終了しました。','error');void stopStreaming(true);}});

    await Promise.all([waitOpen(videoWs),waitOpen(audioWs)]);
    stopped=false;
    startedAt=performance.now();
    videoSequence=1;
    audioSequence=1;
    videoSent=0;
    videoAcked=0;
    audioSent=0;
    audioAcked=0;
    updateCounters();

    await startAudioCapture();
    const config=new TextEncoder().encode(JSON.stringify({codec:'jpeg-test-v1',width:TARGET_WIDTH,height:TARGET_HEIGHT,fps:TARGET_FPS}));
    videoWs.send(buildVideoPacket(2,config,false));
    videoSent+=1;
    updateCounters();
    timer=setInterval(()=>{void sendFrame();},FRAME_INTERVAL_MS);
    stopButton.disabled=false;
    setStatus('映像・音声を送信中です。','live');
    setDetail('映像は Cloudflare → Northflank、音声はマイクから Northflank の1024-frame float32-planar入力へ送信しています。');
  }catch(error){
    const denied=error?.name==='NotAllowedError';
    setStatus(denied?'カメラまたはマイクの利用が許可されませんでした。':'配信開始に失敗しました。','error');
    setDetail(error instanceof Error?error.message:'STREAM_START_FAILED');
    startButton.disabled=false;
    await cleanupLocal();
    if(grant)await requestServerStop();
  }
}
function stopTracks(){
  if(mediaStream){for(const track of mediaStream.getTracks())track.stop();mediaStream=null;}
  if(videoEl)videoEl.srcObject=null;
}
async function cleanupLocal(){
  if(timer){clearInterval(timer);timer=null;}
  if(audioNode){try{audioNode.disconnect();}catch{}audioNode.port.onmessage=null;audioNode=null;}
  if(audioSource){try{audioSource.disconnect();}catch{}audioSource=null;}
  if(audioContext){try{await audioContext.close();}catch{}audioContext=null;}
  if(videoWs){try{videoWs.close(1000,'publisher stop');}catch{}videoWs=null;}
  if(audioWs){try{audioWs.close(1000,'publisher stop');}catch{}audioWs=null;}
  stopTracks();
}
async function requestServerStop(keepalive=false){
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
      keepalive,
    });
  }catch{}
}
async function stopStreaming(notifyServer=true){
  if(stopped)return;
  stopped=true;
  stopButton.disabled=true;
  await cleanupLocal();
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
    setDetail('配信開始を押すまでは Cloudflare / Northflank の配信セッションを起動しません。カメラとマイクの利用許可が必要です。');
  }catch(error){
    clearFlowToken();
    if(gateEl)gateEl.textContent=error?.message==='FLOW_MISSING'?'このサービスを直接開くことはできません。':'配信準備を完了できませんでした。';
    setTimeout(()=>location.replace('./index.html'),1400);
  }
}

startButton?.addEventListener('click',()=>{void startStreaming();});
stopButton?.addEventListener('click',()=>{void stopStreaming(true);});
window.addEventListener('pagehide',()=>{
  stopped=true;
  if(timer)clearInterval(timer);
  if(videoWs){try{videoWs.close();}catch{}}
  if(audioWs){try{audioWs.close();}catch{}}
  stopTracks();
  if(grant)void requestServerStop(true);
},{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void initialize();},{once:true});else void initialize();
