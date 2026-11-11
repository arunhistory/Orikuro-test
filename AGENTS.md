# AGENTS.md — このブランチで作業するAI（Codex / ChatGPT）への指示

このファイルは、`renewal` ブランチでサイトを作り直すAIのための **作業の決まり** です。
作業を始める前に、必ず最後まで読んでください。迷ったら、このファイルに書いてあることが正しいです。
人向けの説明は `README.md` にあります（中身は同じ決まりです）。

---

## 0. この作業は何か（1行で）

**今のサイトを、見た目を1画素も変えずに、決まった構成（`site/` の中のAstro）へ移し替える。**

デザインを良くする作業ではありません。新しい機能を足す作業でもありません。
「同じ見た目・同じ動きのまま、中身を整理する」だけです。

---

## 1. 絶対にやってはいけないこと

次のどれかをしそうになったら、作業を止めて報告してください。

| # | やってはいけないこと | 理由 |
| --- | --- | --- |
| 1 | `main`・`staging`・`pages-preview` ブランチを変える（push・マージ・PR先にする） | 公開中のサイトが変わる。作業は `renewal` か、`renewal` から作ったブランチだけ |
| 2 | GitHub Actions のファイルを作る・動かす | このリポジトリでは使わない決まり |
| 3 | 見た目を変える（色・文字・余白・配置・アニメーション） | この作り直しではデザインを変えない |
| 4 | 古いページで崩れているところを「ついでに」直す | 見た目の変更になる。直さずに報告する |
| 5 | 2つのページの文章が食い違うとき、どちらかを勝手に選ぶ | ユーザーが決める。両方を並べて報告する |
| 6 | 同意の確認を省く・自動で同意済みにする・チェックを最初から入れておく | 下の「4. 同意の記録」を読むこと |
| 7 | フォームの送る中身・送り先・順番を変える | サーバー側の確認が通らなくなる |
| 8 | `assets/wasm/` と `assets/js/` のファイル、`.sha256` を作り直す・書き換える | 署名とハッシュの確認が壊れる。そのままコピーするだけ |
| 9 | 秘密の鍵・パスワード・サーバーのソース・体験版のソースを置く | 公開リポジトリなので全世界から読める |
| 10 | 一番上の階層の古いファイル（`about.html` など）を消す | 移行が全部終わった「片付け」の段階まで残す |
| 11 | 公開（pages-preview への反映）をする | ユーザーの指示があったときだけ。AIは行わない |

---

## 2. 公開のしくみ（間違えやすいので必ず理解する）

GitHub Pages は **`pages-preview` ブランチ** を公開しています。中身はこの並びです。

| pages-preview の中 | URL | 中身 |
| --- | --- | --- |
| 一番上 | `https://arunhistory.github.io/Orikuro-test/` | **公開側**（main ブランチ） |
| `staging/` の中 | `https://arunhistory.github.io/Orikuro-test/staging/` | **テスト側**（staging ブランチ） |

- 公開側とテスト側は **同時に公開** されます。片方だけのサイトにしてはいけません。
- 新しいサイトは、同じソースから2回書き出します。
  - `npm run build:public` → URLの頭が `/Orikuro-test/`
  - `npm run build:staging` → URLの頭が `/Orikuro-test/staging/`
  - `npm run build:pages` → 両方を書き出し、`site/dist/pages/` に **pages-preview と同じ並び** でまとめる
- この違いは `site/site.config.mjs` だけで決まっています。ページの中で `/Orikuro-test/` や `/staging/` を直接書いてはいけません。リンクは必ず `href()` で作ります（下の「5. 書き方」）。
- `site/dist/` はリポジトリに入れません（`.gitignore` 済み）。

---

## 3. どこに何があるか（正本は1か所）

```
site/
├─ site.config.mjs           公開側とテスト側の設定。ここだけで決める
├─ src/styles/tokens.css     色・文字・余白の正本。値はここだけに書く
├─ src/styles/base.css       全ページ共通の土台（背景の虹色・方眼・文字）
├─ src/styles/components.css 部品の見た目。部品ごとに区切ってある
├─ src/layouts/BaseLayout.astro      全ページがこれを使う
├─ src/layouts/DocumentLayout.astro  規約など文章だけのページ用
├─ src/components/           Header / MobileMenu / Footer（部品を足すならここ）
├─ src/data/navigation.ts    メニューとフッターのリンクの正本
├─ src/data/redirects.mjs    古いURL → 新しいURL の対応表
├─ src/data/url.ts           リンクを作る関数 href()
├─ src/scripts/              動き（JavaScript）。今は menu.ts だけ
├─ src/pages/                公開側とテスト側の両方に出るページ
├─ src/pages-staging/        テスト側にだけ出るページ
├─ public/                   そのまま公開するファイル（画像・WASMなど）
└─ tools/                    ビルドと確認の道具（変える必要はない）
```

| 変えたいもの | 直すファイル | ほかの場所に書いてはいけない |
| --- | --- | --- |
| 色・文字の種類・余白 | `tokens.css` | ページや部品に `#10182a` などを直接書かない |
| メニュー・フッターの項目 | `navigation.ts` | ページにメニューを直接書かない |
| 古いURLの移動先 | `redirects.mjs` | ページの中で移動させない |
| 公開側・テスト側のURL | `site.config.mjs` | ページに `/Orikuro-test/` を書かない |

