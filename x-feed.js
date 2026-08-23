(()=>{
  const slot=document.querySelector('[data-x-feed]');
  if(!slot) return;

  const profileUrl='https://x.com/orikuro_2027';

  const formatDate=value=>{
    if(!value) return '';
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP',{
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
    }).format(date);
  };

  const make=(tag,className,text)=>{
    const el=document.createElement(tag);
    if(className) el.className=className;
    if(text!==undefined) el.textContent=text;
    return el;
  };

  const renderFallback=()=>{
    slot.replaceChildren();
    const box=make('div','x-feed-fallback');
    box.append(make('p','x-feed-fallback-title','公式Xの投稿を取得できませんでした'));
    box.append(make('p','x-feed-fallback-text','投稿はXで確認できます。'));
    const link=make('a','x-feed-fallback-link','@orikuro_2027 をXで見る ↗');
    link.href=profileUrl;
    link.target='_blank';
    link.rel='noopener noreferrer';
    box.append(link);
    slot.append(box);
  };

  const render=payload=>{
    const posts=Array.isArray(payload?.posts)?payload.posts:[];
    if(!posts.length){
      renderFallback();
      return;
    }

    const list=make('div','x-feed-list');
    posts.forEach(post=>{
      const card=make('a','x-feed-post');
      card.href=post.url||profileUrl;
      card.target='_blank';
      card.rel='noopener noreferrer';

      const meta=make('div','x-feed-post-meta');
      const identity=make('div','x-feed-identity');
      if(payload?.user?.profile_image_url){
        const avatar=document.createElement('img');
        avatar.className='x-feed-avatar';
        avatar.src=payload.user.profile_image_url;
        avatar.alt='';
        avatar.loading='lazy';
        identity.append(avatar);
      }
      const names=make('div','x-feed-names');
      names.append(make('strong','x-feed-name',payload?.user?.name||'Original Create'));
      names.append(make('span','x-feed-handle','@'+(payload?.user?.username||'orikuro_2027')));
      identity.append(names);
      meta.append(identity);
      meta.append(make('time','x-feed-time',formatDate(post.created_at)));
      card.append(meta);

      card.append(make('p','x-feed-text',post.text||''));

      const image=post?.media?.find(item=>item?.url && (item.type==='photo'||item.preview_image_url));
      if(image?.url){
        const mediaWrap=make('div','x-feed-media');
        const img=document.createElement('img');
        img.src=image.url;
        img.alt='';
        img.loading='lazy';
        mediaWrap.append(img);
        card.append(mediaWrap);
      }

      list.append(card);
    });

    slot.replaceChildren(list);
  };

  fetch('/api/x-feed',{headers:{accept:'application/json'}})
    .then(response=>{
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(payload=>{
      if(!payload?.ok) throw new Error(payload?.error||'X feed unavailable');
      render(payload);
    })
    .catch(error=>{
      console.warn('OC X feed:',error);
      renderFallback();
    });
})();
