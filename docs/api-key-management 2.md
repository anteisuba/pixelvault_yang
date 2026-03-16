# 用戶 API Key 管理 + Image-to-Image 功能文檔

## 概覽

本功能允許用戶在 Studio 頁面管理自己的 AI API Keys，生成時優先使用用戶自己的 Key；同時支援上傳參考圖進行 img2img 生成。

---

## 數據庫

### 新增 `UserApiKey` 表

```prisma
model UserApiKey {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  modelId      String   // 存儲內建模型 ID 或自定義模型 ID
  providerType String   // 'huggingface' | 'gemini'
  label        String   // 用戶自定義標籤
  encryptedKey String   // AES-256-GCM 加密後的 key
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId, modelId])
}
```

**設計要點：**

- `modelId` 存儲具體模型 ID，可以是內建模型，也可以是用戶自定義 ID
- `providerType` 用來標記走哪一個 provider adapter（目前支援 `huggingface` / `gemini`）
- `encryptedKey` 使用 AES-256-GCM 加密，密鑰來自 `API_KEY_ENCRYPTION_SECRET` 環境變數
- 每個模型同時只有一條 key 可以是 `isActive: true`（radio 互斥）

---

## 環境變數

```bash
# 必須新增：API Key 加密密鑰（32 bytes hex）
# 生成方式：openssl rand -hex 32
API_KEY_ENCRYPTION_SECRET="<32-byte-hex>"
```

---

## 文件結構

```
src/
├── constants/
│   └── api-keys.ts              # API key provider 選項
├── lib/
│   └── crypto.ts                # AES-256-GCM 加/解密工具（server-only）
├── services/
│   └── apiKey.service.ts        # API Key CRUD 服務（server-only）
├── app/api/
│   ├── api-keys/route.ts        # GET /api/api-keys、POST /api/api-keys
│   └── api-keys/[id]/route.ts   # PUT /api/api-keys/:id、DELETE /api/api-keys/:id
├── hooks/
│   └── use-api-keys.ts          # 客戶端狀態管理 hook
├── contexts/
│   └── api-keys-context.tsx     # React Context，共享 API key 狀態
└── components/business/
    ├── ApiKeyManager.tsx         # API Key 管理 UI
    └── ApiKeyDrawerTrigger.tsx   # Studio 頁面右上角的 Sheet 觸發器
```

---

## Key 選擇機制

### 內建模型 → Key 對應關係

| 模型                   | `modelId` 欄位值                 | `providerType` | Env fallback          |
| ---------------------- | -------------------------------- | -------------- | --------------------- |
| Stable Diffusion XL    | `sdxl`                           | `huggingface`  | `HF_API_TOKEN`        |
| Animagine XL 4.0       | `animagine-xl-4.0`               | `huggingface`  | `HF_API_TOKEN`        |
| Gemini 3.1 Flash Image | `gemini-3.1-flash-image-preview` | `gemini`       | `SILICONFLOW_API_KEY` |

自定義模型 ID 也可以保存，但它們必須依賴用戶自己的 active key，不會走平台 fallback。

### 生成時的 key 優先順序

```
用戶為該模型設定的 active key  →  .env.local 平台 key（fallback）
```

生成路由核心邏輯（`src/app/api/generate/route.ts`）：

```ts
const userKey = await getActiveApiKeyValue(dbUser.id, modelId)
const envFallbackName = getProviderEnvFallback(providerType)
const resolvedKey =
  userKey ?? (envFallbackName ? process.env[envFallbackName] : null)
```

---

## API Key 管理 UI

### 入口

Studio 頁面右上角的「API Keys」按鈕，點擊後打開側邊 Sheet（`ApiKeyDrawerTrigger`）。

### 狀態共享

`ApiKeysProvider`（React Context）包裹整個工作區 section，`ApiKeyManager` 和 `GenerateForm` 共用同一份 `useApiKeys` 狀態。新增/刪除 key 後，表單區即時更新，無需刷新頁面。

