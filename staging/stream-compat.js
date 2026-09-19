function isGoogleAppOrEmbeddedWebView(){
  const ua=navigator.userAgent||"";
  return /\bGSA\//i.test(ua)||/;\s*wv\)/i.test(ua)||/\bWebView\b/i.test(ua);
}

export function checkStreamingCompatibility(){
  if(isGoogleAppOrEmbeddedWebView()){
    return {supported:false,reason:"embedded-browser"};
  }
  if(!window.isSecureContext){
    return {supported:false,reason:"secure-context-required"};
  }
  if(typeof globalThis.WebSocket!=="function"){
    return {supported:false,reason:"websocket-unavailable"};
  }
  return {supported:true,reason:"ok"};
}

export function applyStreamingCompatibility(root=document){
  const result=checkStreamingCompatibility();
  const supported=root.querySelector("[data-stream-supported]");
  const unsupported=root.querySelector("[data-stream-unsupported]");
  if(supported)supported.hidden=!result.supported;
  if(unsupported)unsupported.hidden=result.supported;
  root.documentElement?.setAttribute("data-stream-compat",result.supported?"supported":"unsupported");
  return result;
}
