const header=document.querySelector('[data-header]');
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const toast=document.querySelector('[data-toast]');

/* Turn the right-side menu into the site map. */
if(mobileMenu){
  mobileMenu.innerHTML=`
    <div class="menu-map">
      <section class="menu-group">
        <p class="menu-group-label">知る</p>
        <a href="./about.html">Original Createとは</a>
        <a href="./greeting.html">代表挨拶</a>
        <a href="./business.html">事業説明</a>
        <a href="./services.html">サービス一覧</a>
        <a href="./roadmap.html">ロードマップ</a>
      </section>
      <section class="menu-group">
        <p class="menu-group-label">試す</p>
        <a href="#" data-placeholder-link>配信テスト</a>
        <a href="#" data-placeholder-link>視聴テスト</a>
        <a href="#" data-placeholder-link>アルゴリズムテスト</a>
      </section>
      <section class="menu-group">
        <p class="menu-group-label">参加する</p>
        <a href="./preregister.html">事前登録</a>
        <a href="./crowdfunding.html">クラウドファンディング</a>
      </section>
      <section class="menu-group">
        <p class="menu-group-label">サポート</p>
        <a href="./faq.html">FAQ</a>
        <a href="./contact.html">お問い合わせ</a>
      </section>
    </div>`;
}

/* Connect footer legal and contact links. */
document.querySelectorAll('a[data-placeholder-link]').forEach(link=>{
  const label=link.textContent.trim();
  if(label==='利用規約'){
    link.href='./terms.html';
    link.removeAttribute('data-placeholder-link');
    return;
  }
  if(label==='プライバシーポリシー'){
    link.href='./privacy.html';
    link.removeAttribute('data-placeholder-link');
    return;
  }
  if(label==='Cookieポリシー'){
    link.href='./cookie.html';
    link.removeAttribute('data-placeholder-link');
    return;
  }
  if(label==='お問い合わせ'){
    link.href='./contact.html';
    link.removeAttribute('data-placeholder-link');
  }
});

/* Make the live project pages available from the project cards. */
const greetingCard=[...document.querySelectorAll('.route-card')].find(card=>card.querySelector('h3')?.textContent.trim()==='代表挨拶');
if(greetingCard){
  greetingCard.href='./greeting.html';
  greetingCard.removeAttribute('data-placeholder-link');
}

const businessCard=[...document.querySelectorAll('.route-card')].find(card=>card.querySelector('h3')?.textContent.trim()==='事業説明');
if(businessCard){
  businessCard.href='./business.html';
  businessCard.removeAttribute('data-placeholder-link');
}

const preregisterCard=[...document.querySelectorAll('.route-card')].find(card=>card.querySelector('h3')?.textContent.trim()==='事前登録');
if(preregisterCard){
  preregisterCard.href='./preregister.html';
  preregisterCard.removeAttribute('data-placeholder-link');
}

const crowdfundingCard=[...document.querySelectorAll('.route-card')].find(card=>card.querySelector('h3')?.textContent.trim()==='クラウドファンディング');
if(crowdfundingCard){
  crowdfundingCard.href='./crowdfunding.html';
  crowdfundingCard.removeAttribute('data-placeholder-link');
}

/* Keep the hero slogan exactly as specified. */
const heroMessage=document.querySelector('.hero-bottom p');
if(heroMessage) heroMessage.textContent='自由をカタチに未来をつくる';

/* Keep the project teaser heading unpunctuated. */
const anticipationTitle=document.querySelector('.link-zone-title');
if(anticipationTitle) anticipationTitle.textContent='乞うご期待';

/* Build the 2027 launch scene as separate moving pieces. */
const launch=document.querySelector('.launch');
if(launch){
  launch.innerHTML=`
    <div class="launch-core" aria-label="2027年 始動">
      <h2 class="launch-year-lock">
        <span class="launch-year-num">2027</span><span class="launch-year-unit">年</span>
      </h2>
      <div class="launch-storm" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
      <p class="launch-start" data-text="始動" aria-label="始動">
        <span class="launch-start-char launch-start-left">始</span>
        <span class="launch-start-char launch-start-right">動</span>
      </p>
    </div>`;
}

/* Normal reloads always start from the hero instead of restoring the last scroll position. */
if('scrollRestoration' in history) history.scrollRestoration='manual';
const forceTop=()=>{
  if(location.hash) return;
  window.scrollTo(0,0);
};
forceTop();
requestAnimationFrame(forceTop);
window.addEventListener('pageshow',()=>{
  forceTop();
  requestAnimationFrame(forceTop);
  setTimeout(forceTop,40);
});

const setHeaderState=()=>header?.classList.toggle('is-scrolled',window.scrollY>24);
setHeaderState();
window.addEventListener('scroll',setHeaderState,{passive:true});

menuButton?.addEventListener('click',()=>{
  const open=menuButton.classList.toggle('is-open');
  mobileMenu?.classList.toggle('is-open',open);
  document.body.classList.toggle('menu-open',open);
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');
});

mobileMenu?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{
  menuButton?.classList.remove('is-open');
  mobileMenu?.classList.remove('is-open');
  document.body.classList.remove('menu-open');
  menuButton?.setAttribute('aria-expanded','false');
}));

/* Reveal begins when an element reaches the lower 20% of the viewport. */
const revealOptions={threshold:0,rootMargin:'0px 0px -20% 0px'};
const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  });
},revealOptions);

document.querySelectorAll('.reveal').forEach(item=>{
  if(item.closest('.pressure-wall')) return;
  item.style.transitionDelay='0ms';
  observer.observe(item);
});

/* Text storm: hidden until the scene reaches the lower 20%, then it floods in quickly. */
const pressureWall=document.querySelector('.pressure-wall');
const stormWords=[...document.querySelectorAll('.pressure-wall .pressure-word.reveal')];
if(pressureWall){
  const stormObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      pressureWall.classList.add('is-active');
      stormWords.forEach((item,index)=>{
        item.style.transitionDelay=`${Math.min(index*6,90)}ms`;
        item.classList.add('is-visible');
      });
      stormObserver.unobserve(pressureWall);
    });
  },revealOptions);
  stormObserver.observe(pressureWall);
}

/* 2027 launch: trigger the impact scene once it reaches the lower 20%. */
if(launch){
  const launchObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      launch.classList.add('is-launch-visible');
      launchObserver.unobserve(launch);
    });
  },revealOptions);
  launchObserver.observe(launch);
}

document.querySelectorAll('[data-placeholder-link]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();
  toast?.classList.add('is-visible');
  clearTimeout(window.__ocToastTimer);
  window.__ocToastTimer=setTimeout(()=>toast?.classList.remove('is-visible'),900);
}));
