const header=document.querySelector('[data-header]');
const menuButton=document.querySelector('[data-menu-button]');
const mobileMenu=document.querySelector('[data-mobile-menu]');
const toast=document.querySelector('[data-toast]');

/* Load current visual layers with cache-busting URLs. */
const overrideLink=document.createElement('link');
overrideLink.rel='stylesheet';
overrideLink.href='./override.css?v=20260821-1601';
document.head.appendChild(overrideLink);

const launchLink=document.createElement('link');
launchLink.rel='stylesheet';
launchLink.href='./launch.css?v=20260821-1907';
document.head.appendChild(launchLink);

const electronicLink=document.createElement('link');
electronicLink.rel='stylesheet';
electronicLink.href='./electronic.css?v=20260821-2024';
document.head.appendChild(electronicLink);

const spectrumLink=document.createElement('link');
spectrumLink.rel='stylesheet';
spectrumLink.href='./spectrum.css?v=20260821-2031';
document.head.appendChild(spectrumLink);

const footerLink=document.createElement('link');
footerLink.rel='stylesheet';
footerLink.href='./footer.css?v=20260822-2126';
document.head.appendChild(footerLink);

const navigationLink=document.createElement('link');
navigationLink.rel='stylesheet';
navigationLink.href='./navigation.css?v=20260822-2219';
document.head.appendChild(navigationLink);

/* Turn the right-side menu into the site map. */
if(mobileMenu){
  mobileMenu.innerHTML=`
    <div class="menu-map">
      <section class="menu-group">
        <p class="menu-group-label">知る</p>
        <a href="./about.html">Original Createとは</a>
        <a href="./greeting.html">代表挨拶</a>
        <a href="#" data-placeholder-link>事業説明</a>
        <a href="#" data-placeholder-link>サービス一覧</a>
        <a href="#" data-placeholder-link>ロードマップ</a>
      </section>
      <section class="menu-group">
        <p class="menu-group-label">試す</p>
        <a href="#" data-placeholder-link>配信テスト</a>
        <a href="#" data-placeholder-link>視聴テスト</a>
        <a href="#" data-placeholder-link>アルゴリズムテスト</a>
      </section>
      <section class="menu-group">
        <p class="menu-group-label">参加する</p>
        <a href="#" data-placeholder-link>事前登録</a>
        <a href="#" data-placeholder-link>クラウドファンディング</a>
      </section>
      <section class="menu-group">
        <p class="menu-group-label">サポート</p>
        <a href="#" data-placeholder-link>FAQ</a>
        <a href="#" data-placeholder-link>お問い合わせ</a>
      </section>
    </div>`;
}

/* Make the first project card the live representative greeting page. */
const greetingCard=[...document.querySelectorAll('.route-card')].find(card=>card.querySelector('h3')?.textContent.trim()==='代表挨拶');
if(greetingCard){
  greetingCard.href='./greeting.html';
  greetingCard.removeAttribute('data-placeholder-link');
}

/* Bottom information streams: Original Create notices and the official X post timeline. */
const footer=document.querySelector('.site-footer');
const footerNav=footer?.querySelector('.footer-links');
if(footerNav && ![...footerNav.querySelectorAll('a')].some(link=>link.textContent.trim()==='プライバシーポリシー')){
  const privacyLink=document.createElement('a');
  privacyLink.href='#';
  privacyLink.dataset.placeholderLink='';
  privacyLink.textContent='プライバシーポリシー';
  const cookieLink=[...footerNav.querySelectorAll('a')].find(link=>link.textContent.trim()==='Cookieポリシー');
  footerNav.insertBefore(privacyLink,cookieLink||footerNav.firstChild);
}

if(footer && !document.querySelector('.home-updates')){
  const updates=document.createElement('section');
  updates.className='home-updates';
  updates.setAttribute('aria-label','お知らせと公式X');
  updates.innerHTML=`
    <div class="updates-inner">
      <section class="updates-stream updates-news" aria-label="お知らせ">
        <div class="updates-stream-head">
          <p class="updates-label">INFORMATION</p>
          <h2>お知らせ</h2>
        </div>
        <div class="updates-post-list">
          <article class="updates-post">
            <time datetime="2026-08-22">2026.08.22</time>
            <div>
              <strong>ホームページを更新しました</strong>
              <p>Original Create Project</p>
            </div>
          </article>
        </div>
      </section>

      <section class="updates-stream updates-x-stream" aria-label="公式Xの投稿">
        <div class="updates-stream-head updates-x-head">
          <p class="updates-label">OFFICIAL X</p>
          <h2>公式X</h2>
        </div>
        <div class="x-timeline-slot" data-x-timeline>
          <p class="x-awaiting">公式Xの投稿をここに表示します</p>
        </div>
      </section>
    </div>`;
  footer.insertAdjacentElement('beforebegin',updates);
}

/* Set this to the public Original Create X profile URL when the account is fixed. */
const OC_X_PROFILE='';
const xTimelineSlot=document.querySelector('[data-x-timeline]');
if(xTimelineSlot && OC_X_PROFILE){
  const timeline=document.createElement('a');
  timeline.className='twitter-timeline';
  timeline.href=OC_X_PROFILE;
  timeline.dataset.theme='light';
  timeline.dataset.chrome='noheader nofooter transparent';
  timeline.dataset.dnt='true';
  timeline.dataset.height='520';
  timeline.textContent='Original Create 公式X';
  xTimelineSlot.replaceChildren(timeline);

  if(!document.querySelector('script[data-x-widgets]')){
    const xScript=document.createElement('script');
    xScript.src='https://platform.twitter.com/widgets.js';
    xScript.async=true;
    xScript.charset='utf-8';
    xScript.dataset.xWidgets='true';
    document.body.appendChild(xScript);
  }
}

/* Keep the hero slogan exactly as specified. */
const heroMessage=document.querySelector('.hero-bottom p');
if(heroMessage) heroMessage.textContent='自由をカタチに未来をつくる';

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
