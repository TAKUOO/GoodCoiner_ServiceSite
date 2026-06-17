# SEO 計測基盤セットアップ

対象 Issue: #20 `06. SEO: Search Console / Bing Webmaster Tools / 計測基盤を整える`

## 現状

- `https://goodcoiner.com/robots.txt` は本番で `200` を返している。
- `https://goodcoiner.com/sitemap.xml` は本番で `200` を返している。
- `public/robots.txt` は `https://goodcoiner.com/sitemap.xml` を指定済み。
- Google Search Console の verification tag / html file は未設定。
- Bing Webmaster Tools の verification tag / xml file は未設定。
- GA4 / Google Tag Manager / Microsoft Clarity などの計測タグは未設定。
- 現在のプライバシーポリシーでは、サイト自体は行動追跡目的の Cookie や解析ツールを使っていないと説明している。GA4 / GTM / Clarity などを追加する場合は、先にプライバシーポリシーを更新する。

## 推奨順序

1. Google Search Console を設定する。
2. Bing Webmaster Tools を設定する。
3. GA4 などの解析ツールを入れるか判断する。
4. 週次の確認項目を運用に入れる。

## Google Search Console

DNS を触れるなら、`goodcoiner.com` の Domain property を推奨する。Domain property は `https` / `http` や `www` などのバリエーションをまとめて扱える。

サイト所有者側で行うこと:

1. Google Search Console を開く。
2. Domain property として `goodcoiner.com` を追加する。
3. DNS verification を選ぶ。
4. Search Console に表示された TXT レコードを DNS に追加する。
5. DNS 反映後に Verify を押す。
6. sitemap として `https://goodcoiner.com/sitemap.xml` を送信する。
7. Google 側の処理後、Indexing > Pages でインデックス状況を確認する。

DNS verification が使えない場合:

1. URL-prefix property として `https://goodcoiner.com/` を追加する。
2. HTML tag または HTML file verification を選ぶ。
3. 発行された meta tag または HTML file を開発側に共有する。
4. デプロイ後に Search Console で Verify を押す。
5. sitemap として `https://goodcoiner.com/sitemap.xml` を送信する。

開発側で行うこと:

- HTML tag の場合は、発行された meta tag を `<head>` 内にそのまま追加する。
- HTML file の場合は、発行されたファイルをファイル名・内容を変えずに `public/` に置く。
- 仮の verification 値はコミットしない。

## Bing Webmaster Tools

推奨手順:

1. Bing Webmaster Tools を開く。
2. Google Search Console からの import が使える場合は、検証済みサイトを import する。
3. import しない場合は `https://goodcoiner.com/` を追加する。
4. 表示された方法で所有権確認を行う。
5. sitemap として `https://goodcoiner.com/sitemap.xml` を送信する。

verification 方法:

- XML file: 発行されたファイルを `public/` に置く。
- Meta tag: 発行された meta tag を `<head>` 内に追加する。
- DNS CNAME: DNS 側に指定レコードを追加する。

開発側の判断:

- XML file verification はサイト表示に影響しにくい。
- Meta tag verification でも問題ないが、トークンは完全一致させる。
- DNS を触れるなら DNS verification が最も保守しやすい。

## GA4 などの解析ツール

現時点では、GA4 / GTM / Clarity などの行動計測タグは追加しない。

理由:

- Search Console と Bing Webmaster Tools だけで、検索クエリ・表示回数・CTR・掲載順位・インデックス状況は確認できる。
- 現在のプライバシーポリシーは解析ツール未使用を前提にしている。
- 行動計測タグを入れる場合、Cookie / 外部送信 / プライバシーポリシーの整合を先に整理する必要がある。

GA4 を入れる場合の手順:

1. GA4 で `https://goodcoiner.com/` の Web data stream を作成する。
2. Measurement ID を取得する。
3. プライバシーポリシーを更新する。
4. 必要に応じて Cookie 同意の要否を確認する。
5. 計測タグを実装する。

## 週次確認項目

毎週見るもの:

1. Search Console > Performance: クエリ、ページ、表示回数、CTR、平均掲載順位。
2. Search Console > Indexing > Pages: 除外ページ、クロールエラー。
3. Search Console > Sitemaps: `sitemap.xml` の読み取り状況。
4. Bing Webmaster Tools > Search Performance: クリック、表示回数、キーワード、ページ。
5. Bing Webmaster Tools > Site Explorer / Sitemaps: インデックス状況、クロール問題。

毎月やること:

1. 上位クエリと流入ページを export する。
2. `docs/seo-keyword-map.md` と照らし合わせる。
3. 表示回数が多く CTR が低いページは、title / description / 見出し改善 Issue にする。
4. 関連クエリがあるのに受け皿がない場合は、既存ページ内の追記または新規ページ Issue にする。

## Issue #20 の完了条件

- [ ] Google Search Console の property が verify 済み。
- [ ] Google Search Console に sitemap を送信済み。
- [ ] Search Console でインデックス状況を確認できる。
- [ ] Bing Webmaster Tools で verify または import 済み。
- [ ] Bing Webmaster Tools に sitemap を送信済み。
- [ ] 週次確認項目が決まっている。
- [ ] GA4 などの解析ツールを入れるか判断済み。
- [ ] 行動計測タグを入れる場合は、先にプライバシーポリシーを更新済み。

## 参考

- Google Search Console 所有権確認: https://support.google.com/webmasters/answer/9008080
- Google sitemap ドキュメント: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google Analytics セットアップ: https://support.google.com/analytics/answer/9304153
- Bing Webmaster Tools: https://www.bing.com/webmasters
