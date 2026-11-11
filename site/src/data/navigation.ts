/*
  navigation.ts — メニューとフッターのリンクの正本
  ------------------------------------------------------------
  メニュー（右上のボタンで開く）とフッターに出す項目は、ここだけで決めます。
  ページのファイルにメニューやリンク一覧を直接書いてはいけません。

  path … サイトの中の場所。頭と終わりに / をつける（例: '/legal/terms/'）。
         公開側・テスト側の頭の部分（/Orikuro-test/ など）は自動でつくので書かない。
  side … 'both'（両方に出す。省略時）か 'staging'（テスト側だけに出す）。
  placeholder … true にすると「仮置き」のリンクになる。見た目は普通のリンクと同じで、
         押しても移動しない（404 を出さないため）。行き先のページができたら、
         この行から placeholder を消すだけで本物のリンクになる。
*/

export type Side = 'public' | 'staging';

export interface NavLink {
  label: string;
  path: string;
  side?: 'both' | 'staging';
  placeholder?: boolean;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

/** メニューの4つのまとまり（今のサイトと同じ並び） */
export const menuGroups: NavGroup[] = [
  {
    label: '知る',
    links: [
      { label: 'Original Createとは', path: '/about/' },
      { label: '代表挨拶', path: '/about/#greeting' },
      { label: '事業説明', path: '/business/' },
      { label: 'サービス一覧', path: '/business/#services' },
      { label: 'ロードマップ', path: '/roadmap/' },
    ],
  },
  {
    label: '試す',
    links: [
      { label: '配信テスト', path: '/live/', placeholder: true }, // 仮置き：体験版の画面ができるまで
      { label: '視聴テスト', path: '/live/', placeholder: true }, // 仮置き：体験版の画面ができるまで
      { label: 'アルゴリズムテスト', path: '/algorithm-test/' },
    ],
  },
  {
    label: '参加する',
    links: [
      { label: '事前登録', path: '/preregister/' },
      { label: 'クラウドファンディング', path: '/crowdfunding/' },
    ],
  },
  {
    label: 'サポート',
    links: [
      { label: 'FAQ', path: '/faq/' },
      { label: 'お問い合わせ', path: '/contact/' },
    ],
  },
];

/** フッターのリンク（左から順に） */
export const footerLinks: NavLink[] = [
  { label: '利用規約', path: '/legal/terms/' },
  { label: 'プライバシーポリシー', path: '/legal/privacy/' },
  { label: 'Cookieポリシー', path: '/legal/cookie/' },
  { label: '運営者情報', path: '/legal/operator/' },
  { label: 'お問い合わせ', path: '/contact/' },
];

/** その側に出すリンクだけを残す */
export function forSide<T extends NavLink>(links: T[], side: Side): T[] {
  return links.filter((link) => (link.side ?? 'both') === 'both' || side === 'staging');
}
