const BASE="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system";
const PREP_URL=BASE+"/system-watch-assets";
const STANDING_URL=BASE+"/stream-standing-preview";
const BACKGROUND_URL=BASE+"/stream-background-preview";
const STOP_ASSETS_URL=BASE+"/stream-standing-preview-stop";
const VIDEO_SUBPROTOCOL="orikuro-stream-v1";
const AUDIO_SUBPROTOCOL="orikuro-audio-v1";
const AUDIO_MAGIC=0x4f434155;
const AUDIO_VERSION=1;
const AUDIO_FORMAT_F32P=1;
const AUDIO_HEADER_BYTES=32;
const AUDIO_SAMPLE_RATE=48000;
const AUDIO_FRAMES=1024;
const AUDIO_INTERVAL_MS=AUDIO_FRAMES*1000/AUDIO_SAMPLE_RATE;
const AUDIO_PAYLOAD_BYTES=AUDIO_FRAMES*4;
const MEDIA_MAGIC=0x4f52494b;
const MEDIA_VERSION=1;
const MEDIA_HEADER_BYTES=44;
const MEDIA_KIND_VIDEO=1;
const MEDIA_KIND_CONFIG=2;
const MEDIA_FLAG_KEYFRAME=1;
const WIDTH=360;
const HEIGHT=640;
const FPS=30;
const FRAME_INTERVAL_US=Math.round(1_000_000/FPS);
const KEYFRAME_INTERVAL=FPS*2;
const CODEC="avc1.42001E";
const MAX_BUFFERED_BYTES=2*1024*1024;
const enc=new TextEncoder();

export type WatchDemoPublisherGrant=Readonly<{
  streamId:string;
  publisherCapability:string;
  controlCapability:string;
  cloudflareWebSocketUrl:string;
  audioWebSocketUrl:string;
  expiresAt:number;
}>;

function obj(value:unknown):Record<string,unknown>{
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

async function postJson(url:string,body:Record<string,unknown>,keepalive=false):Promise<Response>{
  return await fetch(url,{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body),
    credentials:"omit",
    cache:"no-store",
    referrerPolicy:"no-referrer",
    keepalive,
  });
}

async function checkedImage(response:Response):Promise<{image:HTMLImageElement;url:string}>{
  if(!response.ok)throw new Error("WATCH_DEMO_IMAGE_FETCH_FAILED");
  const type=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();
  if(!["image/png","image/jpeg","image/webp"].includes(type))throw new Error("WATCH_DEMO_IMAGE_TYPE_INVALID");
  const blob=await response.blob();
  if(blob.size<1||blob.size>48*1024*1024)throw new Error("WATCH_DEMO_IMAGE_SIZE_INVALID");
  const url=URL.createObjectURL(blob);
  const image=new Image();
  image.decoding="async";
  image.src=url;
  try{
    await image.decode();
    if(image.naturalWidth<1||image.naturalHeight<1)throw new Error("WATCH_DEMO_IMAGE_DECODE_FAILED");
    return{image,url};
  }catch(error){
    URL.revokeObjectURL(url);
    throw error;
  }
}

function drawCover(ctx:CanvasRenderingContext2D,image:HTMLImageElement):void{
  const scale=Math.max(WIDTH/image.naturalWidth,HEIGHT/image.naturalHeight);
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  ctx.drawImage(image,(WIDTH-width)/2,(HEIGHT-height)/2,width,height);
}

function drawStanding(ctx:CanvasRenderingContext2D,image:HTMLImageElement,elapsedMs:number):void{
  const marginX=WIDTH*.08,top=HEIGHT*.07,bottom=HEIGHT*.98;
  const maxW=WIDTH-marginX*2,maxH=bottom-top;
  const scale=Math.min(maxW/image.naturalWidth,maxH/image.naturalHeight);
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  const t=elapsedMs/1000;
  // Small deterministic idle movement only. The same moving canvas is encoded
  // into the real Cloudflare -> Northflank viewer route.
  const x=Math.sin(t*1.05)*WIDTH*.018;
  const y=Math.sin(t*1.55)*HEIGHT*.006;
  const roll=Math.sin(t*.72)*1.25*Math.PI/180;
  const breathe=1+Math.sin(t*1.9)*.004;
  ctx.save();
  ctx.translate(WIDTH/2+x,bottom+y);
  ctx.rotate(roll);
  ctx.scale(breathe,breathe);
  ctx.drawImage(image,-width/2,-height,width,height);
  ctx.restore();
}

