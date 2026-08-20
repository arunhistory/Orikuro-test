const header=document.querySelector('[data-header]');
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const toast=document.querySelector('[data-toast]');

const pacingStyle=document.createElement('style');
pacingStyle.textContent=`
  .reveal{
    opacity:0;
    transform:translateY(12px)!important;
    transition:opacity .22s ease-out,transform .22s ease-out!important;
  }
  .reveal.is-visible{opacity:1;transform:none!important}
  .hero .reveal{opacity:1!important;transform:none!important;transition:none!important}
  .pressure-wall .pressure-word.reveal{opacity:0!important}
  .pressure-wall .pressure-word.reveal.is-visible{opacity:1!important}
  .pressure-wall .p22.reveal.is-visible,.pressure-wall .p23.reveal.is-visible{opacity:.72!important}
  .pressure-ghost{opacity:0!important;transition:opacity .16s ease-out!important}
  .pressure-wall.is-active .pressure-ghost{opacity:1!important}
  .site-header,.menu-button span,.desktop-nav a,.round-link,.route-card,.route-card:before,.service-cloud span{transition-duration:.16s!important}

  .hero{min-height:106svh!important}
  .hero-content{min-height:106svh!important;padding-bottom:8svh!important}

  .pressure-wall{
    position:relative!important;
    height:100svh!important;
    min-height:680px!important;
    display:block!important;
    padding:0!important;
    overflow:hidden!important;
    isolation:isolate!important;
  }
  .pressure-wall .pressure-word{
    position:absolute!important;
    display:block!important;
    width:max-content!important;
    max-width:88vw!important;
    margin:0!important;
    white-space:nowrap!important;
    line-height:.88!important;
    letter-spacing:-.07em!important;
    font-weight:950!important;
    transform-origin:center!important;
  }
  .pressure-ghost{
    display:block!important;
    position:absolute!important;
    margin:0!important;
    font-weight:950!important;
    letter-spacing:-.08em!important;
    white-space:nowrap!important;
    color:rgba(0,0,0,.035)!important;
    pointer-events:none!important;
    z-index:0!important;
  }
  .g1{top:17%!important;left:-3%!important;font-size:clamp(90px,16vw,240px)!important;transform:rotate(-4deg)!important}
  .g2{top:44%!important;right:-9%!important;font-size:clamp(110px,19vw,290px)!important;transform:rotate(3deg)!important}
  .g3{top:68%!important;left:12%!important;font-size:clamp(100px,18vw,270px)!important;transform:rotate(-2deg)!important}

  .p1{top:8%!important;left:4%!important;font-size:clamp(42px,7vw,104px)!important;z-index:3!important;transform:rotate(-1deg)!important}
  .p2{top:13%!important;right:7%!important;font-size:clamp(28px,4.4vw,68px)!important;z-index:2!important;transform:rotate(1deg)!important}
  .p3{top:20%!important;left:23%!important;font-size:clamp(46px,7.8vw,116px)!important;z-index:4!important;transform:rotate(.5deg)!important}
  .p4{top:27%!important;left:5%!important;font-size:clamp(30px,5vw,74px)!important;z-index:2!important}
  .p5{top:24%!important;right:5%!important;font-size:clamp(40px,6.5vw,96px)!important;z-index:3!important;transform:rotate(-1.5deg)!important}
  .p6{top:34%!important;left:37%!important;font-size:clamp(34px,5.5vw,82px)!important;z-index:4!important}
  .p7{top:38%!important;left:3%!important;font-size:clamp(30px,5vw,76px)!important;z-index:3!important;transform:rotate(1deg)!important}
  .p8{top:39%!important;right:3%!important;font-size:clamp(38px,6vw,92px)!important;z-index:2!important;transform:rotate(-1deg)!important}
  .p9{top:47%!important;left:20%!important;font-size:clamp(43px,7vw,104px)!important;z-index:5!important}
  .p10{top:51%!important;right:8%!important;font-size:clamp(24px,3.8vw,58px)!important;z-index:2!important;transform:rotate(1.5deg)!important}
  .p11{top:56%!important;left:4%!important;font-size:clamp(31px,5vw,76px)!important;z-index:2!important}
  .p12{top:55%!important;left:38%!important;font-size:clamp(44px,7vw,106px)!important;z-index:4!important;transform:rotate(-1deg)!important}
  .p13{top:64%!important;left:5%!important;font-size:clamp(22px,3.5vw,54px)!important;z-index:2!important}
  .p14{top:61%!important;right:4%!important;font-size:clamp(30px,4.8vw,72px)!important;z-index:3!important}
  .p15{top:68%!important;left:18%!important;font-size:clamp(42px,6.8vw,102px)!important;z-index:5!important;transform:rotate(.7deg)!important}
  .p16{top:75%!important;left:3%!important;font-size:clamp(28px,4.5vw,68px)!important;z-index:3!important}
  .p17{top:72%!important;right:6%!important;font-size:clamp(34px,5.4vw,82px)!important;z-index:4!important;transform:rotate(-1deg)!important}
  .p18{top:80%!important;left:28%!important;font-size:clamp(22px,3.5vw,54px)!important;z-index:2!important}
  .p19{top:84%!important;left:4%!important;font-size:clamp(28px,4.5vw,68px)!important;z-index:2!important}
  .p20{top:82%!important;right:5%!important;font-size:clamp(26px,4.1vw,62px)!important;z-index:3!important}
  .p21{top:88%!important;left:38%!important;font-size:clamp(25px,4vw,60px)!important;z-index:2!important}
  .p22{top:12%!important;left:48%!important;font-size:clamp(22px,3.5vw,54px)!important;z-index:1!important}
  .p23{top:32%!important;left:16%!important;font-size:clamp(24px,3.8vw,58px)!important;z-index:1!important}
  .p24{top:87%!important;left:7%!important;font-size:clamp(42px,6.8vw,102px)!important;z-index:8!important;transform:rotate(-.5deg)!important}
  .p25{top:91%!important;right:4%!important;font-size:clamp(46px,7.4vw,112px)!important;z-index:9!important;transform:rotate(.5deg)!important}

  .pressure-question{min-height:112svh!important;display:flex!important;flex-direction:column!important;justify-content:center!important;padding-top:24svh!important;padding-bottom:24svh!important}

  .service-rush{min-height:auto!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important;padding:7svh var(--pad) 13svh!important;overflow:visible!important}
  .service-rush-line{display:flex!important;align-items:center!important;flex-wrap:wrap!important;width:auto!important;max-width:100%!important;white-space:normal!important;gap:6px 0!important;padding:0!important;animation:none!important;transform:none!important}
  .service-rush-line + .service-rush-line{margin-top:7px!important}
  .service-rush-line span{font-size:clamp(28px,4.7vw,68px)!important;line-height:1.08!important;white-space:nowrap!important}
  .service-rush-line i{display:inline!important;width:auto!important;height:auto!important;margin:0 clamp(8px,1.4vw,18px)!important;padding:0!important;overflow:visible!important;font-size:clamp(20px,3vw,40px)!important;line-height:1!important;font-style:normal!important;font-weight:300!important;background:none!important;color:rgba(255,255,255,.38)!important}
  .service-rush .service-note{order:99!important;margin:10px 0 0!important;padding:0!important;font-size:clamp(11px,1.05vw,14px)!important;line-height:1.5!important;color:rgba(255,255,255,.52)!important}

  .pressure-close{min-height:118svh!important;margin-top:0!important;padding-top:24svh!important;padding-bottom:22svh!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
  .pressure-fact{margin-bottom:14svh!important}
  .answer-line{margin-top:11svh!important}
  .launch{min-height:116svh!important}
  .launch-space{height:44vh!important}
  .link-zone-head{min-height:92svh!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
  .route-card{min-height:50svh!important}

  @media(max-width:820px){
    .hero{min-height:108svh!important}
    .hero-content{min-height:108svh!important}
    .pressure-wall{height:100svh!important;min-height:650px!important}
    .pressure-wall .pressure-word{max-width:94vw!important;line-height:.9!important}
    .pressure-ghost{font-size:clamp(76px,24vw,145px)!important}
    .g1{top:18%!important;left:-7%!important}.g2{top:46%!important;right:-18%!important}.g3{top:70%!important;left:-5%!important}

    .p1{top:8%!important;left:5%!important;font-size:clamp(31px,9vw,44px)!important}
    .p2{top:14%!important;right:6%!important;font-size:clamp(22px,6.4vw,31px)!important}
    .p3{top:19%!important;left:22%!important;font-size:clamp(34px,10vw,49px)!important}
    .p4{top:27%!important;left:4%!important;font-size:clamp(23px,6.8vw,33px)!important}
    .p5{top:25%!important;right:4%!important;font-size:clamp(29px,8.4vw,41px)!important}
    .p6{top:34%!important;left:38%!important;font-size:clamp(26px,7.4vw,36px)!important}
    .p7{top:39%!important;left:4%!important;font-size:clamp(23px,6.6vw,32px)!important}
    .p8{top:40%!important;right:3%!important;font-size:clamp(28px,8vw,39px)!important}
    .p9{top:47%!important;left:20%!important;font-size:clamp(32px,9.2vw,45px)!important}
    .p10{top:53%!important;right:5%!important;font-size:clamp(18px,5.2vw,25px)!important}
    .p11{top:57%!important;left:4%!important;font-size:clamp(23px,6.6vw,32px)!important}
    .p12{top:55%!important;left:38%!important;font-size:clamp(30px,8.6vw,42px)!important}
    .p13{top:65%!important;left:4%!important;font-size:clamp(17px,4.9vw,24px)!important}
    .p14{top:62%!important;right:4%!important;font-size:clamp(22px,6.3vw,31px)!important}
    .p15{top:68%!important;left:16%!important;font-size:clamp(31px,8.8vw,43px)!important}
    .p16{top:76%!important;left:3%!important;font-size:clamp(21px,6vw,29px)!important}
    .p17{top:73%!important;right:5%!important;font-size:clamp(25px,7.1vw,35px)!important}
    .p18{top:81%!important;left:28%!important;font-size:clamp(17px,4.9vw,24px)!important}
    .p19{top:84%!important;left:3%!important;font-size:clamp(20px,5.8vw,28px)!important}
    .p20{top:83%!important;right:4%!important;font-size:clamp(19px,5.4vw,27px)!important}
    .p21{top:88%!important;left:38%!important;font-size:clamp(18px,5.2vw,25px)!important}
    .p22{top:12%!important;left:54%!important;font-size:clamp(16px,4.6vw,22px)!important}
    .p23{top:32%!important;left:18%!important;font-size:clamp(17px,4.9vw,24px)!important}
    .p24{top:88%!important;left:5%!important;font-size:clamp(30px,8.7vw,42px)!important}
    .p25{top:92.5%!important;right:4%!important;font-size:clamp(32px,9.2vw,45px)!important}

    .pressure-question{min-height:112svh!important;padding-top:25svh!important;padding-bottom:25svh!important}
    .service-rush{min-height:auto!important;padding:6svh 20px 12svh!important}
    .service-rush-line{gap:5px 0!important}
    .service-rush-line + .service-rush-line{margin-top:6px!important}
    .service-rush-line span{font-size:clamp(22px,6.2vw,31px)!important;line-height:1.08!important}
    .service-rush-line i{margin:0 7px!important;font-size:clamp(17px,4.7vw,24px)!important;color:rgba(255,255,255,.42)!important}
    .service-rush .service-note{margin-top:8px!important;padding:0!important;font-size:12px!important;line-height:1.45!important}
    .pressure-close{min-height:120svh!important;padding-top:25svh!important;padding-bottom:23svh!important}
    .pressure-fact{margin-bottom:15svh!important}
    .answer-line{margin-top:12svh!important}
    .launch{min-height:118svh!important}
    .launch-space{height:48vh!important}
    .link-zone-head{min-height:94svh!important}
    .route-card{min-height:54svh!important}
  }
`;
document.head.appendChild(pacingStyle);

