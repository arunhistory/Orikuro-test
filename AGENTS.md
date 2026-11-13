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
| 8 | ビルド済みのファイル（`.wasm`・`assets/wasm/*.js`・`assets/js/*.js`・`.sha256`）を自分で作る・書き換える | 作り直しは Claude が行う。ソース（`wasm-signature/src/lib.rs`・`src/client/*.ts`）は「フォームのページ」の決まりの範囲でだけ変えてよい |
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
- **pages-preview へ置く（画面に出す）のは `npm run publish:staging`（テスト側）と `npm run publish:public`（公開側）だけ。** GitHub Actions は使わないので、staging や main に push しただけでは画面は変わりません。置くのはユーザーの指示があったときだけで、AIは行いません（上の表1の11番）。
  - テスト側は staging ブランチから、公開側は main ブランチから置く。違うブランチからは置けないようにしてある。
  - テスト側を置くときは pages-preview の `staging/` の中だけ、公開側を置くときは一番上だけが変わる（もう片方は残る）。

### 片側だけのもの

| 置き場所 | 出る側 | 例 |
| --- | --- | --- |
| `site/src/pages/` | 両方 | ほとんどのページ |
| `site/src/pages-public/` | 公開側だけ | `/stream-test/`・`/watch-test/` の入口だけのページ |
| `site/src/pages-staging/` | テスト側だけ | テスト側だけのサイトのページ |
| `site/apps-staging/` | テスト側だけ | 本物の配信テスト・視聴テスト・システム配信テスト・立ち絵の目視テスト・0%ステージ確認・配信終了の画面 |

- 同じURLを `pages-public` と `pages-staging`（または `apps-staging`）の両方に置くと、公開側とテスト側で中身を変えられる（`/stream-test/` は公開側が入口だけ、テスト側が本物）。
- `apps-staging/` は **元の staging のテスト画面を、HTMLとCSS・JSのまま置いた場所** です。開発中のテスト道具なので、共通部品・tokens.css の決まりの対象外。中身を直すときは元の書き方のまま直す。参照は画面のフォルダから見た `../apps/…`・`../assets/js/…` で書く。

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
12. **tokens.css に入れるのは「色」「文字の種類」「全ページで共通の寸法」だけ。** 決まりは次のとおり。
    - 色の値（`#…`・`rgba(…)`）は tokens.css に置き、ページや部品からは変数で使う。
    - **既にある色と同じ値なら、新しい名前を作らず既にある変数を使う**（例: `#10182a` は必ず `--color-ink`、`#617084` は `--color-muted`）。同じ `#…` の値を2つの名前で持つと `npm run check` で失敗する。
    - 少しだけ違う色は、まとめずに別の名前で足す。まとめたい場合は報告に「まとめ候補」として書く。
    - **余白・大きさ・太さ・字間・行間・幅などの数値は tokens.css に入れない。** そのページだけで使う値は、そのページの `.astro` の `<style>` にそのまま数値で書く（例: `padding:18px 0;`）。2つ以上のページや部品で使う値だけ、`components.css` の部品にする。
    - 1つのプロパティごとに変数を作らない（`--roadmap-list-li-padding` のような名前は作らない）。

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
| test（利用前の確認）・preregister・preregister-complete・contact・contact-chat・email-delete の3つ・algorithm-test | **フォームと利用の流れのページ。下の「フォームのページ」を必ず読む** |
| stream-test・watch-test | 移さない。体験版の画面（`/live/`）は別の作業で作る |

### フォームのページ（URLが仕組みの一部になっている）

フォームと「利用の流れ」は、ページのURL（ファイル名）で **どのページか** を見分けています。
仕組み（署名・サーバーの確認・送る中身）はそのまま使えるので、**見分けに使っているURLの部分だけ** を新しいURLに書き換えます。
2026-11-11 に Claude が調べた、変える場所の全てです。ここに無い場所は変えません。

#### A. このリポジトリの中（AIが書き換える）

