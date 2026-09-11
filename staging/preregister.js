const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const installButton=document.querySelector('[data-discord-install]');
const installStatus=document.querySelector('[data-discord-install-status]');
const INSTALL_CONFIG_URL='https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/discord-system/b/install';

const links={
  'ロードマップ':'./roadmap.html',
  'クラウドファンディング':'./crowdfunding.html',
  'FAQ':'./faq.html',
  '利用規約':'./terms.html',
};
for(const link of document.querySelectorAll('a')){
  const href=links[link.textContent.trim()];
  if(href){link.href=href;link.removeAttribute('data-placeholder-link');}
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
mobileMenu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{
  if(link.dataset.placeholderLink!==undefined)event.preventDefault();
  closeMenu();
}));
document.querySelectorAll('[data-placeholder-link]').forEach(link=>{
  if(!link.closest('[data-mobile-menu]'))link.addEventListener('click',event=>event.preventDefault());
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});

const disableInstall=(message)=>{
  if(installButton){
    installButton.setAttribute('aria-disabled','true');
    installButton.removeAttribute('href');
    installButton.addEventListener('click',event=>event.preventDefault(),{once:true});
  }
  if(installStatus)installStatus.textContent=message;
};

const prepareInstall=async()=>{
  if(!installButton)return;
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    let response;
    try{
      response=await fetch(INSTALL_CONFIG_URL,{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
    }finally{
      clearTimeout(timer);
    }
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload||payload.ok!==true||typeof payload.installUrl!=='string'||!payload.installUrl.startsWith('https://discord.com/oauth2/authorize?')){
      disableInstall('Discord登録リンクを取得できませんでした。時間をおいて再度お試しください。');
      return;
    }
    installButton.href=payload.installUrl;
    installButton.setAttribute('aria-disabled','false');
    if(installStatus)installStatus.textContent='Discordを開いてOCIをあなたのアカウントへ追加してください。';
  }catch{
    disableInstall('Discord登録リンクを取得できませんでした。時間をおいて再度お試しください。');
  }
};

void prepareInstall();
