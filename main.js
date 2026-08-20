const header=document.querySelector('[data-header]');
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const toast=document.querySelector('[data-toast]');

/*
  Scene pacing:
  dense intro = short and readable
  following scenes = enough breathing room, without stretching the whole page
*/
const pacingStyle=document.createElement('style');
pacingStyle.textContent=`
  .hero{min-height:106svh!important}
  .hero-content{min-height:106svh!important;padding-bottom:8svh!important}

  .pressure-wall{
    position:relative!important;
    height:auto!important;
    min-height:100svh!important;
    display:flex!important;
    flex-wrap:wrap!important;
    align-content:center!important;
    align-items:baseline!important;
    justify-content:flex-start!important;
    gap:clamp(7px,1.3vw,16px) clamp(12px,2vw,28px)!important;
    padding:clamp(74px,10vw,130px) var(--pad)!important;
    overflow:visible!important;
  }
  .pressure-wall .pressure-word{
    position:static!important;
    inset:auto!important;
    top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;
    display:inline-block!important;
    width:auto!important;
    max-width:none!important;
    margin:0!important;
    white-space:nowrap!important;
    line-height:1!important;
    letter-spacing:-.055em!important;
    font-size:clamp(22px,3vw,46px)!important;
    transform:none!important;
    opacity:1!important;
  }
  .pressure-wall .p1,.pressure-wall .p3,.pressure-wall .p5,.pressure-wall .p12,.pressure-wall .p15{
    font-size:clamp(32px,4.5vw,70px)!important;
    font-weight:950!important;
  }
  .pressure-wall .p24,.pressure-wall .p25{
    font-size:clamp(36px,5vw,78px)!important;
    font-weight:950!important;
  }
  .pressure-wall .p10,.pressure-wall .p13,.pressure-wall .p18{
    font-size:clamp(19px,2.5vw,36px)!important;
  }
  .pressure-ghost{display:none!important}

  .pressure-question{
    min-height:112svh!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:center!important;
    padding-top:22svh!important;
    padding-bottom:22svh!important;
  }
  .service-rush{
    min-height:104svh!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:center!important;
    padding-top:16svh!important;
    padding-bottom:16svh!important;
  }
  .service-note{padding-bottom:12svh!important}
  .pressure-close{
    min-height:118svh!important;
    margin-top:0!important;
    padding-top:24svh!important;
    padding-bottom:22svh!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:center!important;
  }
  .pressure-fact{margin-bottom:14svh!important}
  .answer-line{margin-top:11svh!important}
  .launch{min-height:116svh!important}
  .launch-space{height:44vh!important}
  .link-zone-head{min-height:92svh!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
  .route-card{min-height:50svh!important}

  @media(max-width:820px){
    .hero{min-height:108svh!important}
    .hero-content{min-height:108svh!important}

    .pressure-wall{
      min-height:100svh!important;
      gap:8px 11px!important;
      padding:78px 18px 62px!important;
      align-content:center!important;
    }
    .pressure-wall .pressure-word{
      font-size:clamp(18px,5.25vw,25px)!important;
      line-height:1.03!important;
    }
    .pressure-wall .p1,.pressure-wall .p3,.pressure-wall .p5,.pressure-wall .p12,.pressure-wall .p15{
      font-size:clamp(25px,7.2vw,34px)!important;
    }
    .pressure-wall .p24,.pressure-wall .p25{
      font-size:clamp(29px,8.2vw,39px)!important;
      width:100%!important;
    }
    .pressure-wall .p10,.pressure-wall .p13,.pressure-wall .p18{
      font-size:clamp(16px,4.5vw,21px)!important;
    }

    .pressure-question{
      min-height:112svh!important;
      padding-top:25svh!important;
      padding-bottom:25svh!important;
    }
    .service-rush{
      min-height:104svh!important;
      padding:18svh var(--pad)!important;
    }
    .service-rush-line{
      width:auto!important;
      max-width:100%!important;
      white-space:normal!important;
      flex-wrap:wrap!important;
      gap:11px 13px!important;
      padding:0!important;
      animation:none!important;
      transform:none!important;
    }
    .service-rush-line span{font-size:clamp(25px,6.8vw,38px)!important}
    .service-rush-line i{font-size:clamp(17px,4.7vw,25px)!important}
    .rush-b{margin-top:25px!important}
    .service-note{padding:26px var(--pad) 12svh!important}

    .pressure-close{
      min-height:120svh!important;
      padding-top:25svh!important;
      padding-bottom:23svh!important;
    }
    .pressure-fact{margin-bottom:15svh!important}
    .answer-line{margin-top:12svh!important}
    .launch{min-height:118svh!important}
    .launch-space{height:48vh!important}
    .link-zone-head{min-height:94svh!important}
    .route-card{min-height:54svh!important}
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
},{threshold:.1,rootMargin:'0px 0px -60% 0px'});

document.querySelectorAll('.reveal').forEach(item=>{
  item.style.transitionDelay='0ms';
  observer.observe(item);
});

/* Dense burst: fast, but not simultaneous. */
document.querySelectorAll('.pressure-wall .pressure-word.reveal').forEach((item,index)=>{
  item.style.transitionDelay=`${Math.min(index*14,220)}ms`;
});

document.querySelectorAll('[data-placeholder-link]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();
  toast?.classList.add('is-visible');
  clearTimeout(window.__ocToastTimer);
  window.__ocToastTimer=setTimeout(()=>toast?.classList.remove('is-visible'),1800);
}));