function buildPacket(sequence:number,kind:number,payload:Uint8Array,keyframe:boolean,ptsUs:number):ArrayBuffer{
  const buffer=new ArrayBuffer(MEDIA_HEADER_BYTES+payload.byteLength);
  const view=new DataView(buffer);
  view.setUint32(0,MEDIA_MAGIC,false);
  view.setUint8(4,MEDIA_VERSION);
  view.setUint8(5,kind);
  view.setUint16(6,keyframe?MEDIA_FLAG_KEYFRAME:0,false);
  view.setUint32(8,sequence>>>0,false);
  view.setUint16(12,0,false);
  view.setUint16(14,0,false);
  view.setUint32(16,1,false);
  view.setUint32(20,1_000_000,false);
  view.setBigInt64(24,BigInt(Math.max(0,Math.round(ptsUs))),false);
  view.setBigInt64(32,BigInt(Math.max(0,Math.round(ptsUs))),false);
  view.setUint32(40,payload.byteLength,false);
  new Uint8Array(buffer,MEDIA_HEADER_BYTES).set(payload);
  return buffer;
}

function annexBUnits(bytes:Uint8Array):Uint8Array[]{
  const starts:Array<{offset:number;prefix:number}>=[];
  for(let i=0;i+2<bytes.length;){
    let prefix=0;
    if(i+3<bytes.length&&bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===0&&bytes[i+3]===1)prefix=4;
    else if(bytes[i]===0&&bytes[i+1]===0&&bytes[i+2]===1)prefix=3;
    if(prefix){starts.push({offset:i,prefix});i+=prefix;}else i++;
  }
  const units:Uint8Array[]=[];
  for(let i=0;i<starts.length;i++){
    const begin=starts[i].offset+starts[i].prefix;
    const end=i+1<starts.length?starts[i+1].offset:bytes.length;
    if(begin<end)units.push(bytes.slice(begin,end));
  }
  return units;
}

function nalType(unit:Uint8Array):number{return unit.byteLength?unit[0]&31:0;}

function joinAnnexB(units:Uint8Array[]):Uint8Array{
  const total=units.reduce((sum,u)=>sum+4+u.byteLength,0);
  const out=new Uint8Array(total);
  let pos=0;
  for(const unit of units){out.set([0,0,0,1],pos);pos+=4;out.set(unit,pos);pos+=unit.byteLength;}
  return out;
}

function avcParameterSets(description:AllowSharedBufferSource):Uint8Array|null{
  const bytes=description instanceof ArrayBuffer?new Uint8Array(description):new Uint8Array(description.buffer,description.byteOffset,description.byteLength);
  if(bytes.length<7||bytes[0]!==1)return null;
  let offset=5;
  const units:Uint8Array[]=[];
  const spsCount=bytes[offset++]&31;
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
  return units.length>=2?joinAnnexB(units):null;
}

function normalizeKeyframe(payload:Uint8Array,cached:Uint8Array|null):{payload:Uint8Array|null;cache:Uint8Array|null}{
  const units=annexBUnits(payload);
  if(!units.length)return{payload:null,cache:cached};
  const inSps=units.filter(u=>nalType(u)===7),inPps=units.filter(u=>nalType(u)===8);
  let nextCache=cached;
  if(inSps.length&&inPps.length)nextCache=joinAnnexB([...inSps,...inPps]);
  const cachedUnits=nextCache?annexBUnits(nextCache):[];
  const sps=inSps.length?inSps:cachedUnits.filter(u=>nalType(u)===7);
  const pps=inPps.length?inPps:cachedUnits.filter(u=>nalType(u)===8);
  const aud=units.filter(u=>nalType(u)===9);
  const rest=units.filter(u=>![7,8,9].includes(nalType(u)));
  if(!sps.length||!pps.length||!rest.some(u=>nalType(u)===5))return{payload:null,cache:nextCache};
  return{payload:joinAnnexB([...aud,...sps,...pps,...rest]),cache:nextCache};
}

