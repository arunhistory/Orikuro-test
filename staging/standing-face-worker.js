/* YuNet provider worker. Raw camera pixels never leave this worker/provider path. */
const ORT_DIST='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const ORT_WASM_SCRIPT=ORT_DIST+'ort.wasm.min.js';
const ORT_WEBGPU_SCRIPT=ORT_DIST+'ort.webgpu.min.js';

function webkitRuntime(){
  const ua=self.navigator?.userAgent||'';
  const ios=/iPhone|iPad|iPod/i.test(ua);
  const safari=/Safari/i.test(ua)&&/AppleWebKit/i.test(ua)&&!/(Chrome|Chromium|Edg|OPR)/i.test(ua);
  return ios||safari;
}
const YUNET_MODEL='https://media.githubusercontent.com/media/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/face_detection_yunet_2026may.onnx';
const STRIDES=[8,16,32];
const SCORE_THRESHOLD=0.58;
const NMS_THRESHOLD=0.30;
const TOP_K=300;
let session=null;
let inputName='input';
let backend='uninitialized';
let initPromise=null;
let tensorScratch=null;

self.addEventListener('message',event=>{
  const message=event.data&&typeof event.data==='object'?event.data:null;
  if(!message)return;
  if(message.type==='init')void ensureSession().catch(()=>{/* fatal sent by ensureSession */});
  else if(message.type==='infer')void infer(message);
  else if(message.type==='dispose')dispose();
});

async function ensureSession(){
  if(session)return session;
  if(initPromise)return await initPromise;
  initPromise=(async()=>{
    try{
      const forceStandardWasm=webkitRuntime()||!self.navigator?.gpu;
      self.postMessage({type:'init-progress',stage:'ort-loading'});
      if(typeof self.ort==='undefined')importScripts(forceStandardWasm?ORT_WASM_SCRIPT:ORT_WEBGPU_SCRIPT);
      self.postMessage({type:'init-progress',stage:'ort-ready'});
      if(typeof self.ort==='undefined')throw new Error('ORT_LOAD_FAILED');
      ort.env.wasm.wasmPaths=ORT_DIST;
      ort.env.wasm.numThreads=1;
      ort.env.wasm.proxy=false;

      // ONNX Runtime Web documents the standard WASM EP as supported on
      // Safari/iOS. Its WebGPU EP is not a supported Safari route, and the
      // JSEP/WebGPU bundle has shown runaway WebKit memory growth. Therefore
      // Apple/WebKit uses the non-JSEP WASM bundle directly.
      if(!forceStandardWasm){
        try{
          session=await ort.InferenceSession.create(YUNET_MODEL,{executionProviders:['webgpu','wasm'],graphOptimizationLevel:'all'});
          backend='webgpu';
        }catch{
          session=null;
        }
      }
      if(!session){
        self.postMessage({type:'init-progress',stage:'model-loading'});
        session=await ort.InferenceSession.create(YUNET_MODEL,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
        backend='wasm';
      }
      inputName=session.inputNames?.[0]||'input';
      self.postMessage({type:'init-progress',stage:'model-ready'});
      self.postMessage({type:'ready',backend});
      return session;
    }catch(error){
      self.postMessage({type:'fatal',code:error instanceof Error?error.message:'FACE_PROVIDER_INIT_FAILED'});
      throw error;
    }
  })();
  try{return await initPromise;}finally{initPromise=null;}
}

async function infer(message){
  const frameId=Number(message.frameId),timestampNS=Number(message.timestampNS);
  const width=Number(message.width),height=Number(message.height);
  const contentWidth=Number(message.contentWidth),contentHeight=Number(message.contentHeight);
  const rgba=message.rgba;
  try{
    if(!Number.isSafeInteger(frameId)||frameId<=0||!Number.isSafeInteger(timestampNS)||timestampNS<=0)throw new Error('FACE_PROVIDER_FRAME_IDENTITY_INVALID');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||width%32!==0||height%32!==0)throw new Error('FACE_PROVIDER_INPUT_SIZE_INVALID');
    if(!Number.isInteger(contentWidth)||!Number.isInteger(contentHeight)||contentWidth<1||contentHeight<1||contentWidth>width||contentHeight>height)throw new Error('FACE_PROVIDER_CONTENT_SIZE_INVALID');
    if(!(rgba instanceof Uint8ClampedArray)||rgba.length!==width*height*4)throw new Error('FACE_PROVIDER_RGBA_INVALID');
    const active=await ensureSession();
    const started=performance.now();
    const tensorData=rgbaToBgrNchw(rgba,width,height);
    const tensor=new ort.Tensor('float32',tensorData,[1,3,height,width]);
    let output=null;
    try{
      output=await active.run({[inputName]:tensor});
      const detection=decodeBest(output,width,height,contentWidth,contentHeight);
      self.postMessage({type:'result',frameId,timestampNS,width,height,contentWidth,contentHeight,detection,backend,inferenceMs:performance.now()-started});
    }finally{
      try{tensor.dispose?.();}catch{}
      if(output)for(const value of Object.values(output)){try{value?.dispose?.();}catch{}}
    }
  }catch(error){
    self.postMessage({type:'frame-error',frameId,timestampNS,code:error instanceof Error?error.message:'FACE_PROVIDER_INFER_FAILED'});
  }
}

