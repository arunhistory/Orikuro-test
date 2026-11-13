// Watch-room demo publisher (staging).
//
// The picture is rendered by Cloudflare: Supabase hands the prepared stream to
// Cloudflare's scene (R2 temporary copy -> decrypt -> render-2d -> first
// composition) and Northflank delivers it to this page's viewer canvas. This
// module only keeps the publisher session open and sends a silent audio track
// so the watch room behaves like a live stream. It never draws, decodes or
// encodes the standing image or background.
const BASE="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/external-services-system";
const PREP_URL=BASE+"/system-watch-assets";
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
const WIDTH=360;
const HEIGHT=640;
const FPS=30;

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
  if(socket.readyState===WebSocket.OPEN)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const timer=window.setTimeout(()=>{cleanup();reject(new Error("WATCH_DEMO_SOCKET_TIMEOUT"));},timeoutMs);
    const cleanup=()=>{window.clearTimeout(timer);socket.removeEventListener("open",onOpen);socket.removeEventListener("error",onError);socket.removeEventListener("close",onError);};
    const onOpen=()=>{cleanup();resolve();};
    const onError=()=>{cleanup();reject(new Error("WATCH_DEMO_SOCKET_FAILED"));};
    socket.addEventListener("open",onOpen);
    socket.addEventListener("error",onError);
    socket.addEventListener("close",onError);
  });
}

export class WatchDemoPublisher{
  private readonly grant:WatchDemoPublisherGrant;
  private readonly canvas:HTMLCanvasElement;
  private socket:WebSocket|null=null;
  private audioSocket:WebSocket|null=null;
  private audioTimer:number|null=null;
  private audioSequence=0;
  private audioFrameIndex=0;
  private audioStartedAt=0;
  private stopping=false;
  private assetsPrepared=false;

  constructor(grant:WatchDemoPublisherGrant,canvas:HTMLCanvasElement){
    this.grant=grant;
    this.canvas=canvas;
    this.canvas.width=WIDTH;this.canvas.height=HEIGHT;
  }

  async start():Promise<void>{
    if(this.stopping)throw new Error("WATCH_DEMO_STOPPED");
    this.drawWaiting();
    await this.prepareScene();
    if(this.stopping)return;
    window.dispatchEvent(new CustomEvent("orikuro:demo-preview-ready",{detail:{streamId:this.grant.streamId}}));

    const socket=new WebSocket(this.grant.cloudflareWebSocketUrl,[VIDEO_SUBPROTOCOL,"bearer."+this.grant.publisherCapability]);
    socket.binaryType="arraybuffer";
    const audioSocket=new WebSocket(this.grant.audioWebSocketUrl,[AUDIO_SUBPROTOCOL,"bearer."+this.grant.publisherCapability]);
    this.socket=socket;
    this.audioSocket=audioSocket;
    await Promise.all([waitOpen(socket),waitOpen(audioSocket)]);
    if(this.stopping)return;

    socket.addEventListener("message",event=>{
      if(typeof event.data!=="string"||event.data.length>8192)return;
      let data:Record<string,unknown>={};try{data=obj(JSON.parse(event.data));}catch{}
      if(data.type==="scene_status")window.dispatchEvent(new CustomEvent("orikuro:demo-scene-status",{detail:data}));
      if(data.type==="session_ended")window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-failed",{detail:{code:"WATCH_DEMO_SESSION_ENDED"}}));
    });
    audioSocket.addEventListener("close",()=>{
      if(this.stopping||audioSocket!==this.audioSocket)return;
      window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-failed",{detail:{code:"WATCH_DEMO_AUDIO_CLOSED"}}));
    });
    audioSocket.addEventListener("message",event=>{
      if(typeof event.data!=="string"||event.data.length>4096)return;
      let data:Record<string,unknown>={};try{data=obj(JSON.parse(event.data));}catch{}
      if(data.type==="audio_error")window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-failed",{detail:{code:String(data.code||"WATCH_DEMO_AUDIO_ERROR")}}));
    });
    this.startSilentAudio(performance.now());
    window.dispatchEvent(new CustomEvent("orikuro:demo-publisher-live",{detail:{streamId:this.grant.streamId,width:WIDTH,height:HEIGHT,fps:FPS,renderer:"cloudflare"}}));
  }

  // Asset ids and the start request only; Cloudflare renders the picture.
  private async prepareScene():Promise<void>{
    const body={streamId:this.grant.streamId,controlCapability:this.grant.controlCapability};
    const prep=await postJson(PREP_URL,body);
    const prepData=obj(await prep.json().catch(()=>null));
    if(!prep.ok||prepData.ok!==true)throw new Error(typeof prepData.code==="string"?prepData.code:"WATCH_DEMO_ASSET_PREPARE_FAILED");
    this.assetsPrepared=true;
  }

  // UI placeholder until the Northflank stream's first frame arrives.
  private drawWaiting():void{
    const ctx=this.canvas.getContext("2d");
    if(!ctx)return;
    ctx.fillStyle="#151827";ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle="rgba(255,255,255,.72)";ctx.font="16px sans-serif";ctx.textAlign="center";
    ctx.fillText("配信映像を準備しています…",WIDTH/2,HEIGHT/2);
  }

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

  async stop(keepalive=false):Promise<void>{
    if(this.stopping)return;
    this.stopping=true;
    if(this.audioTimer!==null){clearTimeout(this.audioTimer);this.audioTimer=null;}
    if(this.socket&&this.socket.readyState<WebSocket.CLOSING){try{this.socket.close(1000,"demo publisher stopped");}catch{}}
    if(this.audioSocket&&this.audioSocket.readyState<WebSocket.CLOSING){try{this.audioSocket.close(1000,"demo audio stopped");}catch{}}
    this.socket=null;
    this.audioSocket=null;
    if(this.assetsPrepared){
      try{await postJson(STOP_ASSETS_URL,{streamId:this.grant.streamId,controlCapability:this.grant.controlCapability},keepalive);}catch{}
      this.assetsPrepared=false;
    }
  }
}
