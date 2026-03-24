[English](README.md) | **日本語** | [中文](README.zh.md)

# PixelVault — パーソナル AI ギャラリー

マルチモデル AI 画像・動画生成プラットフォーム。永久アーカイブ、ブラインド投票アリーナ、ストーリーボード作成機能を搭載。

**ライブデモ:** [https://pixelvault-seven.vercel.app/](https://pixelvault-seven.vercel.app/)

---

## 機能

- **マルチモデル AI 生成** — 6 プロバイダーから 11 の画像モデル + 10 の動画モデル
- **アリーナ（ブラインド投票）** — ELO ランキングシステムによるサイドバイサイド比較
- **ストーリーボード** — AI 生成のコミック風ナラティブシーケンス
- **ギャラリー** — 検索・フィルター・無限スクロール付きの公開フィード
- **プロフィール** — 統計情報付き個人ライブラリ、R2 クリーンアップ対応の完全削除
- **プロンプト強化** — LLM によるプロンプト改善（OpenAI / Gemini / DeepSeek）
- **リバースエンジニアリング** — 既存画像から生成パラメータを抽出・分析
- **BYOK（Bring Your Own Key）** — プレミアムモデル向け暗号化 API キー管理
- **永久保存** — 全生成物を Cloudflare R2 に保存
- **クレジットシステム** — 新規ユーザーに無料クレジット付与、モデル別コスト階層
- **多言語対応** — 英語・日本語・中国語（`/en`、`/ja`、`/zh`）
- **モバイルファースト** — ボトムタブナビゲーション付きレスポンシブレイアウト

---

## AI モデル

### 画像モデル

| モデル | プロバイダー | ティア | クレジット |
|--------|-------------|--------|-----------|
| GPT-Image 1.5 | OpenAI | Premium | 3 |
| Gemini Pro Image | Google | Premium | 2 |
| FLUX 2 Pro | Fal | Premium | 2 |
| Seedream 4.5 | Replicate | Premium | 2 |
| Ideogram 3 | Replicate | Standard | 2 |
| Recraft V3 | Replicate | Standard | 2 |
| Gemini Flash | Google | Standard | 1 |
| FLUX 2 Dev | Fal | Standard | 1 |
| FLUX 2 Schnell | Fal | Budget | 1 |
| Animagine XL 4.0 | HuggingFace | Budget | 1 |
| Stable Diffusion XL | HuggingFace | Budget | 1 |

### 動画モデル

| モデル | プロバイダー | ティア | クレジット |
|--------|-------------|--------|-----------|
| Kling V3 Pro | Fal | Premium | 5 |
| Veo 3 | Google | Premium | 5 |
| Sora 2 | OpenAI | Premium | 5 |
| Seedance Pro | Replicate | Premium | 4 |
| MiniMax Hailuo | Fal | Standard | 3 |
| Luma Ray 2 | Fal | Standard | 3 |
| Pika 2.2 | Replicate | Standard | 3 |
| Kling V2 | Fal | Budget | 2 |
| Wan 2.2 | Fal | Budget | 2 |
| HunyuanVideo | HuggingFace | Budget | 2 |

---

## 技術スタック

| レイヤー | テクノロジー |
|---------|-------------|
| フレームワーク | Next.js 16 (App Router + Turbopack) |
| 言語 | TypeScript (strict) |
| スタイリング | Tailwind CSS + shadcn/ui |
| 認証 | Clerk |
| データベース | PostgreSQL (Neon) via Prisma 7 |
| ストレージ | Cloudflare R2 |
| AI プロバイダー | HuggingFace, Google Gemini, OpenAI, Fal, Replicate |
| バリデーション | Zod |
| テスト | Vitest (97 テスト) |
| デプロイ | Vercel |

---

## プロジェクト構成

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/              # サインイン・サインアップ
│   │   └── (main)/
│   │       ├── studio/          # 画像・動画生成
│   │       ├── gallery/         # 公開ギャラリー + 詳細ビュー
│   │       ├── arena/           # ブラインド投票 + リーダーボード
│   │       ├── storyboard/      # AI ストーリーボード作成
│   │       └── profile/         # 個人ライブラリ + 統計
│   └── api/
│       ├── generate/            # POST — AI 生成 → R2 → DB
│       ├── arena/               # アリーナ対戦 + 投票
│       ├── api-keys/            # BYOK キー管理
│       ├── models/              # モデル一覧 + ヘルスチェック
│       ├── admin/               # 管理者モデル設定 CRUD
│       ├── credits/             # ユーザークレジット
│       └── webhooks/clerk/      # Clerk user.created 同期
│
├── components/
│   ├── ui/                      # shadcn/ui アトム（ステートレス）
│   ├── business/                # ステートフル UI（hooks 使用、直接 API 呼出不可）
│   └── layout/                  # Navbar, MobileTabBar
│
├── hooks/                       # クライアント側状態管理
├── services/                    # サーバー専用ビジネスロジック
├── constants/                   # 設定、enum、ルート
├── types/                       # Zod スキーマ + TypeScript 型
├── lib/                         # DB、API クライアント、ユーティリティ
└── messages/                    # i18n (en, ja, zh)
```

---

## はじめに

### 前提条件

- Node.js 20+
- PostgreSQL データベース（Neon 推奨）
- Cloudflare R2 バケット
- Clerk アカウント
- 少なくとも 1 つの AI プロバイダーの API キー

### 環境変数

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgresql://...

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=

# AI Providers（少なくとも 1 つ必要）
HUGGINGFACE_API_KEY=hf_...
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...
FAL_KEY=...
REPLICATE_API_TOKEN=r8_...
```

### インストール & 起動

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

---

## 開発状況

| フェーズ | ステータス | 内容 |
|---------|----------|------|
| Phase 1 | 完了 | MVP — コア生成フロー |
| Phase 2 | 完了 | 永続化 — Prisma + Cloudflare R2 |
| Phase 3 | 完了 | ユーザーシステム + クレジット |
| Phase 4 | 完了 | ギャラリー、プロフィール、ストーリーボード、アリーナ |
| Phase 5 | 完了 | UX 改善、セキュリティ強化、動画生成 |

---

## セキュリティ

- AES-256-GCM による API キー暗号化保存
- トークンバケット方式レート制限（生成 10 req/min、動画 5 req/min）
- 画像アップロードバリデーション（最大 10MB、MIME タイプチェック）
- エラーメッセージのサニタイズ（内部情報の漏洩防止）
- Webhook リプレイ保護
- サーバーサイドのみのクレジット差引
- `NEXT_PUBLIC_` プレフィックスで AI キーや DB 認証情報を公開しない

---

## アーキテクチャ原則

- **マジックバリュー禁止** — すべての設定は `src/constants/` に集約
- **厳密な TypeScript** — `any` 禁止、Zod スキーマで型定義
- **レイヤードアーキテクチャ** — constants → types → services → hooks → components
- **薄い API ルート** — 認証チェック + Zod パース + サービス呼出のみ
- **サーバーサイドクレジットロジック** — クライアントからのクレジット値を信頼しない