function rgbaToBgrNchw(rgba,width,height){
  const pixels=width*height;
  const required=pixels*3;
  if(!(tensorScratch instanceof Float32Array)||tensorScratch.length!==required)tensorScratch=new Float32Array(required);
  const out=tensorScratch;
  for(let i=0,p=0;i<pixels;i++,p+=4){
    out[i]=rgba[p+2];
    out[pixels+i]=rgba[p+1];
    out[pixels*2+i]=rgba[p];
  }
  return out;
}

function decodeBest(output,width,height,contentWidth,contentHeight){
  const candidates=[];
  for(const stride of STRIDES){
    const cls=tensorData(output[`cls_${stride}`]);
    const obj=tensorData(output[`obj_${stride}`]);
    const bbox=tensorData(output[`bbox_${stride}`]);
    const kps=tensorData(output[`kps_${stride}`]);
    const cols=Math.floor(width/stride),rows=Math.floor(height/stride);
    const count=rows*cols;
    if(cls.length<count||obj.length<count||bbox.length<count*4||kps.length<count*10)throw new Error('YUNET_OUTPUT_SHAPE_INVALID');
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const idx=r*cols+c;
        const score=Math.sqrt(clamp01(cls[idx])*clamp01(obj[idx]));
        if(score<SCORE_THRESHOLD)continue;
        const b=idx*4,k=idx*10;
        const cx=(c+bbox[b])*stride,cy=(r+bbox[b+1])*stride;
        const w=Math.exp(bbox[b+2])*stride,h=Math.exp(bbox[b+3])*stride;
        if(!Number.isFinite(cx)||!Number.isFinite(cy)||!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)continue;
        const candidate={
          x:cx-w*0.5,
          y:cy-h*0.5,
          width:w,
          height:h,
          rightEyeX:(kps[k]+c)*stride,
          rightEyeY:(kps[k+1]+r)*stride,
          leftEyeX:(kps[k+2]+c)*stride,
          leftEyeY:(kps[k+3]+r)*stride,
          noseX:(kps[k+4]+c)*stride,
          noseY:(kps[k+5]+r)*stride,
          rightMouthX:(kps[k+6]+c)*stride,
          rightMouthY:(kps[k+7]+r)*stride,
          leftMouthX:(kps[k+8]+c)*stride,
          leftMouthY:(kps[k+9]+r)*stride,
          confidence:score,
        };
        if(faceGeometryValid(candidate,contentWidth,contentHeight))candidates.push(candidate);
      }
    }
  }
  if(candidates.length===0)return null;
  candidates.sort((a,b)=>b.confidence-a.confidence);
  const limited=candidates.slice(0,TOP_K);
  const kept=[];
  for(const candidate of limited){
    let suppressed=false;
    for(const accepted of kept){
      if(iou(candidate,accepted)>=NMS_THRESHOLD){suppressed=true;break;}
    }
    if(!suppressed)kept.push(candidate);
  }
  return kept[0]||null;
}

