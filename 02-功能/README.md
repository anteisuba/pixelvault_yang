# 02 · 功能（按能力域拆）

> 範疇：後端與業務邏輯能力，按領域切分。不含頁面實作，不含測試。
>
> 狀態說明：判斷**當前代碼現狀**請先讀 `02-現狀映射.md`；`03-工作包細分.md`、`功能-實作落地清單.md`、`功能-路線決策結論書.md` 屬於工作包與路線文檔，不等於已上線能力清單。

## L2 拆解

### 2.1 身份與帳戶體系

- 2.1.1 Clerk 認證 & Session
- 2.1.2 用戶 Profile / 用戶名
- 2.1.3 API Key 管理
- 2.1.4 Civitai Token 管理

### 2.2 圖像生成能力

- 2.2.1 文生圖（T2I）
- 2.2.2 圖生圖 / 編輯（I2I / Edit）
- 2.2.3 圖像分析 / 拆解（Analysis / Decompose）
- 2.2.4 Studio 一站式生成編排

### 2.3 視頻生成能力

- 2.3.1 短視頻生成
- 2.3.2 長視頻 / Pipeline
- 2.3.3 視頻參數校驗

### 2.4 音頻生成能力

- 2.4.1 TTS / 配音
- 2.4.2 Fish Audio 音色庫

### 2.5 Character Card 體系

- 2.5.1 Character Card CRUD
- 2.5.2 Character 精修 / 評分
- 2.5.3 Background Card
- 2.5.4 Style Card
- 2.5.5 Card Recipe / Recipe Compiler

### 2.6 Storyboard / 敘事

- 2.6.1 Project 管理
- 2.6.2 Story 結構與生成

### 2.7 社群互動

- 2.7.1 Follow
- 2.7.2 Like
- 2.7.3 Collection 收藏夾
- 2.7.4 Gallery 公開/私密可見性

### 2.8 Arena 競技

- 2.8.1 對戰配對與投票
- 2.8.2 歷史記錄
- 2.8.3 排行榜 / ELO

### 2.9 Prompt & LLM 輔助

- 2.9.1 Prompt Enhance
- 2.9.2 Prompt Assistant
- 2.9.3 Prompt 反饋
- 2.9.4 LLM 通用文本服務

### 2.10 模型治理

- 2.10.1 Model Config 註冊
- 2.10.2 Model Health 健康監測
- 2.10.3 Provider Adapter（8 adapters）

### 2.11 LoRA 訓練

- 2.11.1 訓練任務提交
- 2.11.2 訓練狀態 / 輪詢

### 2.12 計費與用量

- 2.12.1 請求成本 / Free Tier 限額
- 2.12.2 Usage Summary
- 2.12.3 Generation Feedback

### 2.13 存儲與資產

- 2.13.1 R2 上傳 / 讀取
- 2.13.2 OG Image / Sitemap / Robots
- 2.13.3 永久歸檔策略

### 2.14 基礎設施

- 2.14.1 Logger / Retry / Circuit Breaker
- 2.14.2 Prompt Guard / LLM Output Validator
- 2.14.3 Route Factory / auth 邊界
- 2.14.4 Webhook 接入

---

**下一步**：L3 將針對每個能力域拆 service / API / 資料流。