function buildSilentAudio(sequence:number,timestampNs:number):ArrayBuffer{
  const buffer=new ArrayBuffer(AUDIO_HEADER_BYTES+AUDIO_PAYLOAD_BYTES);
  const view=new DataView(buffer);
  view.setUint32(0,AUDIO_MAGIC,false);
  view.setUint8(4,AUDIO_VERSION);
  view.setUint8(5,1);
  view.setUint8(6,AUDIO_FORMAT_F32P);
  view.setUint8(7,0);
  view.setUint32(8,AUDIO_SAMPLE_RATE,false);
  view.setUint16(12,AUDIO_FRAMES,false);
  view.setUint16(14,0,false);
  view.setUint32(16,sequence>>>0,false);
  view.setBigInt64(20,BigInt(Math.max(0,Math.round(timestampNs))),false);
  view.setUint32(28,AUDIO_PAYLOAD_BYTES,false);
  // ArrayBuffer bytes are already zero, which is valid silent float32-planar PCM.
  return buffer;
}

function waitOpen(socket:WebSocket,timeoutMs=5000):Promise<void>{
  return new Promise((resolve,reject)=>{
    let timer=0;
    const cleanup=()=>{clearTimeout(timer);socket.removeEventListener("open",onOpen);socket.removeEventListener("close",onClose);socket.removeEventListener("error",onError);};
    const onOpen=()=>{cleanup();resolve();};
    const onClose=()=>{cleanup();reject(new Error("WATCH_DEMO_VIDEO_CLOSED"));};
    const onError=()=>{cleanup();reject(new Error("WATCH_DEMO_VIDEO_ERROR"));};
    timer=window.setTimeout(()=>{cleanup();reject(new Error("WATCH_DEMO_VIDEO_TIMEOUT"));},timeoutMs);
    socket.addEventListener("open",onOpen,{once:true});socket.addEventListener("close",onClose,{once:true});socket.addEventListener("error",onError,{once:true});
  });
}

export class WatchDemoPublisher{
  private readonly grant:WatchDemoPublisherGrant;
  private readonly canvas:HTMLCanvasElement;
  private ctx:CanvasRenderingContext2D;
  private standing:HTMLImageElement|null=null;
  private background:HTMLImageElement|null=null;
  private urls:string[]=[];
  private socket:WebSocket|null=null;
  private audioSocket:WebSocket|null=null;
  private audioTimer:number|null=null;
  private audioSequence=0;
  private audioFrameIndex=0;
  private audioStartedAt=0;
  private encoder:VideoEncoder|null=null;
  private parameterSets:Uint8Array|null=null;
  private sequence=0;
  private frameIndex=0;
  private startedAt=0;
  private raf=0;
  private lastFrameAt=0;
  private stopping=false;
  private assetsPrepared=false;

  constructor(grant:WatchDemoPublisherGrant,canvas:HTMLCanvasElement){
    this.grant=grant;
    this.canvas=canvas;
    this.canvas.width=WIDTH;this.canvas.height=HEIGHT;
    const ctx=canvas.getContext("2d",{alpha:false,desynchronized:true});
    if(!ctx)throw new Error("WATCH_DEMO_CANVAS_UNAVAILABLE");
    this.ctx=ctx;
  }