function faceGeometryValid(face,contentWidth,contentHeight){
  const {x,y,width:w,height:h}=face;
  if(!Number.isFinite(contentWidth)||!Number.isFinite(contentHeight)||contentWidth<1||contentHeight<1)return false;
  const centerX=x+w*.5,centerY=y+h*.5;
  if(centerX<0||centerY<0||centerX>contentWidth||centerY>contentHeight)return false;
  const visibleW=Math.max(0,Math.min(x+w,contentWidth)-Math.max(x,0));
  const visibleH=Math.max(0,Math.min(y+h,contentHeight)-Math.max(y,0));
  if(visibleW*visibleH<w*h*.72)return false;

  const area=(w*h)/(contentWidth*contentHeight);
  const aspect=w/h;
  if(area<.010||area>.62||aspect<.55||aspect>1.65)return false;

  const points=[
    [face.rightEyeX,face.rightEyeY],[face.leftEyeX,face.leftEyeY],[face.noseX,face.noseY],
    [face.rightMouthX,face.rightMouthY],[face.leftMouthX,face.leftMouthY]
  ];
  if(points.some(([px,py])=>!Number.isFinite(px)||!Number.isFinite(py)))return false;
  const padX=w*.22,padY=h*.22;
  if(points.some(([px,py])=>px<x-padX||px>x+w+padX||py<y-padY||py>y+h+padY))return false;

  const eyeDx=face.leftEyeX-face.rightEyeX,eyeDy=face.leftEyeY-face.rightEyeY;
  const mouthDx=face.leftMouthX-face.rightMouthX,mouthDy=face.leftMouthY-face.rightMouthY;
  const eyeDistance=Math.hypot(eyeDx,eyeDy),mouthDistance=Math.hypot(mouthDx,mouthDy);
  if(eyeDistance<w*.12||eyeDistance>w*.78||mouthDistance<w*.07||mouthDistance>w*.80)return false;

  const eyeY=(face.rightEyeY+face.leftEyeY)*.5;
  const eyeX=(face.rightEyeX+face.leftEyeX)*.5;
  const mouthY=(face.rightMouthY+face.leftMouthY)*.5;
  const mouthX=(face.rightMouthX+face.leftMouthX)*.5;
  if(mouthY-eyeY<h*.07)return false;
  if(face.noseY<eyeY-h*.12||face.noseY>mouthY+h*.18)return false;
  if(Math.abs(face.noseX-eyeX)>w*.42||Math.abs(face.noseX-mouthX)>w*.42)return false;
  if(Math.abs(eyeDy)>h*.40||Math.abs(mouthDy)>h*.45)return false;
  return true;
}

function tensorData(tensor){
  const data=tensor?.data;
  if(!(data instanceof Float32Array))throw new Error('YUNET_OUTPUT_TYPE_INVALID');
  return data;
}
function clamp01(v){return v<0?0:v>1?1:v;}
function iou(a,b){
  const ax2=a.x+a.width,ay2=a.y+a.height,bx2=b.x+b.width,by2=b.y+b.height;
  const iw=Math.max(0,Math.min(ax2,bx2)-Math.max(a.x,b.x));
  const ih=Math.max(0,Math.min(ay2,by2)-Math.max(a.y,b.y));
  const inter=iw*ih;
  const union=a.width*a.height+b.width*b.height-inter;
  return union>0?inter/union:0;
}
async function dispose(){
  const current=session;session=null;backend='uninitialized';tensorScratch=null;
  try{await current?.release?.();}catch{}
  self.close();
}
