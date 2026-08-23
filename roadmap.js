const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');

const faqLinks=[...document.querySelectorAll('a')].filter(link=>link.textContent.trim()==='FAQ');
faqLinks.forEach(link=>{
  link.href='./faq.html';
  link.removeAttribute('data-placeholder-link');
});

const termsLinks=[...document.querySelectorAll('a')].filter(link=>link.textContent.trim()==='利用規約');
termsLinks.forEach(link=>{
  link.href='./terms.html';
  link.removeAttribute('data-placeholder-link');
});

const closeMenu=()=>{
  menuButton?.classList.remove('is-open');
  mobileMenu?.classList.remove('is-open');
  document.body.classList.remove('menu-open');
  menuButton?.setAttribute('aria-expanded','false');
  menuButton?.setAttribute('aria-label','メニューを開く');
};

menuButton?.addEventListener('click',()=>{
  const open=!mobileMenu?.classList.contains('is-open');
  menuButton.classList.toggle('is-open',open);
  mobileMenu?.classList.toggle('is-open',open);
  document.body.classList.toggle('menu-open',open);
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');
});

mobileMenu?.querySelectorAll('a').forEach(link=>{
  link.addEventListener('click',event=>{
    if(link.dataset.placeholderLink!==undefined) event.preventDefault();
    closeMenu();
  });
});

document.querySelectorAll('[data-placeholder-link]').forEach(link=>{
  if(link.closest('[data-mobile-menu]')) return;
  link.addEventListener('click',event=>event.preventDefault());
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape') closeMenu();
});

/*
  Backend-ready data contract for the lower "現在の状況" box only.
  Later, the admin site can save this content and expose it here.

  GET /api/roadmap
  {
    "status":"...",
    "updatedAt":"2026-08-23T12:57:00+09:00"
  }
*/
const ROADMAP_ENDPOINT='/api/roadmap';
const roadmapStatus=document.querySelector('[data-roadmap-status]');
const roadmapUpdated=document.querySelector('[data-roadmap-updated]');

const renderRoadmap=data=>{
  if(roadmapStatus && typeof data?.status==='string' && data.status.trim()){
    roadmapStatus.textContent=data.status.trim();
  }

  if(roadmapUpdated && data?.updatedAt){
    const date=new Date(data.updatedAt);
    if(!Number.isNaN(date.getTime())){
      roadmapUpdated.dateTime=date.toISOString();
      roadmapUpdated.textContent=`最終更新 ${new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date)}`;
    }
  }
};

const loadRoadmap=async()=>{
  try{
    const response=await fetch(ROADMAP_ENDPOINT,{headers:{Accept:'application/json'},cache:'no-store'});
    if(!response.ok) return;
    const data=await response.json();
    renderRoadmap(data);
  }catch(_error){
    /* 未接続時は下の箱の「未接続」をそのまま表示する。 */
  }
};

loadRoadmap();
