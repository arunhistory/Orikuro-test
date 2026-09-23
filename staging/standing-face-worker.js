/* YuNet provider worker. Raw camera pixels never leave this worker/provider path. */
const ORT_DIST='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const ORT_SCRIPT=ORT_DIST+'ort.webgpu.min.js';
const YUNET_MODEL='https://media.githubusercontent.com/media/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/face_detection_yunet_2026may.onnx';
const STRIDES=[8,16,32];
const SCORE_THRESHOLD=0.40;
const NMS_THRESHOLD=0.30;
const TOP_K=500;
let session=null;
let inputName='input';
let backend='uninitialized';
let initPromise=null;

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
      if(typeof self.ort==='undefined')importScripts(ORT_SCRIPT);
      if(typeof self.ort==='undefined')throw new Error('ORT_LOAD_FAILED');
      ort.env.wasm.wasmPaths=ORT_DIST;
      ort.env.wasm.numThreads=1;
      const canWebGPU=!!self.navigator?.gpu;
      if(canWebGPU){
        try{
          session=await ort.InferenceSession.create(YUNET_MODEL,{executionProviders:['webgpu','wasm'],graphOptimizationLevel:'all'});
          backend='webgpu';
        }catch{
          session=null;
        }
      }
      if(!session){
        session=await ort.InferenceSession.create(YUNET_MODEL,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
        backend='wasm';
      }
      inputName=session.inputNames?.[0]||'input';
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
    const tensorData=rgbaToBgrNchw(rgba,width,height);
    const tensor=new ort.Tensor('float32',tensorData,[1,3,height,width]);
    const output=await active.run({[inputName]:tensor});
    const detection=decodeBest(output,width,height);
    self.postMessage({type:'result',frameId,timestampNS,width,height,contentWidth,contentHeight,detection,backend});
  }catch(error){
    self.postMessage({type:'frame-error',frameId,timestampNS,code:error instanceof Error?error.message:'FACE_PROVIDER_INFER_FAILED'});
  }
}

function rgbaToBgrNchw(rgba,width,height){
  const pixels=width*height;
  const out=new Float32Array(pixels*3);
  for(let i=0,p=0;i<pixels;i++,p+=4){
    out[i]=rgba[p+2];
    out[pixels+i]=rgba[p+1];
    out[pixels*2+i]=rgba[p];
  }
  return out;
}

function decodeBest(output,width,height){
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
        candidates.push({
          x:cx-w*0.5,
          y:cy-h*0.5,
          width:w,
          height:h,
          rightEyeX:(kps[k]+c)*stride,
          rightEyeY:(kps[k+1]+r)*stride,
          leftEyeX:(kps[k+2]+c)*stride,
          leftEyeY:(kps[k+3]+r)*stride,
          confidence:score,
        });
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
  const current=session;session=null;backend='uninitialized';
  try{await current?.release?.();}catch{}
  self.close();
}
