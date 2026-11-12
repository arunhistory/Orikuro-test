// 10-5: index.html 内のスクロール処理、main.js 153〜301行と303〜308行を移行。
// メニュー (171〜184行) は共通 menu.ts が担当するため重複させない。
(()=>{
      if('scrollRestoration' in history) history.scrollRestoration='manual';
      if(location.hash){
        history.replaceState(null,'',location.pathname+location.search);
      }
      const forceTop=()=>window.scrollTo(0,0);
      forceTop();
      document.addEventListener('DOMContentLoaded',forceTop,{once:true});
      window.addEventListener('load',()=>{
        forceTop();
        requestAnimationFrame(forceTop);
        setTimeout(forceTop,60);
        setTimeout(forceTop,220);
      },{once:true});
      window.addEventListener('pageshow',()=>{
        forceTop();
        requestAnimationFrame(forceTop);
        setTimeout(forceTop,100);
      });
    })();
const header = document.querySelector<HTMLElement>('.page-header');
const launch = document.querySelector<HTMLElement>('.launch');
const toast = document.querySelector<HTMLElement>('[data-toast]');
let homeToastTimer: ReturnType<typeof setTimeout> | undefined;

/* Normal reloads always start from the hero instead of restoring the last scroll position. */
if('scrollRestoration' in history) history.scrollRestoration='manual';
const forceTop=()=>{
  if(location.hash) return;
  window.scrollTo(0,0);
};
forceTop();
requestAnimationFrame(forceTop);
window.addEventListener('pageshow',()=>{
  forceTop();
  requestAnimationFrame(forceTop);
  setTimeout(forceTop,40);
});

const setHeaderState=()=>header?.classList.toggle('is-scrolled',window.scrollY>24);
setHeaderState();
window.addEventListener('scroll',setHeaderState,{passive:true});


/* Reveal begins when an element reaches the lower 20% of the viewport. */
const revealOptions={threshold:0,rootMargin:'0px 0px -20% 0px'};
const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  });
},revealOptions);

document.querySelectorAll('.reveal').forEach(item=>{
  if(item.closest('.pressure-wall')) return;
  if(item.closest('.pressure-question')) return;
  item.style.transitionDelay='0ms';
  observer.observe(item);
});

/* Information storm: soft first signs, then an accelerating flood of overlapping words. */
const pressureWall=document.querySelector('.pressure-wall');
const stormWords=[...document.querySelectorAll('.pressure-wall .pressure-word.reveal')];
const stormGhosts=[...document.querySelectorAll('.pressure-wall .pressure-ghost')];
const pressureQuestionItems=[...document.querySelectorAll('.pressure-question .reveal')];
const stormOrder=[0,7,14,2,19,10,23,5,17,1,12,21,8,16,4,24,11,6,20,3,15,9,22,13,18];
const stormPace=[0,190,150,115,90,70,55,44,36,30,25,21,18,16,14,13,12,11,10,9,9,8,8,7,7];

stormWords.forEach((item,index)=>{
  const driftX=[-14,10,-8,15,-11,7][index%6];
  const driftY=[24,31,21,28,23,34][index%6];
  const startScale=[.94,.955,.935,.95][index%4];
  item.style.setProperty('opacity','0','important');
  item.style.setProperty('transition','opacity .58s cubic-bezier(.16,1,.3,1), translate .72s cubic-bezier(.16,1,.3,1), scale .72s cubic-bezier(.16,1,.3,1), filter .62s cubic-bezier(.16,1,.3,1)','important');
  item.style.setProperty('transition-delay','0ms','important');
  item.style.setProperty('translate',`${driftX}px ${driftY}px`,'important');
  item.style.setProperty('scale',String(startScale),'important');
  item.style.setProperty('filter','blur(10px)','important');
});

stormGhosts.forEach((ghost,index)=>{
  ghost.style.setProperty('transition','opacity .95s cubic-bezier(.16,1,.3,1)','important');
  ghost.style.setProperty('transition-delay',`${140+index*150}ms`,'important');
});

/* The question belongs to the storm sequence, not the generic scroll reveal. */
pressureQuestionItems.forEach(item=>{
  item.style.setProperty('opacity','0','important');
  item.style.setProperty('transform','translateY(22px)','important');
  item.style.setProperty('filter','blur(8px)','important');
  item.style.setProperty('transition','opacity .92s cubic-bezier(.16,1,.3,1), transform .92s cubic-bezier(.16,1,.3,1), filter .78s cubic-bezier(.16,1,.3,1)','important');
  item.style.setProperty('transition-delay','0ms','important');
});

if(pressureWall){
  const stormObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;

      /* Background information only begins to breathe in after the foreground has started. */
      setTimeout(()=>pressureWall.classList.add('is-active'),180);

      let elapsed=110;
      stormOrder.forEach((wordIndex,sequence)=>{
        const item=stormWords[wordIndex];
        if(!item) return;
        elapsed+=stormPace[sequence]||0;

        /* Stage 1: a faint hint appears, so no word pops into existence. */
        setTimeout(()=>{
          const x=[-5,4,-3,5,-4,3][wordIndex%6];
          const y=[10,13,9,12,10,14][wordIndex%6];
          item.style.setProperty('opacity','0.14','important');
          item.style.setProperty('translate',`${x}px ${y}px`,'important');
          item.style.setProperty('scale','.985','important');
          item.style.setProperty('filter','blur(6px)','important');
        },elapsed);

        /* Stage 2 overlaps the next arrivals and blooms into the final position. */
        setTimeout(()=>{
          item.style.removeProperty('opacity');
          item.classList.add('is-visible');
          item.style.setProperty('translate','0 0','important');
          item.style.setProperty('scale','1','important');
          item.style.setProperty('filter','blur(0)','important');
        },elapsed+110);
      });

      /* 0.3s after the information storm settles, show the lead; 0.2s later show the question. */
      const questionStartsAt=elapsed+110+720+300;
      setTimeout(()=>{
        pressureQuestionItems.forEach((item,index)=>{
          setTimeout(()=>{
            item.classList.add('is-visible');
            item.style.setProperty('opacity','1','important');
            item.style.setProperty('transform','translateY(0)','important');
            item.style.setProperty('filter','blur(0)','important');
          },index*200);
        });
      },questionStartsAt);

      stormObserver.unobserve(pressureWall);
    });
  },revealOptions);
  stormObserver.observe(pressureWall);
}

/* 2027 launch waits until the scene reaches near the visual centre before impact. */
if(launch){
  const launchOptions={threshold:0,rootMargin:'0px 0px -48% 0px'};
  const launchObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      launch.classList.add('is-launch-visible');
      launchObserver.unobserve(launch);
    });
  },launchOptions);
  launchObserver.observe(launch);
}

document.querySelectorAll('[data-placeholder-link]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();
  toast?.classList.add('is-visible');
  clearTimeout(homeToastTimer);
  homeToastTimer=setTimeout(()=>toast?.classList.remove('is-visible'),900);
}));
