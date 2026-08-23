(()=>{
  const slot=document.querySelector('[data-x-feed]');
  if(!slot) return;

  const PROFILE_URL='https://x.com/orikuro_2027';
  const DATA_SOURCE=window.OC_X_FEED_SOURCE||'./x-posts.json';
  const MAX_POSTS=5;

  const normalizeUrl=value=>{
    if(typeof value!=='string') return null;
    const trimmed=value.trim();
    const match=trimmed.match(/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/orikuro_2027\/status\/(\d+)(?:[/?#].*)?$/i);
    if(!match) return null;
    return `https://x.com/orikuro_2027/status/${match[1]}`;
  };

  const renderState=(title,text)=>{
    slot.replaceChildren();
    const box=document.createElement('div');
    box.className='x-feed-state';
    const heading=document.createElement('p');
    heading.className='x-feed-state-title';
    heading.textContent=title;
    const body=document.createElement('p');
    body.className='x-feed-state-text';
    body.textContent=text;
    box.append(heading,body);
    slot.append(box);
  };

  const loadWidgets=()=>new Promise((resolve,reject)=>{
    if(window.twttr?.widgets?.load){
      resolve(window.twttr);
      return;
    }

    let script=document.querySelector('script[data-oc-x-widgets]');
    if(!script){
      script=document.createElement('script');
      script.src='https://platform.x.com/widgets.js';
      script.async=true;
      script.charset='utf-8';
      script.dataset.ocXWidgets='true';
      document.body.appendChild(script);
    }

    const finish=()=>{
      if(window.twttr?.widgets?.load) resolve(window.twttr);
      else reject(new Error('X widgets unavailable'));
    };

    if(script.dataset.loaded==='true'){
      finish();
      return;
    }

    script.addEventListener('load',()=>{
      script.dataset.loaded='true';
      finish();
    },{once:true});
    script.addEventListener('error',()=>reject(new Error('Failed to load X widgets')), {once:true});
  });

  const renderPosts=async urls=>{
    slot.replaceChildren();
    const list=document.createElement('div');
    list.className='x-embed-list';

    urls.forEach(url=>{
      const item=document.createElement('div');
      item.className='x-embed-item';

      const quote=document.createElement('blockquote');
      quote.className='twitter-tweet';
      quote.setAttribute('data-dnt','true');
      quote.setAttribute('data-theme','light');
      quote.setAttribute('data-conversation','none');

      const link=document.createElement('a');
      link.href=url;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.textContent='Xの投稿を見る';

      quote.append(link);
      item.append(quote);
      list.append(item);
    });

    slot.append(list);

    try{
      const twttr=await loadWidgets();
      twttr.widgets.load(slot);
    }catch(error){
      console.warn('OC X embeds:',error);
    }
  };

  fetch(DATA_SOURCE,{headers:{accept:'application/json'},cache:'no-store'})
    .then(response=>{
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(payload=>{
      const source=Array.isArray(payload?.posts)?payload.posts:[];
      const urls=[...new Set(source
        .map(item=>normalizeUrl(typeof item==='string'?item:item?.url))
        .filter(Boolean))]
        .slice(0,MAX_POSTS);

      if(!urls.length){
        renderState('公式Xの投稿を準備中です','登録された投稿をここに表示します。');
        return;
      }

      return renderPosts(urls);
    })
    .catch(error=>{
      console.warn('OC X feed source:',error);
      renderState('公式Xの投稿を表示できませんでした','投稿は下の「Xで見る」から確認できます。');
    });
})();
