# Orikuro-test（作り直し中：renewal ブランチ）

このブランチは、今のサイトを **見た目はそのまま・中の構成だけ** 決まった形に作り直すためのものです。
できあがったら、公開側（main）とテスト側（staging）に上書きしていきます。

- **AIに作業させるときは、`AGENTS.md` を最初に読ませてください。** 作業の決まり・手順・確かめ方・報告の形が全部書いてあります（Codexは自動で読みます）。
- 新しいサイトのソースは **`site/` の中だけ** です。
- 一番上に並んでいる古いファイル（`about.html` など）は、移し終わるまで **触らずに残して** あります。
  移し終わったページから順に、最後の「片付け」でまとめて消します。

---

## 公開のしくみ（今のやり方のまま）

GitHub Pages は **`pages-preview` ブランチ** を公開しています。その中身は次の並びです。

| pages-preview の中 | 公開されるURL | 中身 |
| --- | --- | --- |
| 一番上 | `https://arunhistory.github.io/Orikuro-test/` | **公開側**（main ブランチ） |
| `staging/` の中 | `https://arunhistory.github.io/Orikuro-test/staging/` | **テスト側**（staging ブランチ） |

新しいサイトも **この並びをそのまま守ります**。

- `npm run build:public` … 公開側を、URLの頭が `/Orikuro-test/` の形で書き出す
- `npm run build:staging` … テスト側を、URLの頭が `/Orikuro-test/staging/` の形で書き出す
- `npm run build:pages` … 両方を書き出して、`site/dist/pages/` に **pages-preview と同じ並び** でまとめる

この設定は `site/site.config.mjs` の1か所だけで決めています。
ビルド結果（`site/dist/`）はリポジトリに入れません。GitHub Actions も使いません。

> 公開（pages-preview への反映）はユーザーの指示があったときだけ行います。
> このブランチを作った時点では、main・staging・pages-preview には何も触っていません。

---

## フォルダ

```
site/
├─ site.config.mjs        ← 公開側とテスト側の設定（URLの頭・書き出し先）
├─ astro.config.mjs       ← ビルドの設定（中身は site.config.mjs を読むだけ）
├─ package.json           ← Astro 7.3.8 に固定
├─ src/
│  ├─ styles/
│  │  ├─ tokens.css       ← 色・文字・余白の正本（今のサイトで効いていた値を写したもの）
│  │  ├─ base.css         ← 全ページ共通の土台（虹色の背景・方眼・文字）
│  │  └─ components.css   ← 部品の見た目（ヘッダー・メニュー・フッター・文書）
│  ├─ layouts/
│  │  ├─ BaseLayout.astro      ← 全ページがこれを使う（head・ヘッダー・メニュー・フッター）
│  │  └─ DocumentLayout.astro  ← 規約など文章だけのページ用
│  ├─ components/
│  │  ├─ Header.astro
│  │  ├─ MobileMenu.astro
│  │  └─ Footer.astro
│  ├─ data/
│  │  ├─ navigation.ts    ← メニューとフッターのリンクの正本
│  │  ├─ redirects.mjs    ← 古いURL → 新しいURL の対応表
│  │  └─ url.ts           ← リンクを作る関数 href()
│  ├─ scripts/
│  │  └─ menu.ts          ← メニューの開け閉めだけ
│  ├─ pages/              ← 公開側とテスト側の両方に出るページ（フォルダの形 = URL）
│  │  └─ legal/terms.astro   → /legal/terms/（見本として移したもの）
│  └─ pages-staging/      ← テスト側にだけ出るページ
│     └─ staging-info.astro  → /staging/staging-info/（見本）
├─ public/
│  └─ images/oc-symbol-user.jpg
└─ tools/                 ← ビルド・確認用の小さなプログラム
   ├─ build.mjs           ← 片側をビルド（Windowsでも動く）
   ├─ dev.mjs             ← 手元で見ながら作る
   ├─ write-redirects.mjs ← 古いURLの移動ページを書き出す
   ├─ assemble-pages.mjs  ← 両側を pages-preview と同じ並びにまとめる
   ├─ serve.mjs           ← まとめたものを GitHub Pages と同じURLで手元に表示
   ├─ check-site.mjs      ← 決まりが守られているかを確かめる
   └─ compare-shots.mjs   ← 古いページと画素単位で比べる
```

---

## 使い方

Node.js 22.12 以上が必要です。

```sh
cd site
npm install            # 初回だけ

npm run dev            # 公開側を見ながら作る
npm run dev:staging    # テスト側を見ながら作る

npm run build:pages    # 両側を書き出して dist/pages/ にまとめる
npm run preview        # http://localhost:4321/Orikuro-test/ と /Orikuro-test/staging/ で確認
npm run check          # 決まりの確認（リンクの行き先・ソースの混入・色の直書き・!important・?v=）
npm run compare        # 移したページを古いページと画素単位で比べる（初回だけ npx playwright install chromium）
```