  async start():Promise<void>{
    if(this.stopping)throw new Error("WATCH_DEMO_STOPPED");
    if(typeof VideoEncoder==="undefined"||typeof VideoFrame==="undefined")throw new Error("WATCH_DEMO_WEBCODECS_UNAVAILABLE");
    await this.prepareAssets();
    if(this.stopping)return;
    this.draw(performance.now());
    window.dispatchEvent(new CustomEvent("orikuro:demo-preview-ready",{detail:{streamId:this.grant.streamId}}));

    const config:VideoEncoderConfig={
      codec:CODEC,width:WIDTH,height:HEIGHT,framerate:FPS,bitrate:1_200_000,
      latencyMode:"realtime",avc:{format:"annexb"}
    };
    const supported=await VideoEncoder.isConfigSupported(config);
    if(!supported.supported)throw new Error("WATCH_DEMO_H264_UNSUPPORTED");

    const socket=new WebSocket(this.grant.cloudflareWebSocketUrl,[VIDEO_SUBPROTOCOL,"bearer."+this.grant.publisherCapability]);
    socket.binaryType="arraybuffer";
    const audioSocket=new WebSocket(this.grant.audioWebSocketUrl,[AUDIO_SUBPROTOCOL,"bearer."+this.grant.publisherCapability]);
    this.socket=socket;
    this.audioSocket=audioSocket;
    await Promise.all([waitOpen(socket),waitOpen(audioSocket)]);
    if(this.stopping)return;

    audioSocket.addEventListener("close",()=>{
      if(this.stopping||audioSocket!==this.audioSocket)return;
      window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-failed",{detail:{code:"WATCH_DEMO_AUDIO_CLOSED"}}));
    });
    audioSocket.addEventListener("message",event=>{
      if(typeof event.data!=="string"||event.data.length>4096)return;
      let data:Record<string,unknown>={};try{data=obj(JSON.parse(event.data));}catch{}
      if(data.type==="audio_error")window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-failed",{detail:{code:String(data.code||"WATCH_DEMO_AUDIO_ERROR")}}));
    });

    this.encoder=new VideoEncoder({
      output:(chunk,metadata)=>this.handleChunk(chunk,metadata),
      error:()=>window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-failed",{detail:{code:"WATCH_DEMO_ENCODER_FAILED"}})),
    });
    this.encoder.configure(supported.config??config);
    this.sequence=0;this.frameIndex=0;this.startedAt=performance.now();this.lastFrameAt=0;
    this.startSilentAudio(this.startedAt);
    this.sendConfig();
    this.tick(this.startedAt);
    window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-live",{detail:{streamId:this.grant.streamId,width:WIDTH,height:HEIGHT,fps:FPS}}));
  }

  private async prepareAssets():Promise<void>{
    const body={streamId:this.grant.streamId,controlCapability:this.grant.controlCapability};
    const prep=await postJson(PREP_URL,body);
    const prepData=obj(await prep.json().catch(()=>null));
    if(!prep.ok||prepData.ok!==true)throw new Error(typeof prepData.code==="string"?prepData.code:"WATCH_DEMO_ASSET_PREPARE_FAILED");
    this.assetsPrepared=true;

    const [standingResponse,backgroundResponse]=await Promise.all([
      postJson(STANDING_URL,body),
      postJson(BACKGROUND_URL,{...body,backgroundIndex:0}),
    ]);
    const [standing,background]=await Promise.all([checkedImage(standingResponse),checkedImage(backgroundResponse)]);
    this.standing=standing.image;this.background=background.image;
    this.urls.push(standing.url,background.url);
  }

