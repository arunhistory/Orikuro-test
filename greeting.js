const latestTypography=document.createElement('link');
latestTypography.rel='stylesheet';
latestTypography.href='./typography.css?v=20260822-2331';
document.head.appendChild(latestTypography);

const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');

const businessLink=[...(mobileMenu?.querySelectorAll('a')||[])].find(link=>link.textContent.trim()==='事業説明');
if(businessLink){
  businessLink.href='./business.html';
  businessLink.removeAttribute('data-placeholder-link');
}

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
