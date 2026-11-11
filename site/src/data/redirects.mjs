/*
  redirects.mjs — 古いURL → 新しいURL の対応表
  （ビルドの後で node から直接読むため、.ts ではなく .mjs にしている）
  ------------------------------------------------------------
  今のサイトのURL（about.html など）は、Discord・Xの投稿・検索結果に残っています。
  ビルドの最後（tools/write-redirects.mjs）で、古いURLの場所に
  「新しいURLへ自動で移るページ」を書き出します。

  from … 古いファイル名（一番上の階層からの名前）
  to   … 新しい path（navigation.ts と同じ書き方）
  side … 'both'（省略時）か 'staging'（テスト側だけ）
*/
/** @type {{ from: string, to: string, side?: 'both' | 'staging' }[]} */
export const redirects = [
  { from: 'about.html', to: '/about/' },
  { from: 'greeting.html', to: '/about/#greeting' },
  { from: 'business.html', to: '/business/' },
  { from: 'services.html', to: '/business/#services' },
  { from: 'roadmap.html', to: '/roadmap/' },
  { from: 'algorithm-test.html', to: '/algorithm-test/' },
  { from: 'preregister.html', to: '/preregister/' },
  { from: 'preregister-complete.html', to: '/preregister/complete/' },
  { from: 'crowdfunding.html', to: '/crowdfunding/' },
  { from: 'faq.html', to: '/faq/' },
  { from: 'contact.html', to: '/contact/' },
  { from: 'contact-chat.html', to: '/contact/chat/' },
  { from: 'test.html', to: '/consent/' },
  { from: 'email-delete.html', to: '/email-delete/' },
  { from: 'email-delete-expired.html', to: '/email-delete/expired/' },
  { from: 'email-delete-not-registered.html', to: '/email-delete/not-registered/' },
  { from: 'terms.html', to: '/legal/terms/' },
  { from: 'privacy.html', to: '/legal/privacy/' },
  { from: 'cookie.html', to: '/legal/cookie/' },
  { from: 'operator.html', to: '/legal/operator/' },
  // 仮：/live/（体験版の画面）ができるまではトップへ移す。できたら to を '/live/' に変える。
  { from: 'stream-test.html', to: '/' },
  { from: 'watch-test.html', to: '/' },
];
