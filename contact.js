const AUTH_ENDPOINT='https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/discord-support-auth';
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const startButton=document.querySelector('[data-chat-start]');
const statusNode=document.querySelector('[data-contact-status]');
const resumeForm=document.querySelector('[data-resume-form]');
const resumeInput=document.querySelector('[data-resume-input]');
const resumeButton=document.querySelector('[data-resume-button]');
const resumeStatus=document.querySelector('[data-resume-status]');
const START_LABEL='チャットを開始';
const RESUME_LABEL='お問い合わせに戻る';
const TOKEN_KEY='oc_support_access_token';
const CODE_KEY='oc_support_ticket_code';
const TICKET_RE=/^OC-[A-Z2-9]{8}$/;
let oauthReady=false;
let completingOAuth=false;

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
  cancelled:'認証がキャンセルされました。チャットを利用するにはDiscordアカウントでの認証が必要です。',
  invalid:'認証を確認できませんでした。もう一度お試しください。',
  expired:'認証の有効時間が切れました。もう一度お試しください。',
  configuration:'チャットの認証準備が完了していません。',
  rate:'短時間に開始操作が集中しています。時間をおいてお試しください。',
  failed:'認証またはお問い合わせ開始処理に失敗しました。もう一度お試しください。'
};
if(discordState&&statusNode){statusNode.textContent=errorMessages[discordState]||'';history.replaceState(null,'',location.pathname)}

function setControlsReady(ready){
  oauthReady=ready;
  if(startButton){startButton.disabled=!ready;startButton.textContent=ready?START_LABEL:'チャットの準備中'}
  if(resumeButton){resumeButton.disabled=!ready;resumeButton.textContent=RESUME_LABEL}
}

function normalizeTicketCode(value){return String(value||'').trim().toUpperCase()}

async function completeOAuthFromFragment(){
  const raw=location.hash.replace(/^#/,'');
  if(!raw)return false;
  const hash=new URLSearchParams(raw);
  const accessToken=hash.get('access_token');
  const state=hash.get('state');
  const oauthError=hash.get('error');
  if(!accessToken&&!oauthError)return false;

  completingOAuth=true;
  history.replaceState(null,'',location.pathname);
  if(startButton){startButton.disabled=true;startButton.textContent='チャットを準備しています…'}
  if(resumeButton)resumeButton.disabled=true;
  if(statusNode)statusNode.textContent='';
  if(resumeStatus)resumeStatus.textContent='';

  if(oauthError){
    if(statusNode)statusNode.textContent='認証がキャンセルされたか、完了できませんでした。';
    completingOAuth=false;
    return true;
  }
  if(!accessToken||!state){
    if(statusNode)statusNode.textContent='認証情報を確認できませんでした。もう一度お試しください。';
    completingOAuth=false;
    return true;
  }

  try{
    const response=await fetch(AUTH_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'complete',accessToken,state}),cache:'no-store'});
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.accessToken||!result?.ticketCode){
      const code=result?.code||'AUTH_COMPLETE_FAILED';
      if(code==='ACTIVE_TICKET_LIMIT_REACHED'||code==='ACTIVE_TICKET_EXISTS'){
        if(statusNode)statusNode.textContent='同時に進行できるお問い合わせは5件までです。既存のお問い合わせは受付番号から再開できます。';
      }else if(code==='TICKET_RESUME_REJECTED'){
        if(resumeStatus)resumeStatus.textContent='受付番号、またはDiscordアカウントが一致しません。';
      }else{
        if(statusNode)statusNode.textContent='認証は完了しましたが、チャットを開始できませんでした。もう一度お試しください。';
      }
      throw new Error(code);
    }
    sessionStorage.setItem(TOKEN_KEY,result.accessToken);
    sessionStorage.setItem(CODE_KEY,result.ticketCode);
    location.replace('./contact-chat.html');
    return true;
  }catch(error){
    console.error(error);
    completingOAuth=false;
    return true;
  }
}

async function checkReadiness(){
  if(!startButton||completingOAuth)return;
  startButton.disabled=true;
  startButton.textContent='チャットの準備を確認しています…';
  if(resumeButton)resumeButton.disabled=true;
  try{
    const response=await fetch(AUTH_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'health'}),cache:'no-store'});
    const result=await response.json().catch(()=>null);
    const ready=Boolean(response.ok&&result?.ok===true&&result?.redirectConfigured===true);
    if(ready){
      setControlsReady(true);
      if(statusNode&&!discordState)statusNode.textContent='';
      return;
    }
    setControlsReady(false);
    if(statusNode&&!discordState)statusNode.textContent='現在、チャットの認証機能を準備しています。設定完了後に開始できます。';
  }catch(error){
    console.error(error);
    oauthReady=false;
    if(startButton){startButton.disabled=true;startButton.textContent='チャットの準備を確認できません'}
    if(resumeButton)resumeButton.disabled=true;
    if(statusNode&&!discordState)statusNode.textContent='チャットの状態を確認できません。時間をおいて再読み込みしてください。';
  }
}

async function beginOAuth(ticketCode=null){
  if(!oauthReady||completingOAuth)return;
  if(statusNode)statusNode.textContent='';
  if(resumeStatus)resumeStatus.textContent='';
  if(startButton)startButton.disabled=true;
  if(resumeButton)resumeButton.disabled=true;
  if(ticketCode&&resumeButton)resumeButton.textContent='認証画面へ移動しています…';
  else if(startButton)startButton.textContent='認証画面へ移動しています…';
  try{
    const body={action:'start'};
    if(ticketCode)body.ticketCode=ticketCode;
    const response=await fetch(AUTH_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.authorizationUrl)throw new Error(result?.code||'AUTH_START_FAILED');
    location.href=result.authorizationUrl;
  }catch(error){
    console.error(error);
    if(ticketCode&&resumeStatus)resumeStatus.textContent='お問い合わせの再開認証を開始できませんでした。';
    else if(statusNode)statusNode.textContent='認証を開始できませんでした。設定状態を再確認しています。';
    await checkReadiness();
  }
}

startButton?.addEventListener('click',()=>beginOAuth());

resumeInput?.addEventListener('input',()=>{
  resumeInput.value=normalizeTicketCode(resumeInput.value).replace(/[^A-Z0-9-]/g,'').slice(0,11);
  if(resumeStatus)resumeStatus.textContent='';
});

resumeForm?.addEventListener('submit',event=>{
  event.preventDefault();
  const ticketCode=normalizeTicketCode(resumeInput?.value);
  if(!TICKET_RE.test(ticketCode)){
    if(resumeStatus)resumeStatus.textContent='受付番号を「OC-XXXXXXXX」の形式で入力してください。';
    return;
  }
  beginOAuth(ticketCode);
});

void (async()=>{
  const handled=await completeOAuthFromFragment();
  if(!handled)await checkReadiness();
  else if(!completingOAuth)await checkReadiness();
})();