  private draw(now:number):void{
    const ctx=this.ctx;
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,WIDTH,HEIGHT);
    if(this.background)drawCover(ctx,this.background);else{ctx.fillStyle="#151827";ctx.fillRect(0,0,WIDTH,HEIGHT);}
    ctx.restore();
    if(this.standing)drawStanding(ctx,this.standing,Math.max(0,now-this.startedAt));
  }

  private tick=(now:number):void=>{
    if(this.stopping)return;
    this.raf=requestAnimationFrame(this.tick);
    const interval=1000/FPS;
    if(this.lastFrameAt&&now-this.lastFrameAt<interval-1)return;
    this.lastFrameAt=now;
    this.draw(now);
    const encoder=this.encoder;
    if(!encoder||encoder.state!=="configured"||encoder.encodeQueueSize>3)return;
    const timestamp=this.frameIndex*FRAME_INTERVAL_US;
    const frame=new VideoFrame(this.canvas,{timestamp});
    try{encoder.encode(frame,{keyFrame:this.frameIndex%KEYFRAME_INTERVAL===0});this.frameIndex++;}
    finally{frame.close();}
  };

  private startSilentAudio(now:number):void{
    this.audioSequence=0;
    this.audioFrameIndex=0;
    this.audioStartedAt=now;
    const pump=()=>{
      if(this.stopping)return;
      const socket=this.audioSocket;
      if(!socket||socket.readyState!==WebSocket.OPEN)return;
      const elapsed=performance.now()-this.audioStartedAt;
      let sent=0;
      while(sent<4&&this.audioFrameIndex*AUDIO_INTERVAL_MS<=elapsed+1){
        this.audioSequence=(this.audioSequence+1)>>>0;
        if(this.audioSequence===0)this.audioSequence=1;
        const timestampNs=Math.round(this.audioFrameIndex*AUDIO_FRAMES*1_000_000_000/AUDIO_SAMPLE_RATE);
        if(socket.bufferedAmount<=512*1024)socket.send(buildSilentAudio(this.audioSequence,timestampNs));
        this.audioFrameIndex++;
        sent++;
      }
      const nextAt=this.audioFrameIndex*AUDIO_INTERVAL_MS;
      const delay=Math.max(2,Math.min(25,nextAt-(performance.now()-this.audioStartedAt)));
      this.audioTimer=window.setTimeout(pump,delay);
    };
    pump();
  }

  private nextSequence():number{
    this.sequence=(this.sequence+1)>>>0;
    if(this.sequence===0)this.sequence=1;
    return this.sequence;
  }

  private sendConfig():void{
    const socket=this.socket;
    if(!socket||socket.readyState!==WebSocket.OPEN)return;
    const payload=enc.encode(JSON.stringify({
      codec:"h264-annexb",profile:CODEC,width:WIDTH,height:HEIGHT,fps:FPS,
      keyframeIntervalFrames:KEYFRAME_INTERVAL,source:"staging-watch-standing-demo",
      staging:true,faceLocalWarp:0
    }));
    socket.send(buildPacket(this.nextSequence(),MEDIA_KIND_CONFIG,payload,false,0));
  }

  private handleChunk(chunk:EncodedVideoChunk,metadata?:EncodedVideoChunkMetadata):void{
    const socket=this.socket;
    if(this.stopping||!socket||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>MAX_BUFFERED_BYTES)return;
    if(metadata?.decoderConfig?.description){
      const parsed=avcParameterSets(metadata.decoderConfig.description);
      if(parsed)this.parameterSets=parsed;
    }
    const raw=new Uint8Array(chunk.byteLength);chunk.copyTo(raw);
    if(!annexBUnits(raw).length)return;
    const key=chunk.type==="key"||annexBUnits(raw).some(u=>nalType(u)===5);
    let payload=raw;
    if(key){
      const normalized=normalizeKeyframe(raw,this.parameterSets);
      this.parameterSets=normalized.cache;
      if(!normalized.payload)return;
      payload=normalized.payload;
    }
    socket.send(buildPacket(this.nextSequence(),MEDIA_KIND_VIDEO,payload,key,chunk.timestamp));
  }

  async stop(keepalive=false):Promise<void>{
    if(this.stopping)return;
    this.stopping=true;
    if(this.raf)cancelAnimationFrame(this.raf);
    this.raf=0;
    if(this.audioTimer!==null){clearTimeout(this.audioTimer);this.audioTimer=null;}
    if(this.encoder){try{await this.encoder.flush();}catch{}try{this.encoder.close();}catch{}this.encoder=null;}
    if(this.socket&&this.socket.readyState<WebSocket.CLOSING){try{this.socket.close(1000,"demo publisher stopped");}catch{}}
    if(this.audioSocket&&this.audioSocket.readyState<WebSocket.CLOSING){try{this.audioSocket.close(1000,"demo audio stopped");}catch{}}
    this.socket=null;
    this.audioSocket=null;
    this.parameterSets=null;
    for(const url of this.urls)URL.revokeObjectURL(url);
    this.urls=[];
    this.standing=null;this.background=null;
    if(this.assetsPrepared){
      try{await postJson(STOP_ASSETS_URL,{streamId:this.grant.streamId,controlCapability:this.grant.controlCapability},keepalive);}catch{}
      this.assetsPrepared=false;
    }
  }
}
