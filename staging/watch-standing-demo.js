const START_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/system-stream-test";
const PREPARE_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-prepare";
const STANDING_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-preview";
const BACKGROUND_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-background-preview";
const PREVIEW_STOP_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-standing-preview-stop";
const LIVE_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system/stream-live";
const STOP_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/service-flow";

const ACCESS_RE=/^[a-f0-9]{64}$/;
const STREAM_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
const CAP_RE=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const MEDIA_MAGIC=0x4f52494b;
const MEDIA_VERSION=1;
const MEDIA_HEADER_BYTES=44;
const MEDIA_KIND_VIDEO=1;
const MEDIA_KIND_CONFIG=2;
const MEDIA_FLAG_KEYFRAME=1;
const VIDEO_SUBPROTOCOL="orikuro-stream-v1";
const WIDTH=640;
const HEIGHT=360;
const FPS=5;
const FRAME_MS=Math.round(1000/FPS);
const KEYFRAME_INTERVAL=FPS*2;
const CODEC="avc1.42001E";
const MAX_BUFFERED=2*1024*1024;

function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function randomIndex(max){
  if(max<=1)return 0;
  if(globalThis.crypto?.getRandomValues){
    const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%max;
  }
  return Math.floor(Math.random()*max);
}
async function postJson(url,body,{keepalive=false}={}){
  const r=await fetch(url,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body),
    credentials:"omit",
    cache:"no-store",
    referrerPolicy:"no-referrer",
    keepalive
  });
  const text=await r.text();
  let data={};try{data=text?JSON.parse(text):{};}catch{}
  if(!r.ok||data?.ok!==true){
    const code=typeof data?.code==="string"?data.code:`HTTP_${r.status}`;
    throw new Error(code);
  }
  return obj(data.result);
}
async function fetchImage(url,body){
  const r=await fetch(url,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body),
    credentials:"omit",
    cache:"no-store",
    referrerPolicy:"no-referrer"
  });
  const type=(r.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();
  if(!r.ok||!["image/png","image/jpeg","image/webp"].includes(type))throw new Error(`IMAGE_${r.status}`);
  const blob=await r.blob();
  if(blob.size<1||blob.size>12*1024*1024)throw new Error("IMAGE_SIZE_INVALID");
  const urlObject=URL.createObjectURL(blob);
  const image=new Image();
  image.decoding="async";
  image.src=urlObject;
  try{await image.decode();}catch{URL.revokeObjectURL(urlObject);throw new Error("IMAGE_DECODE_FAILED");}
  if(image.naturalWidth<1||image.naturalHeight<1){URL.revokeObjectURL(urlObject);throw new Error("IMAGE_DIMENSIONS_INVALID");}
  return{image,url:urlObject};
}
function validGrant(raw){
  const g=obj(raw);
  const streamId=typeof g.streamId==="string"?g.streamId:"";
  const publisher=typeof g.publisherCapability==="string"?g.publisherCapability:"";
  const control=typeof g.controlCapability==="string"?g.controlCapability:"";
  const monitor=typeof g.monitorCapability==="string"?g.monitorCapability:"";
  const cf=typeof g.cloudflareWebSocketUrl==="string"?g.cloudflareWebSocketUrl:"";
  const media=typeof g.mediaWebSocketUrl==="string"?g.mediaWebSocketUrl:"";
  const expiresAt=Number(g.expiresAt);
  if(!STREAM_ID_RE.test(streamId)||!CAP_RE.test(publisher)||!CAP_RE.test(control)||!CAP_RE.test(monitor)||!Number.isFinite(expiresAt)||expiresAt<=Date.now())throw new Error("DEMO_GRANT_INVALID");
  const cfUrl=new URL(cf),mediaUrl=new URL(media);
  if(cfUrl.protocol!=="wss:"||mediaUrl.protocol!=="wss:"||mediaUrl.pathname!=="/realtime/media")throw new Error("DEMO_GRANT_URL_INVALID");
  return{streamId,publisherCapability:publisher,controlCapability:control,monitorCapability:monitor,cloudflareWebSocketUrl:cf,mediaWebSocketUrl:media,expiresAt};
}
function waitOpen(socket){
  return new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error("WEBSOCKET_TIMEOUT")),10000);
    socket.addEventListener("open",()=>{clearTimeout(t);resolve();},{once:true});
    socket.addEventListener("error",()=>{clearTimeout(t);reject(new Error("WEBSOCKET_ERROR"));},{once:true});
  });
}
function buildPacket(sequence,kind,payload,keyframe,ptsUs){
  const b=new ArrayBuffer(MEDIA_HEADER_BYTES+payload.byteLength),v=new DataView(b);
  v.setUint32(0,MEDIA_MAGIC,false);v.setUint8(4,MEDIA_VERSION);v.setUint8(5,kind);
  v.setUint16(6,keyframe?MEDIA_FLAG_KEYFRAME:0,false);v.setUint32(8,sequence,false);
  v.setUint16(12,0,false);v.setUint16(14,0,false);v.setUint32(16,1,false);v.setUint32(20,1000000,false);
  v.setBigInt64(24,BigInt(Math.max(0,Math.round(ptsUs))),false);v.setBigInt64(32,BigInt(Math.max(0,Math.round(ptsUs))),false);
  v.setUint32(40,payload.byteLength,false);new Uint8Array(b,MEDIA_HEADER_BYTES).set(payload);return b;
}
function units(bytes){
  const starts=[];for(let i=0;i+2<bytes.length;){
    let prefix=0;
    if(i+3<bytes.length&&bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===0&&bytes[i+3]===1)prefix=4;
    else if(bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1)prefix=3;
    if(prefix){starts.push({offset:i,prefix});i+=prefix;}else i++;
  }
  const out=[];for(let i=0;i<starts.length;i++){const begin=starts[i].offset+starts[i].prefix,end=i+1<starts.length?starts[i+1].offset:bytes.length;if(begin<end)out.push(bytes.slice(begin,end));}
  return out;
}
function nalType(u){return u.byteLength?u[0]&31:0;}
function join(unitsList){
  const total=unitsList.reduce((s,u)=>s+4+u.byteLength,0),out=new Uint8Array(total);let p=0;
  for(const u of unitsList){out.set([0,0,0,1],p);p+=4;out.set(u,p);p+=u.byteLength;}return out;
}
function parseAvcC(description){
  const bytes=description instanceof ArrayBuffer?new Uint8Array(description):new Uint8Array(description.buffer,description.byteOffset,description.byteLength);
  if(bytes.length<7||bytes[0]!==1)return null;
  let o=5;const countSps=bytes[o++]&31,out=[];
  for(let i=0;i<countSps;i++){if(o+2>bytes.length)return null;const len=(bytes[o]<<8)|bytes[o+1];o+=2;if(len<1||o+len>bytes.length)return null;out.push(bytes.slice(o,o+len));o+=len;}
  if(o>=bytes.length)return null;const countPps=bytes[o++];
  for(let i=0;i<countPps;i++){if(o+2>bytes.length)return null;const len=(bytes[o]<<8)|bytes[o+1];o+=2;if(len<1||o+len>bytes.length)return null;out.push(bytes.slice(o,o+len));o+=len;}
  return out.length>=2?join(out):null;
}
function normalizeKeyframe(payload,cached){
  const us=units(payload);if(!us.length)return null;
  const cachedUnits=cached?units(cached):[];
  const sps=us.filter(u=>nalType(u)===7);const pps=us.filter(u=>nalType(u)===8);
  const useSps=sps.length?sps:cachedUnits.filter(u=>nalType(u)===7);
  const usePps=pps.length?pps:cachedUnits.filter(u=>nalType(u)===8);
  const aud=us.filter(u=>nalType(u)===9);
  const rest=us.filter(u=>![7,8,9].includes(nalType(u)));
  if(!useSps.length||!usePps.length||!rest.some(u=>nalType(u)===5))return null;
  return join([...aud,...useSps,...usePps,...rest]);
}
async function videoConfig(){
  if(typeof VideoEncoder==="undefined"||typeof VideoFrame==="undefined")throw new Error("WEBCODECS_H264_UNAVAILABLE");
  const config={codec:CODEC,width:WIDTH,height:HEIGHT,framerate:FPS,bitrate:800000,latencyMode:"realtime",avc:{format:"annexb"}};
  const supported=await VideoEncoder.isConfigSupported(config);
  if(!supported.supported)throw new Error("H264_ANNEXB_UNSUPPORTED");
  return supported.config||config;
}
function drawCover(ctx,image){
  const scale=Math.max(WIDTH/image.naturalWidth,HEIGHT/image.naturalHeight)*1.02;
  const w=image.naturalWidth*scale,h=image.naturalHeight*scale;
  ctx.drawImage(image,(WIDTH-w)/2,(HEIGHT-h)/2,w,h);
}
function drawStanding(ctx,standing,background,t){
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);drawCover(ctx,background);
  const left=WIDTH*.12,right=WIDTH*.88,top=HEIGHT*.12,bottom=HEIGHT*.95;
  const boxW=right-left,boxH=bottom-top;
  const scale=Math.min(boxW/standing.naturalWidth,boxH/standing.naturalHeight);
  const w=standing.naturalWidth*scale,h=standing.naturalHeight*scale;
  const x=WIDTH*.5+(Math.sin(t*.83)*.026+Math.sin(t*.31)*.012)*HEIGHT;
  const y=bottom+(Math.sin(t*.67)*.010+Math.sin(t*1.47)*.004)*HEIGHT;
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*.49)*.012);ctx.drawImage(standing,-w/2,-h,w,h);ctx.restore();
}