| ファイル | 今 | 変えること |
| --- | --- | --- |
| `wasm-signature/src/lib.rs` | — | **変えない**（2026-11-11 ユーザー決定）。WASMは今のものをそのまま使う |
| `src/client/input-router.ts` の `createPageSignature(pathname)` を呼ぶ2か所 | 今のページのURLを渡している | ページの種類から **古いファイル名** を渡す（`test`→`/test.html`、`preregister`→`/preregister.html`）。WASMは古い名前で今と同じ署名を返す |
| `src/client/input-router.ts` の `pageKindFromPath` | `preregister.html`・`test.html` で見分ける | 空でない最後の部分が `preregister`・`consent` で見分ける |
| `src/client/input-router.ts`・`response-router.ts`・`service-destination.ts` の `./index.html` | 失敗・時間切れでトップへ戻る | サイトの一番上へ戻す（公開側なら `/Orikuro-test/`、テスト側なら `/Orikuro-test/staging/`。下の「サイトの一番上の求め方」） |
| `src/client/response-router.ts` の `SUCCESS_PAGE` | `./preregister-complete.html`・`./contact-complete.html` | `preregister/complete/`（サイトの一番上から）。`contact-complete.html` は今も存在しないページなので、そのまま報告に書く（作らない） |
| `src/client/response-router.ts` | サーバーから来た `./algorithm-test.html` を今のページから見た場所として開く | サーバーから来た古いファイル名を `site-paths.ts` の `urlForLegacyPath` で新しいURLにして開く（済み） |
| `src/client/service-destination.ts` | ファイル名を作ってサーバーへ送る | `site-paths.ts` の `legacyPathForCurrentPage` で **古いファイル名** を送る（公開側・テスト側とも同じ値。済み） |
| `src/client/email-delete.ts`・`email-delete-not-registered.ts` | `./email-delete-expired.html` などへ移る、`history.replaceState(…, './email-delete.html')` | `email-delete/expired/`・`email-delete/not-registered/`・`email-delete/` へ（サイトの一番上から）。`?token=` の付け方・送る中身は変えない |
| `contact.js`・`contact-chat.js`（新しい構成では `site/src/scripts/` へ移す） | `./contact-chat.html`・`./contact.html?discord=invalid` | `href('/contact/chat/')`・`href('/contact/')` + `?discord=invalid`。Discord認証の処理・送る中身は変えない |
| `preregister.js` | リンクの書き換え（8〜15行） | 移さない（リンクは最初から正しく書く）。Discordへの登録の処理は変えずに移す |

**サイトの一番上の求め方**：ページの `<html>` か `<body>` に `data-site-base={import.meta.env.BASE_URL}` を Astro で書き出し、スクリプトはそれを読む。`/Orikuro-test/` をスクリプトに直接書かない。

#### B. サーバー側（変えなくてよい）

サーバーは古いファイル名（`./algorithm-test.html`・`./stream-test.html`・`./watch-test.html`、`/test.html`・`/preregister.html`）でページを見分けています。
**ブラウザの側で「古いファイル名 ⇔ 新しいURL」を読み替える** ので、サーバーは今のまま使えます（2026-11-13 Claude が作り替え）。

- 読み替えの表は `src/client/site-paths.ts` の1か所だけ。`site/src/data/redirects.mjs` と同じであることを `npm run check` が確かめる。
- 署名は `input-router.ts` が古いファイル名を渡して作る（WASMは変えない）。
- お問い合わせのDiscord認証は、サーバーが戻り先を `contact.html` にしているので、古いURLの移動ページを通って `/contact/` に着く（`#…` は引き継ぐ）。
- 次の2つは、変えなくても壊れないが、いつか直すとよいもの：
  - Supabase の `discord-system` の `c-manager.ts` が見に行くページの一覧（一番上の `index.html` など）。状況の報告に「無い」と出るだけ。
  - Supabase の `mail-system` の `stage2-staging-control.ts` は、このリポジトリの `cloudflare/oc-stage2-staging.mjs` を読みに来る。**`cloudflare/` を片付けで消さないこと。**

#### C. 作り方の決まり

1. 署名の値・送る中身・送り先・送る順番・同意の手順は変えない。変えるのは「URLでページを見分ける部分」と「移る先のURL」だけ。
2. `.wasm` と `.sha256` は今のものをそのまま使う（作り直さない）。`assets/js/*.js` は `npm run build:client` で作る（元の staging の自動処理と同じ道具・同じ設定。esbuild 0.28.2 と javascript-obfuscator 5.5.0）。実行できない環境ではソースだけ変えて、報告に「Claude のビルド待ち」と書く。Claude がビルドして、送信の流れを確かめる。
3. 古いURL（`test.html`・`preregister.html`・`contact.html`・`email-delete.html?token=…` など）から来ても、移動ページで新しいURLへ移り、最後まで使えること（`?token=` と `#…` は移動ページが引き継ぐ）。
4. 公開側（`/Orikuro-test/`）とテスト側（`/Orikuro-test/staging/`）のどちらでも同じように動くこと。サーバーへ送るページの道のりは、どちらでも同じ値になること。

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

### 自分の環境で確かめられないとき（ChatGPT など）

npm やブラウザが使えず、`build:pages`・`check`・`compare` を自分で実行できない環境では、次のとおりにします。

- **止まらずに、依頼されたページを最後まで作ってよい。** 「各ページの確認が通ってから次へ」の決まりは、実行できる環境でだけ守る。
- 確認は **Claude が代わりに行う**。報告の「確かめた結果」には「未実行（環境で実行できない）」と書く。
- 実行していないのに「同じ」「通った」と書かない。
- Claude の確認で違いが見つかったら、その指摘のとおりに直す。

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

---

## 10. 残りのページの設計（2026-11-12 確定）

ユーザーが決めたことと、Claude が古いページを読んで決めた作り方です。ここに書いてあるとおりに作ります。

### 10-1. 事業説明（/business/）

