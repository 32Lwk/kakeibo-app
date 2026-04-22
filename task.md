---
name: kakeibo-webapp-gcp
overview: 母＋自分で使う家計簿Webアプリを、GCP上で手入力とレシート画像（Google Vision OCR→OpenAIで構造化/カテゴリ推定）に対応させ、カレンダー表示・メモ・カテゴリ・集計・CSV入出力を備えたMVPから段階的に拡張する。
todos:
  - id: decide-stack
    content: 技術スタック確定（Next.js+Cloud Run+Cloud SQL+GCS+Secret Manager+Cloud Tasks、環境は当面1つ）
    status: pending
  - id: gcp-project-setup
    content: GCPプロジェクト/課金/必須API有効化（Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Cloud Tasks, Vision）
    status: pending
  - id: secrets-policy
    content: Secret Manager設計（OpenAI/Visionキー、ローテーション、権限）
    status: pending
  - id: db-schema-core
    content: DBスキーマ確定（users, households, memberships(owner/editor/viewer), categories, transactions, transaction_splits, refunds, receipts, receipt_items, attachments, audit_logs, imports）
    status: pending
  - id: db-schema-indexes
    content: 検索/集計用インデックス設計（purchase_date, category, payee, memo, 金額、横断検索）
    status: pending
  - id: auth-implementation
    content: 認証実装（Google OAuth＋Email/Password）とアカウント連携（同一メール/重複対策）
    status: pending
  - id: ledger-bootstrap
    content: 新規登録時の個人帳簿自動生成（household作成）と初期カテゴリ（少なめ約10）投入
    status: pending
  - id: rbac
    content: RBAC実装（household行レベルアクセス制御、ownerのみメンバー追加/監査閲覧など）
    status: pending
  - id: audit-log
    content: 監査ログ実装（取引/カテゴリ/インポート/添付の作成・更新・削除、閲覧は管理者＋owner）
    status: pending
  - id: transactions-crud
    content: 取引CRUD（収入/支出、購入日、payee、メモ、アカウントはMVP任意、円整数）
    status: pending
  - id: split-ui
    content: 取引分割UI（合計→内訳追加、残額表示、合計一致で確定）
    status: pending
  - id: refunds-flow
    content: 返金/取消フロー（元取引から返金作成し紐付け、集計に反映）
    status: pending
  - id: receipt-upload-storage
    content: レシート/添付のアップロード基盤（GCS、署名付きURL、画像のみ、保持はユーザー設定、上限: 取引あたり最大3枚）
    status: pending
  - id: receipt-multi-crop-ui
    content: 複数レシート対応（自動検出＋手動トリミング/分割調整UI）
    status: pending
  - id: ocr-pipeline
    content: OCR/構造化パイプライン（Vision OCR[日英]→OpenAIでJSON化＋カテゴリ推定、必ず確認して確定）
    status: pending
  - id: receipt-review-ui
    content: レシート登録UI（自動入力→ユーザー確認/承認、店名/日付/明細/分割/カテゴリの編集、行追加削除）
    status: pending
  - id: payee-normalization
    content: 店名表記ゆれ正規化（候補提示→承認、辞書/履歴管理の方針決定）
    status: pending
  - id: duplicate-detection
    content: 重複検知（手入力/CSV/レシート）と警告＋候補一覧モーダル（統合/破棄）
    status: pending
  - id: calendar-view
    content: カレンダー（月）表示（シンプル、日別合計＋日付フォーカスの簡潔明細）
    status: pending
  - id: dashboard-polish
    content: ダッシュボード（見やすい/わかりやすい、下に日別の簡潔明細、グラフ作り込み）
    status: pending
  - id: search
    content: 単一検索欄の横断検索（店名/メモ/カテゴリ/金額文字列）＋フィルタ
    status: pending
  - id: csv-import-amounts
    content: `amounts.csv` 互換CSVインポート（列: 金額,日付,メモ,カテゴリー名／符号で収支判定／カテゴリマップ）
    status: pending
  - id: csv-import-moneyforward
    content: マネーフォワードCSVインポート（形式特定→マッピングUI→プレビュー→取り込み、重複候補提示）
    status: pending
  - id: csv-export
    content: CSVエクスポート（期間/帳簿/カテゴリ等で出力、全量エクスポートはCSVで十分）
    status: pending
  - id: recurring-basic
    content: 定期収支（毎月同じもの自動生成、編集/停止、カレンダー反映）
    status: pending
  - id: cost-guardrails
    content: コストガード（解析回数制限＋安価モデル/低解像度へ自動切替、コスト超過をUI表示）
    status: pending
  - id: backup-restore
    content: バックアップ/復旧（DB自動バックアップ、ユーザー向けエクスポート、完全削除ポリシー）
    status: pending
  - id: testing
    content: テスト（RBAC境界、分割/返金整合、OCR構造化スキーマ検証、集計回帰、CSV取り込み）
    status: pending
  - id: observability
    content: 監視/ログ（エラー監視、ジョブ失敗の再試行、OCR/LLMのメトリクス）
    status: pending