class StandingDemoController{
  constructor(grant,standing,backgrounds,urls){
    this.grant=grant;this.standing=standing;this.backgrounds=backgrounds;this.urls=urls;
    this.socket=null;this.encoder=null;this.timer=null;this.backgroundTimer=null;this.sequence=0;this.frame=0;
    this.parameterSets=null;this.startedAt=0;this.canvas=document.createElement("canvas");this.canvas.width=WIDTH;this.canvas.height=HEIGHT;
    this.ctx=this.canvas.getContext("2d",{alpha:false,desynchronized:true});this.backgroundIndex=randomIndex(backgrounds.length);
    this.stopped=false;this.starting=false;
  }
  get watchGrant(){return{streamId:this.grant.streamId,capability:this.grant.monitorCapability,mediaWebSocketUrl:this.grant.mediaWebSocketUrl,expiresAt:this.grant.expiresAt};}
  scheduleBackground(){
    if(this.stopped||this.backgrounds.length<2)return;
    const delay=7000+randomIndex(7000);
    this.backgroundTimer=setTimeout(()=>{
      if(this.stopped)return;
      let next=randomIndex(this.backgrounds.length-1);if(next>=this.backgroundIndex)next++;
      this.backgroundIndex=next;this.scheduleBackground();
    },delay);
  }
  async start(){
    if(this.stopped||this.starting||this.timer!==null)return;
    this.starting=true;
    try{
      if(!this.ctx)throw new Error("VIDEO_CANVAS_UNAVAILABLE");
      const config=await videoConfig();
      const socket=new WebSocket(this.grant.cloudflareWebSocketUrl,[VIDEO_SUBPROTOCOL,`bearer.${this.grant.publisherCapability}`]);
      socket.binaryType="arraybuffer";this.socket=socket;await waitOpen(socket);
      const send=(kind,payload,keyframe,pts)=>{
        if(this.stopped||socket.readyState!==WebSocket.OPEN)return;
        this.sequence=(this.sequence+1)>>>0;if(this.sequence===0)this.sequence=1;
        socket.send(buildPacket(this.sequence,kind,payload,keyframe,pts));
      };
      this.encoder=new VideoEncoder({
        output:(chunk,metadata)=>{
          if(this.stopped||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>MAX_BUFFERED)return;
          if(metadata?.decoderConfig?.description){
            const parsed=parseAvcC(metadata.decoderConfig.description);if(parsed)this.parameterSets=parsed;
          }
          const payload=new Uint8Array(chunk.byteLength);chunk.copyTo(payload);
          const us=units(payload);if(!us.length)return;
          const sps=us.filter(u=>nalType(u)===7),pps=us.filter(u=>nalType(u)===8);
          if(sps.length&&pps.length)this.parameterSets=join([...sps,...pps]);
          const key=chunk.type==="key"||us.some(u=>nalType(u)===5);
          const wire=key?normalizeKeyframe(payload,this.parameterSets):payload;if(!wire)return;
          send(MEDIA_KIND_VIDEO,wire,key,chunk.timestamp);
        },
        error:()=>{void this.stop();}
      });
      this.encoder.configure(config);
      const configPayload=new TextEncoder().encode(JSON.stringify({codec:"h264-annexb",profile:CODEC,width:WIDTH,height:HEIGHT,fps:FPS,keyframeIntervalFrames:KEYFRAME_INTERVAL,source:"standing-2.5d-streaming-temporary-copy",staging:true,faceLocalWarp:0,syntheticMotion:true}));
      send(MEDIA_KIND_CONFIG,configPayload,false,0);
      this.startedAt=performance.now();
      const tick=()=>{
        if(this.stopped||!this.encoder||this.encoder.state!=="configured"||!this.ctx)return;
        if(document.hidden||this.encoder.encodeQueueSize>2)return;
        const t=(performance.now()-this.startedAt)/1000;
        drawStanding(this.ctx,this.standing,this.backgrounds[this.backgroundIndex],t);
        const timestamp=Math.max(0,Math.round((performance.now()-this.startedAt)*1000));
        const frame=new VideoFrame(this.canvas,{timestamp});
        try{this.encoder.encode(frame,{keyFrame:this.frame%KEYFRAME_INTERVAL===0});this.frame++;}finally{frame.close();}
      };
      tick();this.timer=setInterval(tick,FRAME_MS);this.scheduleBackground();
      await postJson(LIVE_URL,{streamId:this.grant.streamId,controlCapability:this.grant.controlCapability});
    }catch(error){await this.stop();throw error;}
    finally{this.starting=false;}
  }
  async stop(){
    if(this.stopped)return;
    this.stopped=true;
    if(this.timer!==null){clearInterval(this.timer);this.timer=null;}
    if(this.backgroundTimer!==null){clearTimeout(this.backgroundTimer);this.backgroundTimer=null;}
    if(this.encoder){try{await this.encoder.flush();}catch{}try{this.encoder.close();}catch{}this.encoder=null;}
    if(this.socket){try{this.socket.close(1000,"demo stop");}catch{}this.socket=null;}
    for(const u of this.urls)URL.revokeObjectURL(u);
    await Promise.allSettled([
      postJson(PREVIEW_STOP_URL,{streamId:this.grant.streamId,controlCapability:this.grant.controlCapability},{keepalive:true}),
      postJson(STOP_URL,{action:"stream_stop",streamId:this.grant.streamId,controlCapability:this.grant.controlCapability},{keepalive:true})
    ]);
  }
}

