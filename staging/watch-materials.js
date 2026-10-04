const DEFAULT_DURATION_MS=7000;
const MIN_DURATION_MS=3000;
const MAX_DURATION_MS=20000;

export const WATCH_MATERIALS=Object.freeze([
  Object.freeze({
    id:"oc-brand",
    variant:"brand",
    kicker:"ORIGINAL CREATE",
    title:"自由をカタチに",
    copy:"Original Create Project",
    image:"./assets/oc-symbol-user.jpg",
    durationMs:7000
  }),
  Object.freeze({
    id:"viewer-test",
    variant:"signal",
    kicker:"VIEWER TEST",
    title:"視聴画面テスト",
    copy:"作成済み素材を自動で切り替えながら表示しています。",
    image:"./assets/oc-symbol-user.jpg",
    durationMs:6500
  }),
  Object.freeze({
    id:"launch-2027",
    variant:"launch",
    kicker:"ORIGINAL CREATE PROJECT",
    title:"2027 START",
    copy:"配信・創作・交流をひとつの場所へ。",
    image:"./assets/oc-symbol-user.jpg",
    durationMs:7500
  })
]);

function randomIndex(max){
  if(max<=1)return 0;
  if(globalThis.crypto?.getRandomValues){
    const buf=new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0]%max;
  }
  return Math.floor(Math.random()*max);
}

function shuffledIndices(length,lastIndex){
  const values=Array.from({length},(_,i)=>i);
  for(let i=values.length-1;i>0;i--){
    const j=randomIndex(i+1);
    [values[i],values[j]]=[values[j],values[i]];
  }
  if(values.length>1&&values[0]===lastIndex){
    const swap=1+randomIndex(values.length-1);
    [values[0],values[swap]]=[values[swap],values[0]];
  }
  return values;
}

function durationOf(material){
  const raw=Number(material?.durationMs);
  if(!Number.isFinite(raw))return DEFAULT_DURATION_MS;
  return Math.max(MIN_DURATION_MS,Math.min(MAX_DURATION_MS,Math.trunc(raw)));
}

export class WatchMaterialPlayer{
  constructor(stage,progress,status,materials=WATCH_MATERIALS){
    if(!(stage instanceof HTMLElement))throw new Error("WATCH_MATERIAL_STAGE_MISSING");
    this.stage=stage;
    this.progress=progress instanceof HTMLElement?progress:null;
    this.status=status instanceof HTMLElement?status:null;
    this.materials=Array.isArray(materials)?materials.filter(Boolean):[];
    if(this.materials.length===0)throw new Error("WATCH_MATERIALS_EMPTY");
    this.cards=[];
    this.order=[];
    this.orderPosition=0;
    this.lastIndex=-1;
    this.timer=null;
    this.running=false;
    this.currentIndex=-1;
    this.build();
    this.visibilityHandler=()=>this.onVisibility();
    document.addEventListener("visibilitychange",this.visibilityHandler);
  }

  build(){
    this.stage.replaceChildren();
    const fragment=document.createDocumentFragment();
    this.materials.forEach((material,index)=>{
      const card=document.createElement("article");
      card.className="watch-material";
      card.dataset.materialIndex=String(index);
      card.dataset.variant=typeof material.variant==="string"?material.variant:"brand";
      card.setAttribute("aria-hidden","true");

      const body=document.createElement("div");
      body.className="watch-material-card";

      if(typeof material.image==="string"&&material.image){
        const image=document.createElement("img");
        image.className="watch-material-logo";
        image.src=material.image;
        image.alt="";
        image.decoding="async";
        body.append(image);
      }

      const kicker=document.createElement("p");
      kicker.className="watch-material-kicker";
      kicker.textContent=String(material.kicker||"ORIGINAL CREATE");
      body.append(kicker);

      const title=document.createElement("h1");
      title.className="watch-material-title";
      title.textContent=String(material.title||"Original Create");
      body.append(title);

      const copy=document.createElement("p");
      copy.className="watch-material-copy";
      copy.textContent=String(material.copy||"");
      body.append(copy);

      card.append(body);
      fragment.append(card);
      this.cards.push(card);
    });
    this.stage.append(fragment);
  }

  start(){
    if(this.running)return;
    this.running=true;
    this.next();
  }

  stop(){
    this.running=false;
    if(this.timer!==null){
      clearTimeout(this.timer);
      this.timer=null;
    }
    if(this.progress)this.progress.classList.remove("is-running");
  }

  destroy(){
    this.stop();
    document.removeEventListener("visibilitychange",this.visibilityHandler);
  }

  next(){
    if(!this.running||document.hidden)return;
    if(this.orderPosition>=this.order.length){
      this.order=shuffledIndices(this.materials.length,this.lastIndex);
      this.orderPosition=0;
    }
    const index=this.order[this.orderPosition++];
    this.show(index);
  }

  show(index){
    if(!Number.isInteger(index)||index<0||index>=this.materials.length)return;
    for(let i=0;i<this.cards.length;i++){
      const active=i===index;
      this.cards[i].classList.toggle("is-active",active);
      this.cards[i].setAttribute("aria-hidden",active?"false":"true");
    }
    this.currentIndex=index;
    this.lastIndex=index;
    const material=this.materials[index];
    const duration=durationOf(material);
    if(this.status)this.status.textContent="自動素材配信";
    if(this.progress){
      this.progress.style.setProperty("--watch-material-duration",duration+"ms");
      this.progress.classList.remove("is-running");
      void this.progress.offsetWidth;
      this.progress.classList.add("is-running");
    }
    if(this.timer!==null)clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;this.next();},duration);
  }

  onVisibility(){
    if(!this.running)return;
    if(document.hidden){
      if(this.timer!==null){
        clearTimeout(this.timer);
        this.timer=null;
      }
      if(this.progress)this.progress.classList.remove("is-running");
      return;
    }
    this.next();
  }
}
