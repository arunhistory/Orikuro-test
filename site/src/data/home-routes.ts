// index.html から1文字も変えずに写したトップの7枚のカード。
export type HomeRoute = {
  number: string;
  heading: string;
  description: readonly string[];
  side: 'left' | 'right';
  path: string;
  serviceEntry?: 'stream' | 'watch' | 'algorithm';
};
export const homeRoutes: readonly HomeRoute[] = [
  {
    "number": "01",
    "heading": "代表挨拶",
    "description": [
      "なぜOriginal Createを始めるのか",
      "代表自身の言葉で始める理由と考えをお話しします"
    ],
    "side": "right",
    "path": "/about/#greeting"
  },
  {
    "number": "02",
    "heading": "事業説明",
    "description": [
      "Original Createは何を作ろうとしているのか",
      "事業の全体像とこれから実現しようとしている内容をご紹介します"
    ],
    "side": "left",
    "path": "/business/"
  },
  {
    "number": "03",
    "heading": "配信テスト",
    "description": [
      "Original Createで予定している配信機能",
      "実際に映像を送り配信できるかを試します"
    ],
    "side": "right",
    "path": "/consent/",
    "serviceEntry": "stream"
  },
  {
    "number": "04",
    "heading": "視聴テスト",
    "description": [
      "送られた映像を実際に受け取って視聴できるのか",
      "配信を見る側の動作を試します"
    ],
    "side": "left",
    "path": "/consent/",
    "serviceEntry": "watch"
  },
  {
    "number": "05",
    "heading": "アルゴリズムテスト",
    "description": [
      "作品やクリエイターはどのように見つかるのか",
      "Original Createで検討している仕組みの一部を実際に試せます"
    ],
    "side": "right",
    "path": "/consent/",
    "serviceEntry": "algorithm"
  },
  {
    "number": "06",
    "heading": "事前登録",
    "description": [
      "2027年の事業開始に向けて準備を進めています",
      "開始時の案内を受け取りたい方はこちらから登録できます"
    ],
    "side": "left",
    "path": "/preregister/"
  },
  {
    "number": "07",
    "heading": "クラウドファンディング",
    "description": [
      "Original Create Projectの実現に向けてクラウドファンディングを予定しています",
      "目標や使い道実現する内容をご案内します"
    ],
    "side": "right",
    "path": "/crowdfunding/"
  }
];