isProject: false
---

## ゴール/スコープ（今回の計画対象）
- **対象ユーザー**: あなた＋お母様（2名中心。将来の追加も考慮）
- **共有方針**: 基本は**完全に別々の帳簿**（共有なし）。ただしownerがユーザー追加・権限設定して**共有帳簿も作れる**設計にする
- **利用デバイス**: iPhone/Android/PC/タブレット（レスポンシブ前提、文字大きめ・高コントラスト寄り）
- **必須機能（MVP）**
  - 手入力での収入/支出登録（現金・銀行・クレカ・投資の区分を持てる）
    - 1取引を**複数カテゴリに分割**できる（例: 食費＋日用品）
    - 返品/返金は**元取引と紐付け**て扱える
    - アカウント未設定の場合は **現金をデフォルト**（後で変更可）
    - クレカは当面 **シンプル扱い（支出として記録のみ）**
  - レシート画像アップロード→自動抽出→確認→登録
    - **Google Vision APIでOCR**
    - **OpenAI APIで構造化（店名/日付/合計/明細）＋カテゴリ推定**
    - 1枚の画像に**複数レシート**が写っていても扱える（頻出前提）
  - カテゴリ（**少なめの初期セット（約10）**＋カスタム）
  - メモ（プレーンテキスト）
  - カレンダー表示（閲覧中心）
  - 集計（最低限）: 月次合計、カテゴリ別内訳、推移、検索/フィルタ（**見た目も重視**）
  - 検索: **1つの検索欄**で店名/メモなどを横断検索 + 絞り込み
  - CSVインポート/エクスポート（自作フォーマット + **マネーフォワード**想定）
    - マネーフォワード取込は、サンプルCSV（個人情報を伏せたもの）を用意して形式確定してから実装
- **非対象（初期は後回し）**
  - 通知（不要）
  - 口座間振替・残高厳密管理（今回は「収入/支出のみ」前提）
  - PWA/ネイティブ（当面はWebのみ）

## 推奨アーキテクチャ（GCP）
精度重視かつ2人利用で運用を軽くする前提で、まずは**サーバレス寄り**を推奨します。

### 推奨案A（バランス良い・実装しやすい）
- **フロント/バック**: Next.js（フルスタック）
  - UI + API（Route Handlers）
- **実行基盤**: Cloud Run（コンテナ）
- **DB**: Cloud SQL for PostgreSQL
  - 集計/検索/将来の複雑化に強い
- **オブジェクト保存（レシート画像）**: Cloud Storage
  - 画像保持は**任意**にし、基本は抽出後破棄も可能
  - 将来/早期要望の「添付（画像）」も同じ基盤で扱える（MVP: 画像のみ）
- **認証**: Google OAuth + Email/Password
  - NextAuth/Auth.js などで実装（どちらにも対応）
- **秘密情報管理**: Secret Manager（Vision/OpenAIキー）
- **非同期処理**（後述のOCR/構造化を安全に）
  - Cloud Tasks + Cloud Run（ジョブ/ワーカー）

### 代替案B（Firebase中心で最短）
- Hosting + Auth + Firestore + Storage + Cloud Functions
- 小規模には強いが、**集計/検索・明細の正規化**が増えると設計が難化しやすい

