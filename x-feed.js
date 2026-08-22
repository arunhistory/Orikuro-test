(()=>{
  const slot=document.querySelector('[data-x-timeline]');
  if(!slot) return;

  const profileUrl='https://x.com/orikuro_2027';

  const buildTimeline=()=>{
    const timeline=document.createElement('a');
    timeline.className='twitter-timeline';
    timeline.href=profileUrl;
    timeline.dataset.height='520';
    timeline.dataset.theme='light';
    timeline.dataset.lang='ja';
    timeline.dataset.dnt='true';
    timeline.textContent='Posts by @orikuro_2027';
    slot.replaceChildren(timeline);
  };

  const showFallback=()=>{
    if(slot.querySelector('iframe')) return;
    const fallback=document.createElement('a');
    fallback.href=profileUrl;
    fallback.target='_blank';
    fallback.rel='noopener noreferrer';
    fallback.className='x-feed-fallback';
    fallback.textContent='公式Xを見る';
    slot.replaceChildren(fallback);
  };

  const render=()=>{
    if(window.twttr?.widgets?.load){
      window.twttr.widgets.load(slot);
      return true;
    }
    return false;
  };

  buildTimeline();

  document.querySelectorAll('script[src*="platform.twitter.com/widgets.js"]').forEach(script=>script.remove());

  const currentScript=[...document.scripts].find(script=>script.src.includes('platform.x.com/widgets.js'));
  if(currentScript){
    if(!render()) currentScript.addEventListener('load',render,{once:true});
  }else{
    const script=document.createElement('script');
    script.src='https://platform.x.com/widgets.js';
    script.async=true;
    script.charset='utf-8';
    script.dataset.xWidgetsCurrent='true';
    script.addEventListener('load',()=>{
      render();
      setTimeout(render,250);
    },{once:true});
    script.addEventListener('error',showFallback,{once:true});
    document.body.appendChild(script);
  }

  setTimeout(()=>{
    render();
    setTimeout(()=>{
      if(!slot.querySelector('iframe')) showFallback();
    },3500);
  },1200);
})();
