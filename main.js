const header=document.querySelector('[data-header]');
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const toast=document.querySelector('[data-toast]');

/* Load the current visual overrides with a cache-busting URL. */
const overrideLink=document.createElement('link');
overrideLink.rel='stylesheet';
overrideLink.href='./override.css?v=20260821-1047';
document.head.appendChild(overrideLink);

/* Normal reloads always start from the hero instead of Safari restoring the last scroll position. */
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
  item.style.transitionDelay='0ms';
  observer.observe(item);
});

/* Text storm: hidden until the scene reaches the lower 20%, then it floods in quickly. */
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
