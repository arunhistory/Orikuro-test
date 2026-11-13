const canvas=document.querySelector("[data-visual-canvas]");
const ctx=canvas.getContext("2d",{alpha:true});
const readouts={
  name:document.querySelector("[data-test-name]"),
  confidence:document.querySelector("[data-confidence]"),
  yaw:document.querySelector("[data-yaw]"),
  pitch:document.querySelector("[data-pitch]"),
  depth:document.querySelector("[data-depth]"),
  lod:document.querySelector("[data-lod]"),
};
const playButton=document.querySelector("[data-play-toggle]");
const skeletonToggle=document.querySelector("[data-skeleton-toggle]");
const scenarioButtons=[...document.querySelectorAll("[data-scenario]")];

const scenarioNames={follow:"通常追従",head:"頭部回転",depth:"前後・視差",lost:"Lost→再捕捉",lod:"LOD 0→5→0"};
let scenario="follow";
let playing=true;
let hiddenPaused=false;
let started=performance.now();
let last=started;
let phaseTime=0;
let raf=0;

const state={
  x:0,y:0,z:0,yaw:0,pitch:0,roll:0,
  leftArm:-12,rightArm:12,
  confidence:1,lost:false,lod:0,
  idle:0,hair:0,
};
const held={...state};

function resize(){
  const rect=canvas.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*dpr));
  const height=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==width||canvas.height!==height){
    canvas.width=width;canvas.height=height;
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function ease(t){t=clamp(t,0,1);return t*t*(3-2*t)}

function targetFor(t){
  const s={x:0,y:0,z:0,yaw:0,pitch:0,roll:0,leftArm:-12,rightArm:12,confidence:1,lost:false,lod:0,idle:0,hair:0};
  if(scenario==="follow"){
    s.x=Math.sin(t*.85)*.028;
    s.y=Math.sin(t*1.15)*.009;
    s.yaw=Math.sin(t*.72)*10;
    s.pitch=Math.sin(t*.54)*5.5;
    s.roll=Math.sin(t*.63)*7;
    s.leftArm=-12+Math.sin(t*.93)*32;
    s.rightArm=12-Math.sin(t*.87+1.1)*30;
    s.hair=Math.sin(t*2.1)*1;
  }else if(scenario==="head"){
    s.yaw=Math.sin(t*.72)*18;
    s.pitch=Math.sin(t*.51)*14;
    s.roll=Math.sin(t*.43)*24;
    s.x=Math.sin(t*.55)*.012;
    s.hair=Math.sin(t*1.8)*.7;
  }else if(scenario==="depth"){
    s.x=Math.sin(t*.8)*.04;
    s.y=Math.sin(t*.66)*.012;
    s.z=Math.sin(t*.52)*.08;
    s.yaw=Math.sin(t*.7)*8;
    s.hair=Math.sin(t*2.2)*.8;
  }else if(scenario==="lost"){
    const c=t%6;
    if(c<2){
      s.x=Math.sin(t)*.022;s.yaw=Math.sin(t*.9)*8;s.leftArm=-5;s.rightArm=20;s.hair=Math.sin(t*2)*.8;
    }else if(c<2.35){
      Object.assign(s,held);
      s.confidence=.22;s.lost=true;
    }else if(c<3.2){
      const k=ease((c-2.35)/.85);
      Object.assign(s,held);
      s.confidence=.22;s.lost=true;
      s.x=lerp(held.x,0,k);s.y=lerp(held.y,0,k);s.yaw=lerp(held.yaw,0,k);s.pitch=lerp(held.pitch,0,k);s.roll=lerp(held.roll,0,k);
      s.leftArm=lerp(held.leftArm,-12,k);s.rightArm=lerp(held.rightArm,12,k);s.idle=k;
    }else if(c<3.5){
      const k=ease((c-3.2)/.3);
      s.confidence=lerp(.45,1,k);
      s.x=lerp(0,.018,k);s.yaw=lerp(0,-7,k);s.leftArm=lerp(-12,8,k);s.rightArm=lerp(12,-5,k);
    }else{
      s.x=Math.sin(t*.9)*.02;s.yaw=Math.sin(t*.75)*8;s.leftArm=-12+Math.sin(t)*20;s.rightArm=12-Math.sin(t*.9)*20;s.hair=Math.sin(t*2.1)*.8;
    }
  }else if(scenario==="lod"){
    const c=t%8;
    s.x=Math.sin(t*.7)*.025;s.yaw=Math.sin(t*.62)*9;
    if(c<2)s.lod=0;
    else if(c<4)s.lod=Math.min(5,Math.floor((c-2)/.4)+1);
    else if(c<6)s.lod=5;
    else s.lod=Math.max(0,5-Math.floor((c-6)/.4)-1);
    const secondary=1-s.lod*.13;
    s.leftArm=-12+Math.sin(t*.9)*22;s.rightArm=12-Math.sin(t*.85)*22;s.hair=Math.sin(t*2.1)*secondary;
  }
  return s;
}

function applyTarget(target,dt){
  const smoothing=1-Math.exp(-dt*12);
  for(const key of ["x","y","z","yaw","pitch","roll","leftArm","rightArm","idle","hair"]){
    state[key]=lerp(state[key],target[key],smoothing);
  }
  state.confidence=target.confidence;
  state.lost=target.lost;
  state.lod=target.lod;
  if(!target.lost)Object.assign(held,state);
}

function color(alpha=1){return `rgba(240,242,255,${alpha})`}
function line(x1,y1,x2,y2,width=5,stroke=color(.9)){
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=width;ctx.lineCap="round";ctx.strokeStyle=stroke;ctx.stroke();
}
function ellipse(x,y,rx,ry,fill,rotation=0){
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
}
function roundRect(x,y,w,h,r,fill){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
}

function draw(){
  resize();
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);

  const H=Math.min(h*.62,w*.92);
  const scale=H/300;
  const centerX=w*.5+state.x*H;
  const baseY=h*.80+state.y*H;
  const depthScale=1+clamp(state.z,-.08,.08);
  const bodyScale=scale*depthScale;
  const rootDx=state.x*H;

  // Adopted visual parallax factors: back 0.82, body 0.96, face 1.00, front 1.08.
  const backX=centerX-rootDx+rootDx*.82;
  const bodyX=centerX-rootDx+rootDx*.96;
  const faceX=centerX;
  const frontX=centerX-rootDx+rootDx*1.08;

  const pelvisY=baseY-78*bodyScale;
  const chestY=pelvisY-66*bodyScale;
  const neckY=chestY-22*bodyScale;
  const headY=neckY-31*bodyScale;
  const shoulderSpread=44*bodyScale;
  const upper=43*bodyScale,fore=40*bodyScale,hand=17*bodyScale;

  // Back hair and back accessory.
  ctx.save();
  ctx.translate(backX,headY+18*bodyScale);
  ctx.rotate((state.roll*.45+state.hair*3)*Math.PI/180);
  ellipse(0,18*bodyScale,35*bodyScale,57*bodyScale,"rgba(79,60,127,.96)");
  ctx.restore();

  // Torso/body.
  ctx.save();
  ctx.translate(bodyX,chestY+43*bodyScale);
  ctx.rotate(state.roll*.25*Math.PI/180);
  roundRect(-31*bodyScale,-36*bodyScale,62*bodyScale,90*bodyScale,18*bodyScale,"rgba(105,118,190,.97)");
  roundRect(-25*bodyScale,42*bodyScale,50*bodyScale,56*bodyScale,16*bodyScale,"rgba(75,84,145,.97)");
  ctx.restore();

  // Arms: renderer-facing body motion preview.
  const shoulderLY=chestY-2*bodyScale, shoulderRY=shoulderLY;
  const shoulderLX=bodyX-shoulderSpread, shoulderRX=bodyX+shoulderSpread;
  const aL=(105+state.leftArm)*Math.PI/180;
  const aR=(75+state.rightArm)*Math.PI/180;
  const elbowLX=shoulderLX+Math.cos(aL)*upper, elbowLY=shoulderLY+Math.sin(aL)*upper;
  const elbowRX=shoulderRX+Math.cos(aR)*upper, elbowRY=shoulderRY+Math.sin(aR)*upper;
  const foreL=aL+.28+Math.sin(phaseTime*.8)*.06;
  const foreR=aR-.28-Math.sin(phaseTime*.75)*.06;
  const wristLX=elbowLX+Math.cos(foreL)*fore, wristLY=elbowLY+Math.sin(foreL)*fore;
  const wristRX=elbowRX+Math.cos(foreR)*fore, wristRY=elbowRY+Math.sin(foreR)*fore;
  line(shoulderLX,shoulderLY,elbowLX,elbowLY,15*bodyScale,"rgba(118,132,204,.98)");
  line(elbowLX,elbowLY,wristLX,wristLY,13*bodyScale,"rgba(118,132,204,.98)");
  line(shoulderRX,shoulderRY,elbowRX,elbowRY,15*bodyScale,"rgba(118,132,204,.98)");
  line(elbowRX,elbowRY,wristRX,wristRY,13*bodyScale,"rgba(118,132,204,.98)");
  ellipse(wristLX+Math.cos(foreL)*hand*.45,wristLY+Math.sin(foreL)*hand*.45,7*bodyScale,10*bodyScale,"rgba(246,211,206,.98)",foreL);
  ellipse(wristRX+Math.cos(foreR)*hand*.45,wristRY+Math.sin(foreR)*hand*.45,7*bodyScale,10*bodyScale,"rgba(246,211,206,.98)",foreR);

  // FaceSurface: only whole-surface projection/rigid transform. Eyes/mouth below never move locally.
  const yawCompression=1-clamp(Math.abs(state.yaw)/18,0,1)*.06;
  const pitchCompression=1-clamp(Math.abs(state.pitch)/14,0,1)*.04;
  ctx.save();
  ctx.translate(faceX+state.yaw*.12*bodyScale,headY+state.pitch*.08*bodyScale);
  ctx.rotate(state.roll*Math.PI/180);
  ctx.scale(yawCompression,pitchCompression);
  ellipse(0,0,27*bodyScale,34*bodyScale,"rgba(250,222,217,.99)");
  // Fixed internal face artwork.
  ellipse(-9*bodyScale,-3*bodyScale,3.2*bodyScale,4.2*bodyScale,"rgba(49,39,67,.94)");
  ellipse(9*bodyScale,-3*bodyScale,3.2*bodyScale,4.2*bodyScale,"rgba(49,39,67,.94)");
  line(-5*bodyScale,12*bodyScale,5*bodyScale,12*bodyScale,1.8*bodyScale,"rgba(122,70,86,.82)");
  ctx.restore();

  // Front hair parallax.
  ctx.save();
  ctx.translate(frontX+state.yaw*.10*bodyScale,headY-6*bodyScale);
  ctx.rotate((state.roll*.7-state.hair*2.2)*Math.PI/180);
  ctx.fillStyle="rgba(109,82,167,.98)";
  ctx.beginPath();
  ctx.moveTo(-28*bodyScale,-22*bodyScale);
  ctx.quadraticCurveTo(0,-47*bodyScale,29*bodyScale,-19*bodyScale);
  ctx.lineTo(21*bodyScale,4*bodyScale);
  ctx.quadraticCurveTo(7*bodyScale,-8*bodyScale,0,4*bodyScale);
  ctx.quadraticCurveTo(-10*bodyScale,-9*bodyScale,-23*bodyScale,5*bodyScale);
  ctx.closePath();ctx.fill();
  ctx.restore();

  if(skeletonToggle.checked){
    ctx.save();
    ctx.strokeStyle="rgba(99,225,190,.92)";
    ctx.fillStyle="rgba(99,225,190,.98)";
    ctx.lineWidth=1.4;
    const joints=[
      [bodyX,pelvisY],[bodyX,chestY],[bodyX,neckY],[faceX,headY],
      [shoulderLX,shoulderLY],[elbowLX,elbowLY],[wristLX,wristLY],
      [shoulderRX,shoulderRY],[elbowRX,elbowRY],[wristRX,wristRY],
    ];
    line(bodyX,pelvisY,bodyX,chestY,1.4,"rgba(99,225,190,.92)");
    line(bodyX,chestY,bodyX,neckY,1.4,"rgba(99,225,190,.92)");
    line(bodyX,neckY,faceX,headY,1.4,"rgba(99,225,190,.92)");
    line(bodyX,chestY,shoulderLX,shoulderLY,1.4,"rgba(99,225,190,.92)");
    line(shoulderLX,shoulderLY,elbowLX,elbowLY,1.4,"rgba(99,225,190,.92)");
    line(elbowLX,elbowLY,wristLX,wristLY,1.4,"rgba(99,225,190,.92)");
    line(bodyX,chestY,shoulderRX,shoulderRY,1.4,"rgba(99,225,190,.92)");
    line(shoulderRX,shoulderRY,elbowRX,elbowRY,1.4,"rgba(99,225,190,.92)");
    line(elbowRX,elbowRY,wristRX,wristRY,1.4,"rgba(99,225,190,.92)");
    for(const [x,y] of joints)ellipse(x,y,2.6,2.6,"rgba(99,225,190,.98)");
    ctx.restore();
  }

  if(state.lost){
    ctx.fillStyle="rgba(255,188,94,.95)";
    ctx.font="900 11px -apple-system,BlinkMacSystemFont,sans-serif";
    ctx.textAlign="center";
    ctx.fillText("TRACKING LOST / HOLD → IDLE",w*.5,h*.12);
  }

  readouts.name.textContent=scenarioNames[scenario];
  readouts.confidence.textContent=state.confidence.toFixed(2);
  readouts.yaw.textContent=`${state.yaw.toFixed(1)}°`;
  readouts.pitch.textContent=`${state.pitch.toFixed(1)}°`;
  readouts.depth.textContent=`${state.z.toFixed(3)}H`;
  readouts.lod.textContent=String(state.lod);
}

