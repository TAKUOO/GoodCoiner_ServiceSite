# Figma MCP setup

このリポジトリでは、`Codex` または `Claude Code` から `Figma MCP` を使う前提で進めます。

## 推奨構成

- MCPクライアント: `Codex` または `Claude Code`
- Figma接続方式: `remote MCP`
- UI実装: `Astro + Tailwind CSS + TypeScript`
- 認証方式: MCPクライアント側のOAuth認証

Figma MCP は、streamable HTTP の `remote MCP` を扱えるクライアントであれば利用できます。
このリポジトリでは、まず `remote MCP` を前提にします。

参考:

- Figma MCP Catalog: https://www.figma.com/mcp-catalog/
- Remote server installation: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/

## 重要

- Figma Personal Access Token をこのリポジトリに保存しない
- `.md` や `.json` にトークンを貼らない
- クライアント側のユーザースコープ設定を優先し、認証情報をリポジトリへ含めない

## Codex での設定

`Codex CLI` では remote MCP と OAuth ログインが使えます。

```bash
codex mcp add figma --url https://mcp.figma.com/mcp
```

認証:

```bash
codex mcp login figma
```

確認:

```bash
codex mcp list
```

その後:

1. Codex を再起動する
2. Figma フレーム URL を会話に渡す
3. 必要なら MCP サーバーのログイン状態を確認する

## Claude Code での設定

### 推奨: Figma plugin を使う

```bash
claude plugin install figma@claude-plugins-official
```

### 手動設定: remote MCP を追加する

```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

全プロジェクトで使う場合:

```bash
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```

その後:

1. Claude Code を再起動する
2. `/mcp` で `figma` を開く
3. `Authenticate` を実行する
4. Figma の認可を完了する

## 実装時の使い方

Codex または Claude Code に Figma のフレームURLを渡して、以下のように依頼します。

- `このFigmaフレームをAstro + Tailwind + TypeScriptで実装して`
- `このFigmaの余白、色、文字サイズをトークンとして整理して`
- `この画面をHero / Features / CTA に分割してコンポーネント化して`

## 補足

Figmaデスクトップアプリを使う `desktop MCP` 方式もありますが、このリポジトリではまず `remote MCP` を優先します。
理由は、クライアントをまたいで使いやすく、トークン直書き運用を避けやすいためです。
