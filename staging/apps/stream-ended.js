const reason=new URLSearchParams(location.search).get("reason")||"ended";
const detail=document.querySelector("[data-end-detail]");
const title=document.querySelector("[data-end-title]");
const messages={
  limit:"配信可能時間に達したため、配信を終了しました。",
  forced:"配信は終了しました。",
  authorization:"権限状態が変更されたため、配信を終了しました。",
  ended:"配信は終了しました。"
};
if(title)title.textContent="配信は終了しました";
if(detail)detail.textContent=messages[reason]||messages.ended;