```
ApiKeysProvider
├── ApiKeyDrawerTrigger > ApiKeyManager   (管理 key)
└── GenerateForm                          (讀取 active key 狀態)
```

### Radio 互斥選擇

每個模型最多同時一條 key 為 "In use"：

- 點擊 `○` 圓圈 → 該 key 變為 active（`isActive: true`），其他同模型 key 自動停用
- 停用時顯示空圓圈，使用中顯示填滿的 `✓` 圓圈 + 藍色邊框 + "In use" badge

### 新增 Key 時的模型輸入方式

新增表單分成兩步：

- 先選 `providerType`（HuggingFace / Gemini）
- 再選內建模型，或輸入自定義 `modelId`

### 新增 Key 時的 active 行為

- 第一條 key：自動設為 active
- 後續 key：預設 inactive，需手動選擇

---

## 模型選擇器整合

`ModelSelector` 現在同時顯示：

- 內建模型（永遠可選，優先用 active key，否則再走平台 fallback）
- 已啟用的自定義模型（只要 active key 存在就會出現在下拉中）

`GenerateForm` 的 model info panel 會顯示：

- 目前使用的 active key label + masked key
- 或者顯示會回退到平台 key 的說明
- 若是自定義模型，顯示它的 `modelId`

---

## Image-to-Image（img2img）

### UI

`GenerateForm` 下方可折疊的「Reference Image」面板：

- 支援拖拽 / 點擊上傳（PNG / JPG / WebP）
- 客戶端轉換為 base64 data URL，預覽縮略圖
- 有參考圖時顯示「img2img」badge
- 點擊 `×` 移除參考圖

### API

`GenerateRequestSchema` 新增可選欄位：

```ts
referenceImage: z.string().optional() // base64 data URL
```

### HuggingFace img2img

```ts
body.image = referenceImage // 加入 inputs 旁的 image 參數
```

### Gemini img2img

在 `contents.parts` 陣列中額外插入 `inlineData`：

```ts
parts.push({
  inlineData: {
    mimeType: 'image/jpeg', // 從 data URL 解析
    data: '<base64>',
  },
})
```

---

## API Endpoints

### `GET /api/api-keys`

返回當前用戶的所有 API Keys（key 值做 mask 處理，不暴露原始值）。

**響應：**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "modelId": "gemini-3.1-flash-image-preview",
      "providerType": "gemini",
      "label": "My Gemini Key",
      "maskedKey": "AIza****...****iFwk",
      "isActive": true,
      "createdAt": "2026-03-14T00:00:00Z"
    }
  ]
}
```

### `POST /api/api-keys`

新增一條 API Key。

**請求：**

```json
{
  "providerType": "gemini",
  "modelId": "gemini-3.1-flash-image-preview",
  "label": "My Gemini Key",
  "keyValue": "AIzaSy..."
}
```

`modelId` 可以是內建模型值，也可以是任意自定義模型 ID；`providerType` 目前支援 `huggingface`、`gemini`。

### `PUT /api/api-keys/:id`

更新 label 或 isActive。設為 `isActive: true` 時，同模型其他 key 自動停用。

**請求：**

```json
{ "isActive": true }
```

### `DELETE /api/api-keys/:id`

刪除指定 Key（驗證 ownership）。返回 `204 No Content`。

---

## 安全機制

| 措施           | 實現方式                                                      |
| -------------- | ------------------------------------------------------------- |
| 傳輸安全       | HTTPS + Clerk JWT 驗證                                        |
| 存儲加密       | AES-256-GCM，密鑰來自 `API_KEY_ENCRYPTION_SECRET`             |
| Ownership 驗證 | PUT/DELETE 驗證 `userId` 一致                                 |
| 返回值遮罩     | 只返回 `maskedKey`（`hf_****...****abc4`），原始 key 從不洩漏 |
| 路由保護       | `/api/api-keys` 不在 public routes 列表，Clerk 自動保護       |