---

## 守る決まり

整理した構成が、修正を重ねるうちに元に戻らないための決まりです。`npm run check` で一部を自動で確かめます。

### 正本は1か所
1. メニューとフッターの項目・リンク先は `src/data/navigation.ts` だけで決める。ページにメニューを直接書かない。
2. 色・文字・余白は `src/styles/tokens.css` の変数だけを使う。ページや部品に色の値（`#10182a` など）を直接書かない。
   （例外は `BaseLayout.astro` の `theme-color` だけ。HTMLの決まりで変数を使えないため）
3. 古いURLの対応は `src/data/redirects.mjs` だけで決める。
4. 公開側とテスト側の違い（URLの頭・書き出し先）は `site/site.config.mjs` だけで決める。

### 書き方
1. 全ページが `BaseLayout` か `DocumentLayout` を使う。
2. 1ページ＝1ファイル。URLはフォルダの形（`/about/`）。ファイル名は小文字とハイフンだけ。
3. サイトの中のリンクは必ず `href('/legal/terms/')` で書く（`/Orikuro-test/` を直接書かない）。
4. テスト側だけに出すページは `src/pages-staging/` に、メニュー項目は `side: 'staging'` をつける。
5. 行き先のページがまだ無いメニュー項目は、`placeholder: true` で「仮置き」にする（404 を出さない）。見た目は普通のリンクと同じで、押しても移動しない。ページができたら `placeholder` を消す。
6. ページ専用のCSSは原則作らず、部品の組み合わせで作る。必要なときは、そのページの中に範囲を限って書く。
7. 他のページのCSSやJSを読み込まない。
8. `!important` と「上書きするためだけのCSSファイル」を作らない。
9. リンク先やCSSをJavaScriptで後から書き換えない。JavaScriptは動き（メニューの開閉・フォームの送信など）にだけ使う。
10. JavaScriptが動かなくても、本文とリンクは全て表示され、たどれる。
11. キャッシュ対策の `?v=` は使わない（Astroが書き出すファイル名の切り替えに任せる）。
12. 公開リポジトリなので、秘密の鍵・サーバーのソース・体験版のソースを置かない。

### 動き
1. 同意の確認（利用前の確認・事前登録・お問い合わせ・事前登録メールの削除）は、**本人がわざと同意したという記録を残すための仕組み** なので、手順を省いたり、自動で同意済みにしたりしない。送る中身と送り先も変えない。

### 見た目
1. 見た目は今のサイトと同じにする。この作り直しでデザインを変えない。
2. 移したページは、古いページと同じ幅（PC 1440px・スマホ 390px）でスクリーンショットを撮り、並べて同じであることを確かめる。

---

## 移行の進み具合

| ページ | 新しいURL | 状態 |
| --- | --- | --- |
| 共通部品（ヘッダー・メニュー・フッター・背景） | — | ✅ 済み（古いページと画素単位で一致を確認） |
| サイト利用規約 | `/legal/terms/` | ✅ 済み（見本。PC・スマホ・メニューを開いた状態で画素単位で一致） |
| トップ | `/` | 未 |
| Original Createとは＋代表挨拶 | `/about/` | 未（文章の食い違いはユーザーが決める） |
| 事業説明＋サービス一覧 | `/business/` | 未（同上） |
| ロードマップ | `/roadmap/` | 未 |
| アルゴリズムテスト | `/algorithm-test/` | 未 |
| 事前登録・登録完了 | `/preregister/`・`/preregister/complete/` | 未 |
| クラウドファンディング | `/crowdfunding/` | 未 |
| FAQ | `/faq/` | 未 |
| お問い合わせ・チャット | `/contact/`・`/contact/chat/` | 未 |
| 利用前の確認 | `/consent/` | 未 |
| 事前登録メールの削除（3画面） | `/email-delete/` ほか | 未 |
| プライバシーポリシー | `/legal/privacy/` | 移行中（本文・見出し・リンクの移植済み。`build:pages`・`check`・`compare` 未実行） |
| Cookieポリシー・運営者情報 | `/legal/cookie/`・`/legal/operator/` | 未（前ページの検証合格後に移行） |
| 体験版の画面 | `/live/` | 未（体験版の制作で作る。それまでメニューの「配信テスト」「視聴テスト」は仮置き） |

`npm run check` の「行き先がまだ無いもの」は、この表の「未」と同じものです。全て済めば0件になります。
