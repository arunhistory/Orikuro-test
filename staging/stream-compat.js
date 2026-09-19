export function checkStreamingCompatibility(){
  // iOS Safari, SFSafariViewController and WKWebView can expose very similar
  // user agents. Do not reject by UA: validate only transport prerequisites here
  // and let getUserMedia/AudioWorklet report their actual capability at start.
  if(!window.isSecureContext){
    return {supported:false,reason:"secure-context-required"};
  }
  if(typeof globalThis.WebSocket!=="function"){
    return {supported:false,reason:"websocket-unavailable"};
  }
  return {supported:true,reason:"ok"};
}

function reasonText(reason){
  if(reason==="secure-context-required")return "HTTPSの安全な接続で開いてください。";
  if(reason==="websocket-unavailable")return "このブラウザでは配信通信を利用できません。";
  return "この環境では配信を開始できません。";
}

export function applyStreamingCompatibility(root=document){
  const result=checkStreamingCompatibility();
  const supported=root.querySelector("[data-stream-supported]");
  const unsupported=root.querySelector("[data-stream-unsupported]");
  const reason=root.querySelector("[data-stream-unsupported-reason]");
  if(supported)supported.hidden=!result.supported;
  if(unsupported)unsupported.hidden=result.supported;
  if(reason&&!result.supported)reason.textContent=reasonText(result.reason);
  root.documentElement?.setAttribute("data-stream-compat",result.supported?"supported":"unsupported");
  root.documentElement?.setAttribute("data-stream-compat-reason",result.reason);
  return result;
}
