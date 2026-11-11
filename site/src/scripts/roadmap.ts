// ロードマップの状況表示。旧 roadmap.js の API・表示処理を維持。
const ROADMAP_ENDPOINT='/api/roadmap';
const roadmapStatus=document.querySelector<HTMLElement>('[data-roadmap-status]');
const roadmapUpdated=document.querySelector<HTMLTimeElement>('[data-roadmap-updated]');

const renderRoadmap=(data: { status?: string; updatedAt?: string })=>{
  if(roadmapStatus && typeof data?.status==='string' && data.status.trim()){
    roadmapStatus.textContent=data.status.trim();
  }

  if(roadmapUpdated && data?.updatedAt){
    const date=new Date(data.updatedAt);
    if(!Number.isNaN(date.getTime())){
      roadmapUpdated.dateTime=date.toISOString();
      roadmapUpdated.textContent=`最終更新 ${new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date)}`;
    }
  }
};

const loadRoadmap=async()=>{
  try{
    const response=await fetch(ROADMAP_ENDPOINT,{headers:{Accept:'application/json'},cache:'no-store'});
    if(!response.ok) return;
    const data=await response.json();
    renderRoadmap(data);
  }catch(_error){
    /* 未接続時は下の箱の「未接続」をそのまま表示する。 */
  }
};

loadRoadmap();
