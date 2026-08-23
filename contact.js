const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const form=document.querySelector('[data-contact-form]');
const subject=document.querySelector('#contact-subject');
const subjectCount=document.querySelector('[data-subject-count]');
const status=document.querySelector('[data-contact-status]');

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

const updateSubjectCount=()=>{
  if(subjectCount && subject) subjectCount.textContent=`${subject.value.length}/20`;
};
subject?.addEventListener('input',updateSubjectCount);
updateSubjectCount();

form?.addEventListener('submit',event=>{
  event.preventDefault();
  status.textContent='';

  if(!form.checkValidity()){
    form.reportValidity();
    return;
  }

  status.textContent='送信機能は現在準備中です。';
});