### 代替案C（最小運用でAPI分離）
- フロント: Next.js（静的/SSR）
- API: Cloud Functions/Cloud Run
- DB: Cloud SQL

## データモデル（推奨：PostgreSQL想定）
最低限の正規化で「収入/支出」「カテゴリ」「家族共有」「レシート抽出」を扱います。
- `users`: ログインユーザー
- `households`: 帳簿単位（デフォは個人用。必要なら共有用も作成）
- `memberships`: householdとuserの紐付け（ownerがユーザー追加、**ロールベース権限**）
  - ロール: **owner / editor / viewer**（3段階で固定）
- `accounts`: 資産区分（現金/銀行/クレカ/投資）
- `categories`: デフォルト＋カスタム（household単位）
- `transactions`: 収入/支出（type, **purchase_date**, total_amount, account_id, memo, payee/store）
- `transaction_splits`: 取引分割（transaction_id, category_id, amount, note）
- `refunds`: 返金/取消（refund_transaction_id, original_transaction_id, reason）
- `receipts`: レシート処理単位（画像メタ、OCRテキスト、抽出JSON、ステータス）
- `receipt_items`: 明細行（name, qty, unit_price, amount, inferred_category_id など）
- `imports`: CSVインポート履歴（元ファイル、マッピング、結果）
- `audit_logs`: 監査ログ（誰が/いつ/何を変更したか）
- `attachments`: 添付（取引/レシートに紐付くファイル。GCSオブジェクト参照）

画像保持方針（あなたの回答に合わせる）:
- 基本: **抽出結果のみ保存**
- 画像保存は**ユーザー設定**でON/OFF・保持期間を選べるようにする
  - ONの場合はCloud Storageに保存し、ライフサイクルで低コスト化（Nearline/Archive移行や期限削除）
  - 「Google Drive保存」は権限/共有/実装が増えるため、まずはGCS推奨

## 主要ユーザーフロー
### 手入力
1. 収入/支出を入力（購入日、金額、カテゴリ（分割可）、アカウント、メモ）
   - 分割UI: **合計→内訳追加**（残額表示、合計一致で確定）
2. 保存→カレンダー/一覧/集計に反映
3. 返金/取消が発生したら元取引から「返金を作成」して紐付け

### レシート（精度重視フロー）
1. 画像アップロード（撮影/アップロード両対応）
2. 画像内のレシート領域を検出・切り出し（複数レシート対応）
   - 自動検出に加えて、ユーザーが**トリミング/分割を手動調整**できる
3. Vision OCR（テキスト抽出）
4. OpenAIで構造化（JSONスキーマに合わせて出力） + カテゴリ推定（自動適用）
5. 画面で「確認・修正」（合計/日付/店名/明細/分割/カテゴリ）※**必ず人が確認して確定**
6. 確定→`transactions`/`transaction_splits`/`receipt_items`作成

### カレンダー
- 月表示: 日別合計（収入/支出）＋当日内訳のドリルダウン
- 開始曜日: **ユーザー設定（ユーザー単位）**で変更可能（例: 日曜始まり/月曜始まり）

### CSV
- Export: 期間/カテゴリ/アカウントで出力
- Import: 自作CSV + マネーフォワード想定（列マッピング/プレビュー/重複検知）で取り込み
  - `amounts.csv` 互換（例）:
    - 列: `金額,日付,メモ,カテゴリー名`
    - `金額`: マイナス=支出、プラス=収入（typeへ変換）
    - `日付`: `YYYY/MM/DD` を purchase_date に
    - `メモ`: memo（店名欄は設けず、ここに統合）
    - `カテゴリー名`: categoriesへマッピング（未存在は一旦「未分類」へ寄せ、取り込み前レビューで一括マッピング/新規作成できる。未分類のまま確定も可）
      - 権限: **カテゴリ新規作成はownerのみ**（editor/viewerは既存カテゴリへのマッピングのみ）
    - 取込時に重複候補（同日・同額・類似メモ等）を提示（警告＋候補一覧モーダル）

## Vision/OpenAI連携設計（精度・安全性）
- **構造化JSONの厳格化**
  - OpenAIには「出力JSONスキーマ」「必須フィールド」「金額/日付の正規化ルール」を与える
