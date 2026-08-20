const header=document.querySelector('[data-header]');
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const toast=document.querySelector('[data-toast]');

/*
  Pacing fix:
  - The information wall stays short and dense.
  - The scenes after it get enough screen-time before the next scene appears.
  - Mobile keeps everything readable; impact comes from density, not overlap.
*/
const pacingStyle=document.createElement('style');
pacingStyle.textContent=`
  .hero{min-height:112svh!important}
  .hero-content{min-height:112svh!important;padding-bottom:10svh!important}

  .pressure-wall{
    height:auto!important;
    min-height:94svh!important;
    display:grid!important;
    grid-template-columns:repeat(4,minmax(0,1fr))!important;
    grid-auto-flow:row dense!important;
    align-content:center!important;
    gap:clamp(6px,1.1vw,14px)!important;
    padding:clamp(54px,8vw,110px) var(--pad)!important;
    overflow:hidden!important;
  }
  .pressure-wall .pressure-word{
    position:relative!important;
    inset:auto!important;
    top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;
    width:auto!important;max-width:100%!important;
    margin:0!important;
    white-space:normal!important;
    line-height:.98!important;
    letter-spacing:-.055em!important;
    font-size:clamp(22px,2.7vw,44px)!important;
    transform:none!important;
    opacity:1;
  }
  .pressure-wall .p1,.pressure-wall .p3,.pressure-wall .p5,.pressure-wall .p12,.pressure-wall .p15,.pressure-wall .p24,.pressure-wall .p25{
    grid-column:span 2!important;
    font-size:clamp(31px,4vw,64px)!important;
  }
  .pressure-wall .p10,.pressure-wall .p13,.pressure-wall .p18{font-size:clamp(18px,2.2vw,34px)!important}
  .pressure-wall .p24,.pressure-wall .p25{font-weight:950!important}
  .pressure-ghost{opacity:.55!important;pointer-events:none!important}

  .pressure-question{
    min-height:126svh!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:center!important;
    padding-top:24svh!important;
    padding-bottom:24svh!important;
  }
  .service-rush{
    min-height:116svh!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:center!important;
    padding-top:18svh!important;
    padding-bottom:18svh!important;
  }
  .service-note{padding-bottom:18svh!important}
  .pressure-close{
    min-height:150svh!important;
    margin-top:0!important;
    padding-top:26svh!important;
    padding-bottom:26svh!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:center!important;
  }
  .pressure-fact{margin-bottom:18svh!important}
  .answer-line{margin-top:14svh!important}
  .launch{min-height:128svh!important}
  .launch-space{height:52vh!important}
  .link-zone-head{min-height:100svh!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
  .route-card{min-height:64svh!important}

  @media(max-width:820px){
    .hero{min-height:118svh!important}
    .hero-content{min-height:118svh!important}
    .pressure-wall{
      min-height:98svh!important;
      grid-template-columns:repeat(3,minmax(0,1fr))!important;
      gap:7px 8px!important;
      padding:58px 16px!important;
    }
    .pressure-wall .pressure-word{
      font-size:clamp(17px,5.1vw,25px)!important;
      line-height:1.02!important;
    }
    .pressure-wall .p1,.pressure-wall .p3,.pressure-wall .p5,.pressure-wall .p12,.pressure-wall .p15,.pressure-wall .p24,.pressure-wall .p25{
      grid-column:span 2!important;
      font-size:clamp(24px,7.3vw,36px)!important;
    }
    .pressure-wall .p10,.pressure-wall .p13,.pressure-wall .p18{font-size:clamp(15px,4.4vw,21px)!important}
    .pressure-wall .p2,.pressure-wall .p6,.pressure-wall .p9,.pressure-wall .p14,.pressure-wall .p17,.pressure-wall .p21{text-align:right!important}
    .pressure-wall .p4,.pressure-wall .p8,.pressure-wall .p11,.pressure-wall .p16,.pressure-wall .p20,.pressure-wall .p23{text-align:center!important}
    .pressure-ghost{font-size:clamp(70px,21vw,130px)!important;opacity:.28!important}

    .pressure-question{min-height:132svh!important;padding-top:27svh!important;padding-bottom:27svh!important}
    .service-rush{min-height:122svh!important;padding:22svh var(--pad)!important}
    .service-rush-line{
      width:auto!important;max-width:100%!important;
      white-space:normal!important;flex-wrap:wrap!important;
      gap:12px 14px!important;padding:0!important;
      animation:none!important;transform:none!important;
    }
    .service-rush-line span{font-size:clamp(26px,7vw,42px)!important}
    .service-rush-line i{font-size:clamp(18px,5vw,28px)!important}
    .rush-b{margin-top:28px!important}
    .service-note{padding:28px var(--pad) 20svh!important}
    .pressure-close{min-height:158svh!important;padding-top:30svh!important;padding-bottom:28svh!important}
    .pressure-fact{margin-bottom:22svh!important}
    .answer-line{margin-top:16svh!important}
    .launch{min-height:138svh!important}
    .launch-space{height:62vh!important}
    .link-zone-head{min-height:108svh!important}
    .route-card{min-height:70svh!important}
  }
`;
document.head.appendChild(pacingStyle);

const setHeaderState=()=>header?.classList.toggle('is-scrolled',window.scrollY>24);
setHeaderState();
window.addEventListener('scroll',setHeaderState,{passive:true});

menuButton?.addEventListener('click',()=>{
  const open=menuButton.classList.toggle('is-open');
  mobileMenu?.classList.toggle('is-open',open);
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');
});

mobileMenu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{
  menuButton?.classList.remove('is-open');
  mobileMenu?.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded','false');
}));

const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
},{
  threshold:.1,
  rootMargin:'0px 0px -55% 0px'
});

document.querySelectorAll('.reveal').forEach(item=>{
  item.style.transitionDelay='0ms';
  observer.observe(item);
});

/* The wall arrives as a quick burst, not a long checklist. */
document.querySelectorAll('.pressure-wall .pressure-word.reveal').forEach((item,index)=>{
  item.style.transitionDelay=`${Math.min(index*16,260)}ms`;
});

document.querySelectorAll('[data-placeholder-link]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();
  toast?.classList.add('is-visible');
  clearTimeout(window.__ocToastTimer);
  window.__ocToastTimer=setTimeout(()=>toast?.classList.remove('is-visible'),1800);
}));
