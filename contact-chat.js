const API='https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/discord-system/a/api';
const TOKEN_KEY='oc_support_access_token';
const CODE_KEY='oc_support_ticket_code';
const shell=document.querySelector('[data-chat-shell]');
const closed=document.querySelector('[data-chat-closed]');
const log=document.querySelector('[data-chat-log]');
const loading=document.querySelector('[data-chat-loading]');
const ticketCodeNode=document.querySelector('[data-ticket-code]');
const ticketCodeNoticeNode=document.querySelector('[data-ticket-code-notice]');
const form=document.querySelector('[data-chat-form]');
const input=document.querySelector('[data-chat-input]');
const sendButton=document.querySelector('[data-chat-send]');
const countNode=document.querySelector('[data-message-count]');
const statusNode=document.querySelector('[data-chat-status]');
const resolutionPanel=document.querySelector('[data-resolution-panel]');
const yesButton=document.querySelector('[data-resolution-yes]');
const noButton=document.querySelector('[data-resolution-no]');
const closedTitle=document.querySelector('[data-closed-title]');
const closedMessage=document.querySelector('[data-closed-message]');
let pollTimer=null;
let lastSignature='';

function parseInitialAccess(){
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const token=hash.get('token');
  const ticket=hash.get('ticket');
  if(token&&ticket){
    sessionStorage.setItem(TOKEN_KEY,token);
    sessionStorage.setItem(CODE_KEY,ticket);
    history.replaceState(null,'',location.pathname);
  }
  return {token:sessionStorage.getItem(TOKEN_KEY),ticket:sessionStorage.getItem(CODE_KEY)};
}

const access=parseInitialAccess();
if(!access.token||!access.ticket){location.replace('./contact.html?discord=invalid')}
if(ticketCodeNode)ticketCodeNode.textContent=access.ticket||'お問い合わせ';
if(ticketCodeNoticeNode)ticketCodeNoticeNode.textContent=access.ticket||'確認できません';

function escapeText(value){return String(value??'')}
function fmt(ts){try{return new Intl.DateTimeFormat('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(ts))}catch{return''}}
function atBottom(){if(!log)return true;return log.scrollHeight-log.scrollTop-log.clientHeight<90}
function messageSignature(messages,status){return `${status}|`+messages.map(m=>`${m.id}:${m.editedTimestamp||''}`).join('|')}

function renderMessages(messages,status){
  if(!log)return;
  const sig=messageSignature(messages,status);
  if(sig===lastSignature)return;
  const stick=atBottom();
  lastSignature=sig;
  log.textContent='';
  if(!messages.length){
    const empty=document.createElement('div');empty.className='chat-loading';empty.textContent='メッセージを入力してお問い合わせを開始してください。';log.appendChild(empty);
  }else{
    for(const m of messages){
      const row=document.createElement('div');
      const role=['user','operator','system','resolution','ticket_code','discord'].includes(m.role)?m.role:'discord';
      row.className=`chat-message ${role}`;
      const bubble=document.createElement('div');bubble.className='chat-bubble';
      let label='';
      if(role==='operator')label='Original Create 運営\n';
      if(role==='system')label='システム\n';
      if(role==='resolution')label='解決確認\n';
      if(role==='discord')label='Discord\n';
      const text=document.createTextNode(label+escapeText(m.text));bubble.appendChild(text);
      if(m.timestamp){const meta=document.createElement('span');meta.className='chat-meta';meta.textContent=fmt(m.timestamp);bubble.appendChild(meta)}
      row.appendChild(bubble);log.appendChild(row);
    }
  }
  if(stick)log.scrollTop=log.scrollHeight;
}

function showClosed(kind='closed'){
  if(pollTimer)clearInterval(pollTimer);
  sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(CODE_KEY);
  if(shell)shell.hidden=true;
  if(closed)closed.hidden=false;
  if(kind==='resolved'){
    if(closedTitle)closedTitle.textContent='お問い合わせは解決しました';
    if(closedMessage)closedMessage.textContent='ご利用ありがとうございました。お問い合わせチャンネルは削除されました。';
  }else{
    if(closedTitle)closedTitle.textContent='お問い合わせは終了しました';
    if(closedMessage)closedMessage.textContent='このお問い合わせは終了しているため、チャットを表示できません。';
  }
}

async function call(body){
  const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>null);
  if(response.status===410){showClosed();throw new Error('TICKET_CLOSED')}
  if(response.status===401){sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(CODE_KEY);location.replace('./contact.html?discord=invalid');throw new Error('AUTH_REJECTED')}
  if(!response.ok)throw new Error(result?.code||`HTTP_${response.status}`);
  return result;
}

async function refresh(){
  if(!access.token)return;
  try{
    const result=await call({action:'messages',accessToken:access.token});
    loading?.remove();
    renderMessages(result.messages||[],result.status||'open');
    if(resolutionPanel)resolutionPanel.hidden=!result.resolutionCheck;
  }catch(error){
    if(String(error?.message)==='RATE_LIMITED')return;
    if(String(error?.message)==='TICKET_CLOSED'||String(error?.message)==='AUTH_REJECTED')return;
    console.error(error);
    if(statusNode)statusNode.textContent='メッセージの取得に失敗しました。再接続しています。';
  }
}

input?.addEventListener('input',()=>{if(countNode)countNode.textContent=`${input.value.length} / 1000`});

form?.addEventListener('submit',async event=>{
  event.preventDefault();
  const text=input?.value.trim()||'';
  if(!text)return;
  if(text.length>1000){if(statusNode)statusNode.textContent='メッセージは1000文字以内で入力してください。';return}
  if(statusNode)statusNode.textContent='';
  if(sendButton)sendButton.disabled=true;
  if(input)input.disabled=true;
  try{
    await call({action:'send-user',accessToken:access.token,message:text,clientMessageId:crypto.randomUUID()});
    if(input){input.value='';input.disabled=false;input.focus()}
    if(countNode)countNode.textContent='0 / 1000';
    await refresh();
  }catch(error){
    if(String(error?.message)!=='TICKET_CLOSED'&&String(error?.message)!=='AUTH_REJECTED'){
      console.error(error);if(statusNode)statusNode.textContent='送信できませんでした。もう一度お試しください。';
      if(input)input.disabled=false;
    }
  }finally{if(sendButton)sendButton.disabled=false}
});

async function resolve(answer){
  if(statusNode)statusNode.textContent='';
  if(yesButton)yesButton.disabled=true;if(noButton)noButton.disabled=true;
  try{
    const result=await call({action:'resolution',accessToken:access.token,answer});
    if(answer==='yes'&&result.status==='deleted'){showClosed('resolved');return}
    await refresh();
  }catch(error){
    if(String(error?.message)!=='TICKET_CLOSED'&&String(error?.message)!=='AUTH_REJECTED'){
      console.error(error);if(statusNode)statusNode.textContent='解決確認を送信できませんでした。';
    }
  }finally{if(yesButton)yesButton.disabled=false;if(noButton)noButton.disabled=false}
}

yesButton?.addEventListener('click',()=>resolve('yes'));
noButton?.addEventListener('click',()=>resolve('no'));

refresh();
pollTimer=setInterval(refresh,3000);
window.addEventListener('beforeunload',()=>{if(pollTimer)clearInterval(pollTimer)});
