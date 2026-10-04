import{ServiceFlowError}from"./service-flow.js";
const STORAGE_KEY="oc_watch_realtime_grant_v1";
const STREAM_ID_RE=/^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_RE=/^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,8192}\.[A-Za-z0-9_-]{32,256}$/;
const NORTHFLANK_HOST="health--orikuro-northflank--gzhr8p5vl59b.code.run";
function checkedUrl(value,path){
  if(typeof value!=="string")throw new ServiceFlowError("WATCH_GRANT_INVALID","視聴接続先を確認できません。");
  let url;try{url=new URL(value);}catch{throw new ServiceFlowError("WATCH_GRANT_INVALID","視聴接続先を確認できません。");}
  if(url.protocol!=="wss:"||url.hostname!==NORTHFLANK_HOST||(url.port&&url.port!=="443")||url.username||url.password||url.pathname!==path||url.search||url.hash)throw new ServiceFlowError("WATCH_GRANT_INVALID","視聴接続先を確認できません。");
  return url.toString();
}
function parseGrant(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new ServiceFlowError("WATCH_GRANT_INVALID","視聴接続情報を確認できません。");
  const raw=value,{streamId,capability,expiresAt}=raw;
  if(typeof streamId!=="string"||!STREAM_ID_RE.test(streamId)||typeof capability!=="string"||capability.length>12000||!CAPABILITY_RE.test(capability)||typeof expiresAt!=="number"||!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+11*60_000)throw new ServiceFlowError("WATCH_GRANT_INVALID","視聴接続情報を確認できません。");
  return Object.freeze({streamId,capability,expiresAt,mediaWebSocketUrl:checkedUrl(raw.mediaWebSocketUrl,"/realtime/media"),commentsWebSocketUrl:checkedUrl(raw.commentsWebSocketUrl,"/realtime/comments")});
}
export function clearWatchRealtimeGrant(){sessionStorage.removeItem(STORAGE_KEY);}
export function storeWatchRealtimeGrant(value){clearWatchRealtimeGrant();const grant=parseGrant(value);sessionStorage.setItem(STORAGE_KEY,JSON.stringify(grant));return grant;}
export function takeWatchRealtimeGrant(){const raw=sessionStorage.getItem(STORAGE_KEY);clearWatchRealtimeGrant();if(!raw)return null;try{return parseGrant(JSON.parse(raw));}catch{return null;}}