function tick(now){
  raf=0;
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));
  last=now;
  if(playing){
    phaseTime+=(now-started)/1000-(phaseTime||0);
    started=now-phaseTime*1000;
    const target=targetFor(phaseTime);
    applyTarget(target,dt);
  }
  draw();
  if(playing&&!document.hidden)raf=requestAnimationFrame(tick);
}
function schedule(){
  if(raf||document.hidden)return;
  last=performance.now();
  raf=requestAnimationFrame(tick);
}
function selectScenario(next){
  if(!scenarioNames[next])return;
  scenario=next;phaseTime=0;started=performance.now();last=started;
  Object.assign(state,{x:0,y:0,z:0,yaw:0,pitch:0,roll:0,leftArm:-12,rightArm:12,confidence:1,lost:false,lod:0,idle:0,hair:0});
  Object.assign(held,state);
  scenarioButtons.forEach(button=>button.classList.toggle("is-active",button.dataset.scenario===scenario));
  draw();schedule();
}
scenarioButtons.forEach(button=>button.addEventListener("click",()=>selectScenario(button.dataset.scenario)));
playButton.addEventListener("click",()=>{
  playing=!playing;
  playButton.textContent=playing?"一時停止":"再生";
  if(playing){started=performance.now()-phaseTime*1000;schedule();}
  else if(raf){cancelAnimationFrame(raf);raf=0;draw();}
});
skeletonToggle.addEventListener("change",draw);
window.addEventListener("resize",draw,{passive:true});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    hiddenPaused=playing;
    if(raf){cancelAnimationFrame(raf);raf=0;}
  }else if(hiddenPaused&&playing){
    started=performance.now()-phaseTime*1000;
    hiddenPaused=false;schedule();
  }
});
resize();draw();schedule();
