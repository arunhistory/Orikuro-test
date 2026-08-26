const AUTH_ENDPOINT='https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/discord-support-auth';
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const startButton=document.querySelector('[data-chat-start]');
const statusNode=document.querySelector('[data-contact-status]');
const START_LABEL='Discordで認証してチャットを開始';

function closeMenu(){
  menuButton?.classList.remove('is-open');
  mobileMenu?.classList.remove('is-open');
  document.body.classList.remove('menu-open');
  menuButton?.setAttribute('aria-expanded','false');
  menuButton?.setAttribute('aria-label','メニューを開く');
}

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
  if(link.closest('[data-mobile-menu]'))return;
  link.addEventListener('click',event=>event.preventDefault());
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu()});

const params=new URLSearchParams(location.search);
const discordState=params.get('discord');
const errorMessages={
  cancelled:'Discord認証がキャンセルされました。チャットを利用するにはDiscord認証が必要です。',
  invalid:'Discord認証を確認できませんでした。もう一度お試しください。',
  expired:'Discord認証の有効時間が切れました。もう一度お試しください。',
  configuration:'Discord認証の準備が完了していません。',
  rate:'短時間に開始操作が集中しています。時間をおいてお試しください。',
  failed:'Discord認証またはお問い合わせ開始処理に失敗しました。もう一度お試しください。'
};
if(discordState&&statusNode){statusNode.textContent=errorMessages[discordState]||'';history.replaceState(null,'',location.pathname)}

startButton?.addEventListener('click',async()=>{
  if(statusNode)statusNode.textContent='';
  startButton.disabled=true;
  startButton.textContent='Discord認証へ移動しています…';
  try{
    const response=await fetch(AUTH_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start'})});
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.authorizationUrl)throw new Error(result?.code||'AUTH_START_FAILED');
    location.href=result.authorizationUrl;
  }catch(error){
    console.error(error);
    if(statusNode)statusNode.textContent='Discord認証を開始できませんでした。時間をおいてもう一度お試しください。';
    startButton.disabled=false;
    startButton.textContent=START_LABEL;
  }
});
