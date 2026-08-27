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
        <a href="./test.html" data-service-entry="stream">配信テスト</a>
        <a href="./test.html" data-service-entry="watch">視聴テスト</a>
        <a href="./test.html" data-service-entry="algorithm">アルゴリズムテスト</a>
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
  if(label==='運営者情報'){
    link.href='./operator.html';
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

const serviceCards={
  '配信テスト':'stream',
  '視聴テスト':'watch',
  'アルゴリズムテスト':'algorithm',
};
for(const [label,entry] of Object.entries(serviceCards)){
  const card=[...document.querySelectorAll('.route-card')].find(item=>item.querySelector('h3')?.textContent.trim()===label);
  if(!card) continue;
  card.href='./test.html';
  card.dataset.serviceEntry=entry;
  card.removeAttribute('data-placeholder-link');
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

/* Service identity never crosses to the consent page. Only a Supabase-issued token is kept. */
document.querySelectorAll('[data-service-entry]').forEach(link=>link.addEventListener('click',async event=>{
  event.preventDefault();
  if(link.dataset.serviceLoading==='1') return;
  link.dataset.serviceLoading='1';
  try{
    const entry=link.dataset.serviceEntry;
    if(!['stream','watch','algorithm'].includes(entry)) throw new Error('サービス入口を確認できません。');
    const {startServiceFlow}=await import('./assets/js/service-flow.js?v=20260827-flow1');
    await startServiceFlow(entry);
    location.assign('./test.html');
  }catch(error){
    if(toast){
      toast.textContent=error instanceof Error&&error.message?error.message:'利用準備に失敗しました。';
      toast.classList.add('is-visible');
      clearTimeout(window.__ocToastTimer);
      window.__ocToastTimer=setTimeout(()=>toast.classList.remove('is-visible'),1600);
    }
  }finally{
    delete link.dataset.serviceLoading;
  }
}));

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

/* Information storm: soft first signs, then an accelerating flood of overlapping words. */
const pressureWall=document.querySelector('.pressure-wall');
const stormWords=[...document.querySelectorAll('.pressure-wall .pressure-word.reveal')];
const stormGhosts=[...document.querySelectorAll('.pressure-wall .pressure-ghost')];
const stormOrder=[0,7,14,2,19,10,23,5,17,1,12,21,8,16,4,24,11,6,20,3,15,9,22,13,18];
const stormPace=[0,190,150,115,90,70,55,44,36,30,25,21,18,16,14,13,12,11,10,9,9,8,8,7,7];

stormWords.forEach((item,index)=>{
  const driftX=[-14,10,-8,15,-11,7][index%6];
  const driftY=[24,31,21,28,23,34][index%6];
  const startScale=[.94,.955,.935,.95][index%4];
  item.style.setProperty('opacity','0','important');
  item.style.setProperty('transition','opacity .58s cubic-bezier(.16,1,.3,1), translate .72s cubic-bezier(.16,1,.3,1), scale .72s cubic-bezier(.16,1,.3,1), filter .62s cubic-bezier(.16,1,.3,1)','important');
  item.style.setProperty('transition-delay','0ms','important');
  item.style.setProperty('translate',`${driftX}px ${driftY}px`,'important');
  item.style.setProperty('scale',String(startScale),'important');
  item.style.setProperty('filter','blur(10px)','important');
});

stormGhosts.forEach((ghost,index)=>{
  ghost.style.setProperty('transition','opacity .95s cubic-bezier(.16,1,.3,1)','important');
  ghost.style.setProperty('transition-delay',`${140+index*150}ms`,'important');
});

if(pressureWall){
  const stormObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;

      /* Background information only begins to breathe in after the foreground has started. */
      setTimeout(()=>pressureWall.classList.add('is-active'),180);

      let elapsed=110;
      stormOrder.forEach((wordIndex,sequence)=>{
        const item=stormWords[wordIndex];
        if(!item) return;
        elapsed+=stormPace[sequence]||0;

        /* Stage 1: a faint hint appears, so no word pops into existence. */
        setTimeout(()=>{
          const x=[-5,4,-3,5,-4,3][wordIndex%6];
          const y=[10,13,9,12,10,14][wordIndex%6];
          item.style.setProperty('opacity','0.14','important');
          item.style.setProperty('translate',`${x}px ${y}px`,'important');
          item.style.setProperty('scale','.985','important');
          item.style.setProperty('filter','blur(6px)','important');
        },elapsed);

        /* Stage 2 overlaps the next arrivals and blooms into the final position. */
        setTimeout(()=>{
          item.style.removeProperty('opacity');
          item.classList.add('is-visible');
          item.style.setProperty('translate','0 0','important');
          item.style.setProperty('scale','1','important');
          item.style.setProperty('filter','blur(0)','important');
        },elapsed+110);
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