const serviceRush=document.querySelector('.service-rush');
const serviceNote=document.querySelector('.service-note');
if(serviceRush&&serviceNote){
  serviceNote.textContent='※YouTube、IRIAM、REALITY、17LIVE、TikTok LIVE等があります。';
  serviceRush.appendChild(serviceNote);
}
document.querySelectorAll('.service-rush-line i').forEach(separator=>separator.textContent='｜');

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

const revealOptions={threshold:0,rootMargin:'0px 0px -20% 0px'};

const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
},revealOptions);

document.querySelectorAll('.reveal').forEach(item=>{
  if(item.closest('.hero')||item.closest('.pressure-wall')) return;
  item.style.transitionDelay='0ms';
  observer.observe(item);
});

const pressureWall=document.querySelector('.pressure-wall');
const stormWords=[...document.querySelectorAll('.pressure-wall .pressure-word.reveal')];
if(pressureWall){
  const stormObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      pressureWall.classList.add('is-active');
      stormWords.forEach((item,index)=>{
        item.style.transitionDelay=`${Math.min(index*6,90)}ms`;
        item.classList.add('is-visible');
      });
      stormObserver.unobserve(pressureWall);
    });
  },revealOptions);
  stormObserver.observe(pressureWall);
}

document.querySelectorAll('[data-placeholder-link]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();
  toast?.classList.add('is-visible');
  clearTimeout(window.__ocToastTimer);
  window.__ocToastTimer=setTimeout(()=>toast?.classList.remove('is-visible'),900);
}));