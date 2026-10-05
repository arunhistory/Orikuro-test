const RESULT_STORAGE_KEY="oc_system_stream_test_result_v1";
const params=new URLSearchParams(location.search);
const reason=params.get("reason")||"ended";
const systemTest=params.get("test")==="1";
const detail=document.querySelector("[data-end-detail]");
const title=document.querySelector("[data-end-title]");
const kicker=document.querySelector("[data-end-kicker]");
const icon=document.querySelector("[data-end-icon]");
const status=document.querySelector("[data-end-status]");
const resultPanel=document.querySelector("[data-test-result]");

const messages={
  limit:"配信可能時間に達したため、配信を終了しました。",
  forced:"システム側の終了処理により、配信を終了しました。",
  authorization:"権限状態が変更されたため、配信を終了しました。",
  ended:"配信終了処理が正常に完了しました。"
};
const reasonLabels={
  limit:"配信時間上限",
  forced:"システム終了",
  authorization:"権限変更",
  ended:"手動終了"
};
const modeLabels={radio:"ラジオ",standing:"立ち絵"};

function setText(selector,value){
  const el=document.querySelector(selector);
  if(el)el.textContent=value;
}
function formatDuration(seconds){
  const value=Number.isSafeInteger(seconds)&&seconds>=0?seconds:0;
  const hours=Math.floor(value/3600);
  const minutes=Math.floor((value%3600)/60);
  const secs=value%60;
  return hours>0
    ? `${hours}時間 ${String(minutes).padStart(2,"0")}分 ${String(secs).padStart(2,"0")}秒`
    : `${minutes}分 ${String(secs).padStart(2,"0")}秒`;
}
function readResult(){
  try{
    const raw=sessionStorage.getItem(RESULT_STORAGE_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(!value||typeof value!=="object"||Array.isArray(value))return null;
    if(value.version!==1||value.status!=="completed")return null;
    if(typeof value.reason!=="string"||value.reason.length>64)return null;
    if(typeof value.streamId!=="string"||!/^[A-Za-z0-9_-]{16,128}$/.test(value.streamId))return null;
    if(typeof value.mode!=="string"||!(value.mode in modeLabels))return null;
    if(!Number.isSafeInteger(value.durationSeconds)||value.durationSeconds<0||value.durationSeconds>86400)return null;
    return value;
  }catch{return null;}
}

if(systemTest){
  if(kicker)kicker.textContent="SYSTEM STREAM TEST";
  if(title)title.textContent="配信テスト結果";
  if(resultPanel)resultPanel.hidden=false;

  const result=readResult();
  if(result){
    const finalReason=result.reason||reason;
    const abnormal=finalReason==="authorization"||finalReason==="forced";
    if(status){
      status.textContent=abnormal?"終了":"正常終了";
      status.dataset.state=abnormal?"warning":"success";
    }
    if(icon)icon.textContent=abnormal?"!":"✓";
    if(detail)detail.textContent=messages[finalReason]||messages.ended;
    setText("[data-result-stop]","確認済み");
    setText("[data-result-mode]",modeLabels[result.mode]||result.mode);
    setText("[data-result-duration]",formatDuration(result.durationSeconds));
    setText("[data-result-reason]",reasonLabels[finalReason]||finalReason);
    setText("[data-result-stream-id]",result.streamId);
  }else{
    if(status){
      status.textContent="結果情報なし";
      status.dataset.state="warning";
    }
    if(icon)icon.textContent="!";
    if(detail)detail.textContent="配信は終了していますが、このタブのテスト結果情報を取得できませんでした。";
    setText("[data-result-stop]","終了済み");
    setText("[data-result-mode]","取得できません");
    setText("[data-result-duration]","取得できません");
    setText("[data-result-reason]",reasonLabels[reason]||reason);
    setText("[data-result-stream-id]","取得できません");
  }
}else{
  if(title)title.textContent="配信は終了しました";
  if(detail)detail.textContent=messages[reason]||messages.ended;
  if(status){
    status.textContent="終了済み";
    status.dataset.state="success";
  }
}