---

## 4. 同意の記録（とても大事）

利用前の確認・事前登録・お問い合わせ・事前登録メールの削除にある同意の確認とメールなどの登録は、
**本人がわざと同意したという記録を残すための仕組み** です。手間に見えても、わざとそうしてあります。

- 同意の手順を省かない。まとめない。順番を変えない。
- チェックを最初から入れておかない。自動で同意済みにしない。
- 同意の文面を変えない。
- 送る中身・送り先・送る順番を変えない。

---

## 5. 書き方の決まり

1. 全ページが `BaseLayout` か `DocumentLayout` を使う。
2. 1ページ＝`src/pages/` の1ファイル。URLはフォルダの形（`/about/`）。ファイル名は小文字とハイフンだけ。
3. サイトの中のリンク・画像は必ず `href('/legal/terms/')` で書く。
4. テスト側だけに出すページは `src/pages-staging/` に置く。メニュー項目なら `side: 'staging'` をつける。
5. 行き先のページがまだ無いメニュー項目は `placeholder: true` で **仮置き** にする（404を出さない）。見た目は普通のリンクと同じで、押しても移動しない。ページができたら `placeholder` を消す。今は「配信テスト」「視聴テスト」が仮置き。
6. ページ専用のCSSは原則作らない。部品の組み合わせで作る。どうしても必要なときは、そのページの `.astro` の中に `<style>` で書き（Astroが範囲を限ってくれる）、報告で理由を書く。
7. 他のページのCSSやJSを読み込まない。
8. `!important` と「上書きするためだけのCSSファイル」を作らない。
9. リンク先やCSSをJavaScriptで後から書き換えない。JavaScriptは動き（メニューの開閉・フォームの送信など）にだけ使う。
10. JavaScriptが動かなくても、本文とリンクは全て表示され、たどれる。
11. キャッシュ対策の `?v=` を使わない。
12. 色の値がtokens.cssに無いときは、tokens.css に **役割の名前** をつけて足す（例: `--color-roadmap-line`）。似た色があっても勝手にまとめない。まとめたい場合は報告に「まとめ候補」として書く。

### 古いCSSの値の読み方（ここで間違えやすい）

古いサイトは、同じ部品に何枚ものCSSが重なり、`!important` やページ内の `<style>` で上書きされています。
**書いてある値ではなく「最後に効いていた値」** を写してください。

- 1つの部品の値は、`about.css`・`business.css` → ページ専用CSS → `footer.css` → `navigation.css` → `typography.css` → ページ内の `<style>` の順に重なっています。後のもの・`!important`・より細かい指定が勝ちます。
- 例：メニューのリンクの太さは `navigation.css` では 800 ですが、`typography.css` の `!important` で **600** になっています。
- 例：ロゴの文字の太さは `about.css` では 800 ですが、`typography.css` で **500** です。
- 迷ったら、ブラウザで古いページを開いて、実際に効いている値（Computed）を見る。
- 最後は `npm run compare` で画素が一致するかで判断する（下の「7. 確かめ方」）。

---

## 6. 1ページを移す手順（この順に行う）

見本：`terms.html` → `site/src/pages/legal/terms.astro`（移し済み。迷ったらこれを真似する）

1. **新しいURLを確かめる**：`src/data/redirects.mjs` の表で、古いファイルの移動先を見る。表に無いページは作らずに報告する。
2. **ページのファイルを作る**：URLが `/legal/privacy/` なら `src/pages/legal/privacy.astro`。
3. **レイアウトを選ぶ**：規約のような文章だけのページは `DocumentLayout`、それ以外は `BaseLayout`。
4. **本文を写す**：古いHTMLの `<main>` の中だけを写す。ヘッダー・メニュー・フッター・`<head>` はレイアウトが出すので写さない。文章は **1文字も変えない**（句読点・改行・`<br />` も同じ）。
5. **title と description を写す**：古い `<title>` の「 | Original Create Project」より前の部分を `title` に、`<meta name="description">` を `description` に。
6. **クラス名をそろえる**：規約類は `terms-intro` → `doc-intro`、`terms-section` → `doc-section`、`terms-enacted` → `doc-enacted`。`privacy-` `cookie-` `operator-` で始まる名前も同じように `doc-` にする。ただし運営者情報は、見出しの大きさ・字間・折り返し（`white-space:nowrap`）と、表（`operator-list`）が規約と違うので、`components.css` の Document の区切りに運営者情報用の部品として足す。
7. **見た目を写す**：その部品の「最後に効いていた値」を `components.css` に部品として足す（色は tokens.css の変数で）。
8. **JavaScriptを確かめる**：古いページの `xxx.js` がリンクの書き換えやCSSの読み込みしかしていなければ、**移さない**（新しい構成では不要）。動き（開閉・送信・表示の切り替え）があれば `src/scripts/` に移す。
9. **ページ内のリンク**：古い `./privacy.html` などは `href('/legal/privacy/')` に変える。
10. **確かめる**：`npm run build:pages` → `npm run check` → `npm run compare`。全部通るまで直す。
11. **README.md の「移行の進み具合」** の表を更新する。

