# site/live-dist/ — 体験版（立ち絵・ラジオ）のビルド済み画面

- ここには **ビルド済みのファイルだけ** を置きます。ソースは非公開の arunhistory/Orikuro の `live/apps/` にあります。
- Orikuro の `live/apps/<画面>/` を Vite で `base: './'`・ソースマップなしでビルドし、出てきたものを `site/live-dist/<画面>/` にそのまま置きます。
  - 例：`site/live-dist/broadcaster/index.html` → テスト側では `/Orikuro-test/staging/live/broadcaster/`
- どちらの側に出すかは `site/site.config.mjs` の `LIVE.sides` で決めます（作っている間はテスト側だけ）。
- このフォルダのファイルは、`site/` の決まり（tokens.css など）の対象外です。中身は Orikuro 側で直してビルドし直します。
- 判定のしきい値・演技ライブラリ・演出の計算は、ここに入れてはいけません（サーバーから受け取る）。
