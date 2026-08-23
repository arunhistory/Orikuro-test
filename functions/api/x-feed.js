const USERNAME='orikuro_2027';
const CACHE_SECONDS=1800;
const MAX_RESULTS=5;

const json=(body,status=200,extraHeaders={})=>new Response(JSON.stringify(body),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':status===200?`public, max-age=60, s-maxage=${CACHE_SECONDS}`:'no-store',
    ...extraHeaders,
  },
});

const xFetch=async(url,token)=>{
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok){
    const detail=await response.text().catch(()=>"");
    throw new Error(`X API ${response.status}: ${detail.slice(0,240)}`);
  }
  return response.json();
};

export async function onRequestGet(context){
  const token=context.env.X_BEARER_TOKEN;
  if(!token){
    return json({ok:false,error:'X_BEARER_TOKEN is not configured'},503);
  }

  const cache=caches.default;
  const cacheKey=new Request(new URL('/__oc-cache/x-feed-v1',context.request.url),{method:'GET'});
  const cached=await cache.match(cacheKey);
  if(cached) return cached;

  try{
    const userUrl=`https://api.x.com/2/users/by/username/${encodeURIComponent(USERNAME)}?user.fields=name,username,profile_image_url`;
    const userPayload=await xFetch(userUrl,token);
    const user=userPayload?.data;
    if(!user?.id) return json({ok:false,error:'X user not found'},502);

    const params=new URLSearchParams({
      max_results:String(MAX_RESULTS),
      exclude:'retweets,replies',
      'tweet.fields':'created_at,attachments,entities,public_metrics',
      expansions:'attachments.media_keys',
      'media.fields':'type,url,preview_image_url,width,height',
    });
    const postsUrl=`https://api.x.com/2/users/${encodeURIComponent(user.id)}/tweets?${params}`;
    const postsPayload=await xFetch(postsUrl,token);
    const mediaByKey=new Map((postsPayload?.includes?.media||[]).map(item=>[item.media_key,item]));

    const posts=(postsPayload?.data||[]).map(post=>{
      const mediaKeys=post?.attachments?.media_keys||[];
      const media=mediaKeys.map(key=>mediaByKey.get(key)).filter(Boolean).map(item=>({
        type:item.type,
        url:item.url||item.preview_image_url||null,
        preview_image_url:item.preview_image_url||null,
        width:item.width||null,
        height:item.height||null,
      }));
      return {
        id:post.id,
        text:post.text,
        created_at:post.created_at||null,
        url:`https://x.com/${USERNAME}/status/${post.id}`,
        media,
        public_metrics:post.public_metrics||null,
      };
    });

    const response=json({
      ok:true,
      fetched_at:new Date().toISOString(),
      user:{
        id:user.id,
        name:user.name,
        username:user.username,
        profile_image_url:user.profile_image_url||null,
        url:`https://x.com/${USERNAME}`,
      },
      posts,
    });

    context.waitUntil(cache.put(cacheKey,response.clone()));
    return response;
  }catch(error){
    console.error('x-feed failed',error);
    return json({ok:false,error:'Failed to fetch X posts'},502);
  }
}