### 特別な注意がいるページ

| ページ | 注意 |
| --- | --- |
| about＋greeting、business＋services | 2ページを1ページにまとめる。**文章が食い違うところは選ばずに報告**。代表挨拶だけは明朝体（`--font-serif`）を使う決まり。`npm run compare` では比べられないので、`npm run preview` で古いページと見比べる |
| index（トップ） | アニメーションとXの投稿の表示があり、一番複雑。最後のほうに移す。お知らせ・Xの投稿は `src/data/` のJSONにする |
| test（利用前の確認）・preregister・contact・contact-chat・email-delete の3つ | **フォームのページ。下の「フォームのページ」を必ず読む** |
| stream-test・watch-test | 移さない。体験版の画面（`/live/`）は別の作業で作る |

### フォームのページ（URLを変えると壊れるおそれがある）

フォームの仕組み（`src/client/*.ts` → `assets/js/*.js`、`assets/wasm/`）は、**ページのファイル名やURLを使って** 動いています。

- `input-router.ts` は `location.pathname` からページの種類を決め、`createPageSignature(pathname)` で **URLを元にした電子署名** を作ってサーバーへ送っています。URLが変わると、サーバー側の確認が通らなくなるおそれがあります。
- `service-destination.ts` はファイル名を使っています。
- `email-delete.ts`・`email-delete-not-registered.ts`・`response-router.ts` は `./email-delete-expired.html` や `./index.html` のような **古いファイル名へ移動** します。
- 事前登録メールの削除のURLは、**既に送ったメールに入っています**。古いURL（`email-delete.html?token=…`）でも削除が最後までできなければいけません。

そのため、フォームのページは次のとおりにします。

1. 移す前に、URLやファイル名を使っている場所を全部書き出して報告する（`src/client/` の全ファイル、`assets/wasm/` の呼び出し方）。
2. **WASM・サーバー・送る中身を変えないと移せない場合は、移さずに報告して止まる。** どう移すかはユーザーとClaudeが決める。
3. `assets/js/`・`assets/wasm/` のファイルは、移すときも中身を1バイトも変えずに `site/public/` へコピーする。`.sha256` も一緒にコピーする。

---

## 7. 確かめ方（全部通ってから報告する）

```sh
cd site
npm install                        # 初回だけ
npx playwright install chromium    # 初回だけ（npm run compare で使う）

npm run build:pages   # 公開側とテスト側を書き出して、pages-preview と同じ並びにまとめる
npm run check         # 決まりの確認
npm run compare       # 古いページと画素単位で比べる
npm run preview       # http://localhost:4321/Orikuro-test/ と /Orikuro-test/staging/ で目で見る
```

| 道具 | 合格 | 出てもよいもの |
| --- | --- | --- |
| `npm run check` | 最後に「✔ 決まりは守られています」 | 「行き先がまだ無いもの」（未移行のページ）、「仮置きのリンク」 |
| `npm run compare` | 移したページが全て「同じ」 | まとめたページの「👀 目で確認」 |

`npm run compare` で違いが出たら、`site/dist/compare/diff-*.png` の赤い所が違う画素です。
**違いが出たまま報告してはいけません。** どうしても同じにできない場合は、理由と画像の場所を書いて報告します。

---

## 8. 報告の書き方

作業の終わりに、次の形で報告してください。

```
## やったこと
- 移したページ：terms.html → /legal/terms/ など
- 足した部品・tokens：名前と理由

## 確かめた結果
- npm run check：✔ / ✘（✘なら内容）
- npm run compare：ページごとに「同じ」/「違う（理由）」

## ユーザーに決めてほしいこと
- 文章の食い違い（両方の文章を並べる）
- まとめ候補の色
- フォームのページで、URLを変えると壊れる場所

## 直さずに残したこと
- 古いページで崩れていたところ（場所と画像）
```

---

## 9. 迷ったときの答え

| 迷うこと | 答え |
| --- | --- |
| 古いページとどちらが正しいか分からない | 古いページが正しい。見た目は古いページに合わせる |
| 同じ色が少しずつ違う | 全部そのまま写す（tokens.css に別の名前で）。まとめたい場合は報告に書く |
| 部品が足りない | `src/components/` に `.astro` を足し、見た目は `components.css` に部品の名前の区切りで足す |
| 行き先のページがまだ無いリンク | `placeholder: true` で仮置き。404にしない |
| 新しいURLの表に無いページ | 作らずに報告 |
| 古いJSがリンクを書き換えているだけ | 移さない（新しい構成ではリンクは最初から正しい） |
| フォーム・WASM・署名に関わる | 変えない。変えないと移せないなら止まって報告 |
| `npm run compare` で数画素だけ違う | 0にする。0にできない理由が分かったら、報告に書く |
| 作業を main にマージしたい / 公開したい | しない。ユーザーの指示を待つ |
| このファイルと README.md が食い違う | このファイルに従い、食い違いを報告する |