- **再現性/監査**
  - `receipts`に「OCR原文」「モデル出力」「確定後の差分（ユーザー修正）」を保存できる設計
  - 将来的に「補正学習（ルール）」に利用
- **失敗時フォールバック**
  - OCR失敗: 手入力へ誘導
  - 構造化失敗: 抽出できた範囲はフォームへ**可能な限りプレフィル**し、ユーザーが修正して確定（元画像はユーザーが参照できる前提）
- **コスト/レート制御**
  - 画像は圧縮/サイズ制限
  - 解析は非同期化し、同時実行数を制御（Cloud Tasks）
  - 月額目安（3,000円）を超えそうな場合は、解析回数制限＋安価モデル/低解像度に自動切替

## UX設計の追加ポイント（精度と迷わなさ）
- レシート/CSV/手入力の重複を検知したら、**警告＋候補一覧モーダル**で確認・統合/破棄を促す
- 店名（payee）は自由入力を基本にしつつ、OCR結果や過去データを元に**表記ゆれ正規化**（OpenAI）を行う
- メモは詳細画面中心（一覧は情報過多にしない）
- コスト（Vision/OpenAI）の消費を**UIで可視化**（今月の概算、上限までの残り、節約モードの作動状況）
  - 上限超過時: **解析ボタンを無効化**し、手入力へ誘導（理由と再開条件を表示）
- 取引/添付の削除は**即時完全削除**（ゴミ箱・Undoなし）。誤操作対策は削除確認ダイアログで担保
  - 文言: **「本当に削除しますか？（復元不可）」**

## セキュリティ/プライバシー
- household単位の行レベルアクセス制御（全APIで必須）
- 画像URLは署名付きURL（短期）で配布
- Secret ManagerでAPIキー保管
- 監査ログ（必須）: 取引/カテゴリ/インポート等の作成・更新・削除
  - 閲覧範囲: **アプリ管理者 + household owner**

## 画面（MVP）
- 認証（ログイン/招待）
- 初回オンボーディング（最小）: **個人帳簿を自動生成**
- ダッシュボード（月次サマリ）
- 取引一覧（検索/フィルタ）
- 取引登録/編集（手入力）
- レシートアップロード→解析結果確認→登録
- 添付アップロード（取引/レシートに紐付け）
- カテゴリ管理（追加/編集）
- カレンダー（月表示）
- CSVインポート/エクスポート

## マイルストーン案
- **M0: 基盤**: 認証、招待制household、RBAC、監査ログ、取引CRUD（分割/返金含む）
- **M1: カテゴリ/メモ/単一検索欄（横断検索）**
- **M2: レシート解析（複数レシート対応、Vision→OpenAI）+ 確認UI**
- **M3: カレンダー表示 + 月次/カテゴリ集計 + 推移（可視化の作り込み）**
- **M4: CSV入出力（自作＋マネーフォワード）**
- **M5: 画像保持（ユーザー設定）+ ライフサイクル最適化 + コスト監視**

## 定期収支（確定取引として扱う）
- 定期収支は「予定」ではなく、**将来分も確定取引として自動生成**し、次月以降のダッシュボード/集計に含める
- その月だけ/それ以降の金額変更に対応（将来分の再生成や差分適用を含む）

## テスト方針（最小）
- APIの認可（household境界）テスト
- レシート構造化のスキーマ検証テスト（サンプル画像/テキスト）
- 集計の回帰テスト（月次、カテゴリ）
- 分割/返金の整合性テスト（元取引との紐付け、集計への反映）

## 主要な未確定事項（計画内でデフォルト採用）
- **技術スタック**: Next.js + Cloud Run
- **DB**: Cloud SQL（PostgreSQL）
- **画像保存**: Cloud Storage（必要なら低頻度/アーカイブへ自動移行）
- **コスト目安**: 月3,000円以内を基本ターゲット（OCR/LLM利用量で変動するため上限ガードを設計）
- **環境**: 最初は1環境（後でdev/prod分離できるよう命名と構成は意識）

必要なら、あなたの好みに合わせて「Firebase案」へ差し替えた計画にもできます。
