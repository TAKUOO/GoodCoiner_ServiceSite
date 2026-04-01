# GoodCoiner service site

Figma上のデザインをもとに、`MCP対応クライアント + Figma MCP + Astro + Tailwind CSS + TypeScript` で実装していくための作業用リポジトリです。

## 方針

- Figma連携は `Codex` または `Claude Code` から公式の `remote MCP` を使う
- Figmaの認証情報はリポジトリに保存しない
- UI実装は `Astro + Tailwind CSS + TypeScript` に統一する

## 推奨フロー

1. `Codex` または `Claude Code` に Figma MCP を追加する
2. Figma の対象フレーム URL を MCP クライアントに渡す
3. デザイントークン、レイアウト、コンポーネント単位で実装する
4. 必要に応じて Code Connect や既存コンポーネント規約を追加する

設定手順は [FIGMA_MCP_SETUP.md](/Users/matsuitakafumi/workspace/good_coiner_service_site/FIGMA_MCP_SETUP.md) を参照してください。

## ディレクトリ

- `src/pages`: Astro pages
- `src/components`: Astro components
- `src/layouts`: shared layouts
- `src/styles`: global styles

## 開発コマンド

```bash
npm run dev
npm run check
npm run build
```

## 次の進め方

- Figmaの対象フレームURLをCodexまたはClaude Codeへ渡す
- セクション単位で Astro コンポーネントへ分解する
- 余白、色、タイポグラフィを必要に応じてCSS変数へ寄せる

## 参考

- Figma MCP Catalog: https://www.figma.com/mcp-catalog/
- Figma MCP remote server docs: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/
