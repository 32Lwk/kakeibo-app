## 家計簿Web（Next.js + Prisma + NextAuth）

### 概要
- 手入力（収入/支出）・CSV取込（`amounts.csv`互換）・ログイン（Google/メール+パス）を備えたMVPです。
- DBは **PostgreSQL** 前提です（GCPのCloud SQLにそのまま寄せられます）。

### 必要なもの
- Node.js（推奨: 20以上）
- PostgreSQL（ローカルにあるもの、またはDocker）

```bash
npm install
```

### セットアップ
1) 環境変数作成（`.env`）

```bash
cp .env.example .env
```

最低限 `DATABASE_URL` と `NEXTAUTH_SECRET` を設定してください。

2) PostgreSQL起動（Dockerの場合）

```bash
docker compose up -d
```

※ Dockerが使えない場合は、手元のPostgreSQLを起動し `.env` の `DATABASE_URL` を合わせてください。

3) マイグレーション

```bash
npm run prisma:migrate
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
