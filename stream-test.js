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
const MAX_WS_BUFFER=2*1024*1024;
const MAX_AUDIO_WS_BUFFER=512*1024;
const H264_CODEC='avc1.42001E';

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
let videoEncoder=null;
let h264ParameterSets=null;
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
function buildVideoPacket(kind,payload,keyframe=false,ptsUs=0,dtsUs=ptsUs){
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
  view.setUint32(20,1_000_000,false);
  view.setBigInt64(24,BigInt(Math.max(0,Math.round(ptsUs))),false);
  view.setBigInt64(32,BigInt(Math.max(0,Math.round(dtsUs))),false);
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
function annexBHasStartCode(bytes){
  for(let i=0;i+3<bytes.length;i++){
    if(bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1)return true;
    if(i+4<=bytes.length&&bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===0&&bytes[i+3]===1)return true;
  }
  return false;
}
function parseAvcC(description){
  if(!(description instanceof ArrayBuffer)&&!ArrayBuffer.isView(description))return null;
  const bytes=description instanceof ArrayBuffer?new Uint8Array(description):new Uint8Array(description.buffer,description.byteOffset,description.byteLength);
  if(bytes.length<7||bytes[0]!==1)return null;
  let offset=5;
  const spsCount=bytes[offset++]&31;
  const units=[];
  for(let i=0;i<spsCount;i++){
    if(offset+2>bytes.length)return null;
    const len=(bytes[offset]<<8)|bytes[offset+1];offset+=2;
    if(len<1||offset+len>bytes.length)return null;
    units.push(bytes.slice(offset,offset+len));offset+=len;
  }
  if(offset>=bytes.length)return null;
  const ppsCount=bytes[offset++];
  for(let i=0;i<ppsCount;i++){
    if(offset+2>bytes.length)return null;
    const len=(bytes[offset]<<8)|bytes[offset+1];offset+=2;
    if(len<1||offset+len>bytes.length)return null;
    units.push(bytes.slice(offset,offset+len));offset+=len;
  }
  if(units.length<2)return null;
  const total=units.reduce((n,u)=>n+4+u.byteLength,0);
  const out=new Uint8Array(total);
  let p=0;
  for(const unit of units){
    out.set([0,0,0,1],p);p+=4;out.set(unit,p);p+=unit.byteLength;
  }
  return out;
}
function prependParameterSets(payload){
  if(!h264ParameterSets)return payload;
  const out=new Uint8Array(h264ParameterSets.byteLength+payload.byteLength);
  out.set(h264ParameterSets,0);
  out.set(payload,h264ParameterSets.byteLength);
  return out;
}
async function videoConfig(){
  if(typeof VideoEncoder!=='function'||typeof VideoFrame!=='function')throw new Error('WEBCODECS_H264_UNAVAILABLE');
  const config={
    codec:H264_CODEC,
    width:TARGET_WIDTH,
    height:TARGET_HEIGHT,
    framerate:TARGET_FPS,
    latencyMode:'realtime',
    avc:{format:'annexb'},
  };
  const support=await VideoEncoder.isConfigSupported(config);
  if(!support?.supported)throw new Error('H264_ANNEXB_UNSUPPORTED');
  return support.config||config;
}
function createVideoEncoder(config){
  h264ParameterSets=null;
  videoEncoder=new VideoEncoder({
    output:(chunk,metadata)=>{
      if(stopped||!videoWs||videoWs.readyState!==WebSocket.OPEN)return;
      if(metadata?.decoderConfig?.description){
        const parsed=parseAvcC(metadata.decoderConfig.description);
        if(parsed)h264ParameterSets=parsed;
      }
      const payload=new Uint8Array(chunk.byteLength);
      chunk.copyTo(payload);
      if(!annexBHasStartCode(payload)){
        setStatus('H.264 Annex-B形式を取得できませんでした。','error');
        void stopStreaming(true);
        return;
      }
      const keyframe=chunk.type==='key';
      const wirePayload=keyframe?prependParameterSets(payload):payload;
      if(videoWs.bufferedAmount>MAX_WS_BUFFER){
        setStatus('映像送信先が混雑しています。配信を停止します。','error');
        void stopStreaming(true);
        return;
      }
      videoWs.send(buildVideoPacket(1,wirePayload,keyframe,chunk.timestamp,chunk.timestamp));
      videoSent+=1;
      updateCounters();
    },
    error:(error)=>{
      setStatus('H.264エンコーダでエラーが発生しました。','error');
      setDetail(error instanceof Error?error.message:'VIDEO_ENCODER_ERROR');
      void stopStreaming(true);
    },
  });
  videoEncoder.configure(config);
}
async function encodeFrame(){
  if(sending||stopped||!videoEncoder||videoEncoder.state!=='configured'||!ctx||!canvas||Date.now()<backpressureUntil)return;
  if(videoEncoder.encodeQueueSize>2)return;
  sending=true;
  try{
    ctx.drawImage(videoEl,0,0,TARGET_WIDTH,TARGET_HEIGHT);
    const timestampUs=Math.max(0,Math.round((performance.now()-startedAt)*1000));
    const frame=new VideoFrame(canvas,{timestamp:timestampUs});
    try{
      // Public-test path deliberately requests an IDR for every 5fps test frame.
      // This avoids inventing a production GOP policy while keeping replay deterministic.
      videoEncoder.encode(frame,{keyFrame:true});
    }finally{
      frame.close();
    }
  }catch(error){
    setStatus('映像フレームのH.264符号化に失敗しました。','error');
    setDetail(error instanceof Error?error.message:'VIDEO_ENCODE_FAILED');
    void stopStreaming(true);
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
    const encoderConfig=await videoConfig();
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

    createVideoEncoder(encoderConfig);
    await startAudioCapture();

    const configPayload=new TextEncoder().encode(JSON.stringify({codec:'h264-annexb',profile:H264_CODEC,width:TARGET_WIDTH,height:TARGET_HEIGHT,fps:TARGET_FPS,testAllKeyframes:true}));
    videoWs.send(buildVideoPacket(2,configPayload,false,0,0));
    videoSent+=1;
    updateCounters();
    timer=setInterval(()=>{void encodeFrame();},FRAME_INTERVAL_MS);
    await encodeFrame();
    stopButton.disabled=false;
    setStatus('映像・音声を送信中です。','live');
    setDetail('映像は H.264 Annex-B で Cloudflare → Northflank、音声は1024-frame float32-planarで Northflank へ送信しています。');
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
  if(videoEncoder){try{if(videoEncoder.state!=='closed')videoEncoder.close();}catch{}videoEncoder=null;}
  h264ParameterSets=null;
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
  if(videoEncoder){try{videoEncoder.close();}catch{}}
  if(videoWs){try{videoWs.close();}catch{}}
  if(audioWs){try{audioWs.close();}catch{}}
  stopTracks();
  if(grant)void requestServerStop(true);
},{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void initialize();},{once:true});else void initialize();
