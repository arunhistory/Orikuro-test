const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const form=document.querySelector('[data-contact-form]');
const email=document.querySelector('#contact-email');
const subject=document.querySelector('#contact-subject');
const message=document.querySelector('#contact-message');
const termsConsent=document.querySelector('[data-contact-terms]');
const privacyConsent=document.querySelector('[data-contact-privacy]');
const subjectCount=document.querySelector('[data-subject-count]');
const messageCount=document.querySelector('[data-message-count]');
const status=document.querySelector('[data-contact-status]');

const disposableDomains=new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'mailinator.com',
  'sharklasers.com',
  'grr.la',
  'yopmail.com',
  'trashmail.com',
  'tempmail.com',
  'temp-mail.org'
]);

const junkLocalParts=new Set([
  'aaa','aaaa','aaaaa','test','testtest','dummy','sample','qwerty','asdf','asdfgh','zxcv','zxcvbn'
]);

const roadmapLinks=[...document.querySelectorAll('a')].filter(link=>link.textContent.trim()==='ロードマップ');
roadmapLinks.forEach(link=>{
  link.href='./roadmap.html';
  link.removeAttribute('data-placeholder-link');
});

const preregisterLinks=[...document.querySelectorAll('a')].filter(link=>link.textContent.trim()==='事前登録');
preregisterLinks.forEach(link=>{
  link.href='./preregister.html';
  link.removeAttribute('data-placeholder-link');
});

const crowdfundingLinks=[...document.querySelectorAll('a')].filter(link=>link.textContent.trim()==='クラウドファンディング');
crowdfundingLinks.forEach(link=>{
  link.href='./crowdfunding.html';
  link.removeAttribute('data-placeholder-link');
});

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

const privacyLinks=[...document.querySelectorAll('a')].filter(link=>link.textContent.trim()==='プライバシーポリシー');
privacyLinks.forEach(link=>{
  link.href='./privacy.html';
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

const requireText=field=>{
  if(!field) return;
  field.setCustomValidity(field.value.trim()?'':'この項目は必須です。');
};

const validateEmail=()=>{
  if(!email) return;
  email.setCustomValidity('');
  const value=email.value.trim().toLowerCase();
  if(!value) return;

  const at=value.lastIndexOf('@');
  if(at<=0 || at===value.length-1) return;

  const local=value.slice(0,at);
  const domain=value.slice(at+1);
  const compact=local.replace(/[._+-]/g,'');
  const sameCharacter=compact.length>=3 && new Set(compact).size===1;
  const obviousJunk=junkLocalParts.has(compact);
  const disposable=disposableDomains.has(domain) || [...disposableDomains].some(item=>domain.endsWith(`.${item}`));

  if(disposable){
    email.setCustomValidity('使い捨てメールアドレスは使用できません。');
    return;
  }

  if(sameCharacter || obviousJunk){
    email.setCustomValidity('適当な文字列ではなく、実際に使用しているメールアドレスを入力してください。');
  }
};

const validateConsent=()=>{
  termsConsent?.setCustomValidity(termsConsent.checked?'':'利用規約への同意が必要です。');
  privacyConsent?.setCustomValidity(privacyConsent.checked?'':'プライバシーポリシーへの同意が必要です。');
};

const updateSubject=()=>{
  if(subjectCount && subject) subjectCount.textContent=`${subject.value.length}/20`;
  requireText(subject);
};

const updateMessage=()=>{
  if(messageCount && message) messageCount.textContent=`${message.value.length}/1000`;
  requireText(message);
};

subject?.addEventListener('input',updateSubject);
message?.addEventListener('input',updateMessage);
email?.addEventListener('input',validateEmail);
email?.addEventListener('blur',validateEmail);
termsConsent?.addEventListener('change',validateConsent);
privacyConsent?.addEventListener('change',validateConsent);
updateSubject();
updateMessage();
validateEmail();
validateConsent();

form?.addEventListener('submit',event=>{
  event.preventDefault();
  status.textContent='';
  validateEmail();
  validateConsent();
  requireText(subject);
  requireText(message);

  if(!termsConsent?.checked || !privacyConsent?.checked){
    status.textContent='利用規約とプライバシーポリシーの両方への同意が必要です。';
    form.reportValidity();
    return;
  }

  if(!form.checkValidity()){
    form.reportValidity();
    return;
  }

  window.location.href='./contact-complete.html';
});
