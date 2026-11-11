const installButton=document.querySelector('[data-discord-install]');
const installStatus=document.querySelector('[data-discord-install-status]');
const INSTALL_CONFIG_URL='https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/discord-system/b/install';

// メニュー・リンクは BaseLayout と navigation.ts が正しく出力するため、旧 DOM 書換を移植しない。
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
