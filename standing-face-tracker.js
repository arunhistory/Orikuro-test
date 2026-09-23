import{adaptYuNetDetectionToFaceRegionSample,createLostFaceRegionSample}from'./standing-face-region.js?v=20260922-yunet1';

const WORKER_URL='./standing-face-worker.js?v=20260923-mobilefix2';
const MAX_INFERENCE_SIDE=320;
const TARGET_INTERVAL_MS=1000/30;

export class StandingFaceTracker{
  constructor(){
    this.worker=null;
    this.stream=null;
    this.video=null;
    this.canvas=null;
    this.context=null;
    this.running=false;
    this.busy=false;
    this.failedFrames=0;
    this.frameId=0;
    this.lastTimestampNS=0;
    this.lastSubmitMs=0;
    this.animationHandle=0;
    this.videoFrameHandle=0;
    this.backend='uninitialized';
    this.readyPromise=null;
  }

  async start(){
    if(this.readyPromise)return await this.readyPromise;
    if(this.running)return;
    this.readyPromise=this.#startInternal();
    try{await this.readyPromise;}finally{this.readyPromise=null;}
  }

  async #startInternal(){
    const media=navigator.mediaDevices;
    if(!media?.getUserMedia)throw new Error('CAMERA_CAPTURE_UNAVAILABLE');
    this.running=true;
    try{
      this.worker=new Worker(WORKER_URL,{name:'orikuro-yunet-face-provider'});
      const providerReady=this.#waitForProviderReady(this.worker);
      this.worker.addEventListener('message',event=>this.#onWorkerMessage(event));
      this.worker.addEventListener('error',()=>this.#fail('FACE_PROVIDER_WORKER_ERROR'));
      this.worker.postMessage({type:'init'});
      await providerReady;
      if(!this.running)return;

      this.stream=await media.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
      if(!this.running){this.stream.getTracks().forEach(track=>track.stop());this.stream=null;return;}
      const track=this.stream.getVideoTracks()[0];
      if(!track||track.readyState!=='live')throw new Error('CAMERA_TRACK_MISSING');
      track.addEventListener('ended',()=>this.#fail('CAMERA_TRACK_ENDED'),{once:true});

      const video=document.createElement('video');
      video.muted=true;video.playsInline=true;video.autoplay=true;video.srcObject=this.stream;
      this.video=video;
      await video.play();
      if(!this.running)return;
      await this.#waitForVideoGeometry(video);
      if(!this.running)return;
      this.#schedule();
      window.dispatchEvent(new CustomEvent('orikuro:standing-tracking-ready',{detail:{backend:this.backend,provider:'yunet-onnxruntime-web',rawCameraUpload:false}}));
    }catch(error){
      const code=error instanceof DOMException&&error.name?error.name:error instanceof Error&&error.message?error.message:'STANDING_TRACKING_START_FAILED';
      this.stop();
      throw new Error(code);
    }
  }

  stop(){
    if(this.video&&this.videoFrameHandle&&typeof this.video.cancelVideoFrameCallback==='function'){
      try{this.video.cancelVideoFrameCallback(this.videoFrameHandle);}catch{}
    }
    if(this.animationHandle)cancelAnimationFrame(this.animationHandle);
    this.videoFrameHandle=0;this.animationHandle=0;
    this.running=false;this.busy=false;this.failedFrames=0;
    try{this.worker?.postMessage({type:'dispose'});}catch{}
    try{this.worker?.terminate();}catch{}
    this.worker=null;
    this.stream?.getTracks?.().forEach(track=>track.stop());
    this.stream=null;
    if(this.video){this.video.srcObject=null;this.video=null;}
    this.canvas=null;this.context=null;this.backend='uninitialized';
  }

  #waitForProviderReady(worker){
    return new Promise((resolve,reject)=>{
      const timeout=window.setTimeout(()=>{cleanup();reject(new Error('FACE_PROVIDER_INIT_TIMEOUT'));},15000);
      const onMessage=event=>{
        const data=event.data&&typeof event.data==='object'?event.data:null;
        if(data?.type==='ready'){
          this.backend=typeof data.backend==='string'?data.backend:'wasm';
          cleanup();resolve();
        }else if(data?.type==='fatal'){
          cleanup();reject(new Error(typeof data.code==='string'?data.code:'FACE_PROVIDER_INIT_FAILED'));
        }
      };
      const onError=()=>{cleanup();reject(new Error('FACE_PROVIDER_WORKER_ERROR'));};
      const cleanup=()=>{clearTimeout(timeout);worker.removeEventListener('message',onMessage);worker.removeEventListener('error',onError);};
      worker.addEventListener('message',onMessage);
      worker.addEventListener('error',onError,{once:true});
    });
  }

  #waitForVideoGeometry(video){
    if(video.videoWidth>0&&video.videoHeight>0)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const timeout=window.setTimeout(()=>{cleanup();reject(new Error('CAMERA_VIDEO_METADATA_TIMEOUT'));},10000);
      const ready=()=>{if(video.videoWidth>0&&video.videoHeight>0){cleanup();resolve();}};
      const failed=()=>{cleanup();reject(new Error('CAMERA_VIDEO_METADATA_FAILED'));};
      const cleanup=()=>{clearTimeout(timeout);video.removeEventListener('loadedmetadata',ready);video.removeEventListener('resize',ready);video.removeEventListener('error',failed);};
      video.addEventListener('loadedmetadata',ready);
      video.addEventListener('resize',ready);
      video.addEventListener('error',failed,{once:true});
    });
  }

  #schedule(){
    if(!this.running||!this.video)return;
    if(typeof this.video.requestVideoFrameCallback==='function'){
      this.videoFrameHandle=this.video.requestVideoFrameCallback(now=>{
        this.videoFrameHandle=0;
        try{this.#tick(now);}catch{this.#fail('FACE_CAPTURE_FRAME_FAILED');}
        this.#schedule();
      });
    }else{
      this.animationHandle=requestAnimationFrame(now=>{
        this.animationHandle=0;
        try{this.#tick(now);}catch{this.#fail('FACE_CAPTURE_FRAME_FAILED');}
        this.#schedule();
      });
    }
  }

  #tick(now){
    if(!this.running||this.busy||!this.worker||!this.video||this.video.readyState<2)return;
    if(now-this.lastSubmitMs<TARGET_INTERVAL_MS)return;
    this.lastSubmitMs=now;
    const sourceW=this.video.videoWidth,sourceH=this.video.videoHeight;
    if(sourceW<1||sourceH<1)return;
    const scale=Math.min(1,MAX_INFERENCE_SIDE/Math.max(sourceW,sourceH));
    const contentWidth=Math.max(1,Math.round(sourceW*scale));
    const contentHeight=Math.max(1,Math.round(sourceH*scale));
    const width=Math.ceil(contentWidth/32)*32,height=Math.ceil(contentHeight/32)*32;
    if(!this.canvas||this.canvas.width!==width||this.canvas.height!==height){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
      if(!context){this.#fail('FACE_PROVIDER_CANVAS_UNAVAILABLE');return;}
      this.canvas=canvas;this.context=context;
    }
    const ctx=this.context;
    ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
    ctx.drawImage(this.video,0,0,contentWidth,contentHeight);
    const rgba=ctx.getImageData(0,0,width,height).data;
    const timestampNS=Math.max(this.lastTimestampNS+1,Math.round(performance.now()*1_000_000));
    this.lastTimestampNS=timestampNS;
    this.frameId++;
    this.busy=true;
    this.worker.postMessage({type:'infer',frameId:this.frameId,timestampNS,width,height,contentWidth,contentHeight,rgba},[rgba.buffer]);
  }

  #onWorkerMessage(event){
    const data=event.data&&typeof event.data==='object'?event.data:null;
    if(!data)return;
    if(data.type==='result'){
      this.busy=false;
      this.failedFrames=0;
      try{
        const sample=adaptYuNetDetectionToFaceRegionSample(data.detection,{frameId:data.frameId,timestampNS:data.timestampNS,contentWidth:data.contentWidth,contentHeight:data.contentHeight});
        window.dispatchEvent(new CustomEvent('orikuro:face-region-sample',{detail:sample}));
      }catch(error){
        this.#fail(error instanceof Error?error.message:'FACE_REGION_ADAPTER_FAILED');
      }
    }else if(data.type==='frame-error'){
      this.busy=false;
      this.failedFrames++;
      if(this.failedFrames>=3){
        this.#fail('FACE_PROVIDER_REPEATED_FRAME_ERROR');
        return;
      }
      const frameId=Number(data.frameId),timestampNS=Number(data.timestampNS);
      if(Number.isSafeInteger(frameId)&&frameId>0&&Number.isSafeInteger(timestampNS)&&timestampNS>0){
        try{window.dispatchEvent(new CustomEvent('orikuro:face-region-sample',{detail:createLostFaceRegionSample(frameId,timestampNS)}));}catch{}
      }
    }else if(data.type==='fatal'){
      this.#fail(typeof data.code==='string'?data.code:'FACE_PROVIDER_FATAL');
    }
  }

  #fail(code){
    if(!this.running)return;
    this.stop();
    window.dispatchEvent(new CustomEvent('orikuro:standing-tracking-failed',{detail:{code}}));
  }
}
