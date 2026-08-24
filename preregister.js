const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const email=document.querySelector('#preregister-email');
const privacy=document.querySelector('[data-privacy]');
const terms=document.querySelector('[data-terms]');

const disposableDomains=new Set(['10minutemail.com','guerrillamail.com','guerrillamail.net','guerrillamail.org','mailinator.com','sharklasers.com','grr.la','yopmail.com','trashmail.com','tempmail.com','temp-mail.org']);
const junkLocalParts=new Set(['aaa','aaaa','aaaaa','test','testtest','dummy','sample','qwerty','asdf','asdfgh','zxcv','zxcvbn']);

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

const validateEmail=()=>{
  if(!email)return;
  email.setCustomValidity('');
  const value=email.value.trim().toLowerCase();
  if(!value)return;
  const at=value.lastIndexOf('@');
  if(at<=0||at===value.length-1)return;
  const local=value.slice(0,at);
  const domain=value.slice(at+1);
  const compact=local.replace(/[._+-]/g,'');
  const disposable=disposableDomains.has(domain)||[...disposableDomains].some(item=>domain.endsWith(`.${item}`));
  if(disposable){email.setCustomValidity('使い捨てメールアドレスは使用できません。');return;}
  if((compact.length>=3&&new Set(compact).size===1)||junkLocalParts.has(compact)){
    email.setCustomValidity('適当な文字列ではなく、実際に使用しているメールアドレスを入力してください。');
  }
};
const validateConsent=()=>{
  privacy?.setCustomValidity(privacy.checked?'':'プライバシーポリシーへの同意が必要です。');
  terms?.setCustomValidity(terms.checked?'':'利用規約への同意が必要です。');
};
email?.addEventListener('input',validateEmail);
email?.addEventListener('blur',validateEmail);
privacy?.addEventListener('change',validateConsent);
terms?.addEventListener('change',validateConsent);
validateEmail();
validateConsent();