- 文章は **事業説明（business.html）の文をそのまま使う**（ユーザー決定。サービス一覧だけにある文は使わない）。
- 見た目も business.html と同じ。`id="services"` は business.html と同じ場所（サービスの一覧）に置く。
- services.html は `/business/#services` へ移す（redirects.mjs は設定済み）。
- `npm run compare` で business.html と画素単位で同じになること。

### 10-2. Original Createとは＋代表挨拶（/about/）

- 上に about.html の本文、その下に greeting.html の本文を `<section id="greeting">` として続ける。文章は両方とも1文字も変えない。
- 上半分は about.html と同じ見た目、`#greeting` の部分は greeting.html の `<main>` と同じ見た目にする。代表挨拶の部分だけ `--font-serif` を使う。
- 代表の写真（`assets/representative-message.jpg`）は今も存在せず、古いページでは読み込みに失敗して `is-empty` の見た目になっている。新しいページでは **最初から `is-empty` の見た目で出し、画像は読み込まない**。写真が用意できたら `public/images/` に置いて `<img>` を足す（報告に書く）。
- redirects.mjs の about.html の行に `compare: false` をつける（形が変わるので画素では比べない）。Claude が目で確かめる。

### 10-3. 「試す」の3つ（配信テスト・視聴テスト・アルゴリズムテスト）

公開中のトップでは、この3つは **利用の流れの入口** として動いています（押す → サーバーから利用の札をもらう → 利用前の確認 → 各テスト画面）。ほかのページではダミーでした。新しい構成では **全ページのメニューとトップのカードで、入口として動く** ようにします（ユーザー決定）。

- `navigation.ts` の `NavLink` に `serviceEntry?: 'stream' | 'watch' | 'algorithm'` を足す。3つとも `path: '/consent/'`・`serviceEntry` を持たせ、`placeholder` は外す。
- MobileMenu は `serviceEntry` がある項目を `<a href={href('/consent/')} data-service-entry="…">` で出す。
- 押したときの動きは `src/scripts/service-entry.ts` に1つだけ書き、BaseLayout で全ページに読み込む。中身は古い main.js の105〜127行と同じ：
  1. 既定の移動を止める。押している最中なら何もしない。
  2. `href('/assets/js/service-flow.js')` を読み込み、`startServiceFlow(entry)` を呼ぶ。
  3. 成功したら `href('/consent/')` へ移る。
  4. 失敗したらトースト（下）に文を出し、1.6秒で消す。
- トーストは `src/components/Toast.astro` にして BaseLayout に置く。見た目はトップの `.toast` の「最後に効いていた値」を写す。ふだんは見えない。
- JavaScript が動かないときは `/consent/` へ移るだけ（札が無いのでトップへ戻る）。これは今と同じ。

### 10-4. 配信テスト・視聴テスト（/stream-test/・/watch-test/）

- main ブランチの stream-test.html・watch-test.html（入口の確認だけの小さなページ）を、algorithm-test と同じ作りで移す。
- redirects.mjs の stream-test.html・watch-test.html の移動先を `/stream-test/`・`/watch-test/` に変える（今は仮にトップ）。
- staging ブランチにある本物の配信・視聴テストの画面は、この作業では移さない（テスト側を上書きする前に、別の作業として行う）。
- 表 B（サーバー側）の `oc_service_routes` の新しい値は `stream-test/`・`watch-test/`・`algorithm-test/`。

### 10-5. トップ（/）

古いトップは CSS 10枚（`override.css` の `!important` を含む）と、HTML を後から書き換える main.js でできています。次のとおりに分けます。

| 古いもの | 新しい場所 |
| --- | --- |
| main.js がメニューを丸ごと書き換える（6〜36行） | 消す。メニューは共通の MobileMenu |
| main.js がリンク先を書き換える（38〜103行） | 消す。カードとフッターのリンクは最初から `href()` で書く。「試す」の3枚のカードは 10-3 と同じ入口（`data-service-entry`） |
| main.js が文字を書き換える（128〜134行：「自由をカタチに未来をつくる」「乞うご期待」） | 消す。**書き換えた後の文字** を HTML に直接書く |
| main.js が2027年の場面を作る（136〜151行） | 消す。その HTML を `.astro` に直接書く |
| スクロール位置を一番上に戻す・ヘッダーの影・表示の演出・情報の嵐・2027年の演出（153〜301行） | `src/scripts/home.ts` に移す。**時間・順番・数値は1つも変えない** |
| 仮置きリンクを押すとトーストを0.9秒出す（303〜308行） | `home.ts` に移す（トップだけの動き） |
| x-feed.js | `src/scripts/x-feed.ts` に移す。読み込む先は `href('/data/x-posts.json')`。x-posts.json は `site/public/data/` に置く（更新はこのファイルを書き換える） |
| CSS 10枚 | 「最後に効いていた値」を、トップの `.astro` の `<style>` に写す。共通部品と同じものは共通部品を使う |

- カードは `src/data/home-routes.ts` に「見出し・説明・行き先（path か serviceEntry）・左右」を並べ、そこから作る。
- 見た目は、`npm run compare`（動きを止めた状態）で index.html と画素単位で同じになること。動きの確認は Claude が行う。
