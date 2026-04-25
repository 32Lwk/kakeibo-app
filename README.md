## 家計簿Web（Next.js + Prisma + NextAuth）

### 概要
- 手入力（収入/支出）・CSV取込（`amounts.csv`互換）・ログイン（Google/メール+パス）を備えたMVPです。
- DBは **PostgreSQL** 前提です（GCPのCloud SQLにそのまま寄せられます）。

### 必要なもの
- Node.js（推奨: 20以上）
- PostgreSQL（推奨: **Neon**。またはローカル/ Docker）

```bash
npm install
```

### セットアップ
1) 環境変数作成（`.env`）

```bash
cp .env.example .env
```

最低限 `DATABASE_URL` と `NEXTAUTH_SECRET` を設定してください。
Googleログインを使う場合は `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` も設定してください。
設定画面の「Googleフォト」から画像選択を使う場合は `NEXT_PUBLIC_GOOGLE_CLIENT_ID`（中身は `GOOGLE_CLIENT_ID` と同じ）も設定してください。

2) DB接続（推奨: Neon）

- Neon のダッシュボードで接続文字列を取得し、`.env` に設定します
  - **`DATABASE_URL`**: Neon の接続文字列（**Pooled** / **Direct** どちらでもOK）

※ Neon は SSL 必須のため、接続文字列に `sslmode=require` を付けてください（`.env.example` の例どおり）。

（任意）ローカルPostgreSQLを使う場合
- 手元のPostgreSQLを起動し、`.env` の `DATABASE_URL` を合わせてください。

（任意）DockerでPostgreSQLを立てる場合

```bash
docker compose up -d
```

3) マイグレーション

```bash
npm run prisma:migrate -- --name init
```

### 開発サーバ起動

```bash
npm run dev
```

`http://localhost:3000` を開いてください。

### 初期機能
- `/signup`: メール+パスワードでアカウント作成
- `/login`: ログイン（Google/メール+パス）
- `/dashboard`: 今月の収支サマリ＋最近の明細
- `/transactions`: 明細一覧
- `/transactions/new`: 明細追加（現状は未分類へ一括。分割UIは次の実装ステップ）
- `/import`: CSV取込（`amounts.csv`互換）
- `/settings`: カレンダー開始曜日（ユーザー単位）

### デプロイ（GCP）
Cloud Run + Cloud SQL + Cloud Storage を前提に、後続ステップで `Dockerfile` やIaC（Terraform等）を追加します。