export async function prepareStandingDemo(accessKey){
  if(!ACCESS_RE.test(accessKey))throw new Error("ACCESS_NOT_VALID");
  let grant=null,urls=[];
  try{
    const start=await postJson(START_URL,{accessKey});
    grant=validGrant(start.realtimeGrant);
    await postJson(PREPARE_URL,{streamId:grant.streamId,controlCapability:grant.controlCapability});
    const standing=await fetchImage(STANDING_URL,{streamId:grant.streamId,controlCapability:grant.controlCapability});urls.push(standing.url);
    const backgrounds=[];
    for(let i=0;i<4;i++){
      const bg=await fetchImage(BACKGROUND_URL,{streamId:grant.streamId,controlCapability:grant.controlCapability,backgroundIndex:i});
      urls.push(bg.url);backgrounds.push(bg.image);
    }
    return new StandingDemoController(grant,standing.image,backgrounds,urls);
  }catch(error){
    for(const u of urls)URL.revokeObjectURL(u);
    if(grant){
      await Promise.allSettled([
        postJson(PREVIEW_STOP_URL,{streamId:grant.streamId,controlCapability:grant.controlCapability},{keepalive:true}),
        postJson(STOP_URL,{action:"stream_stop",streamId:grant.streamId,controlCapability:grant.controlCapability},{keepalive:true})
      ]);
    }
    throw error;
  }
}
