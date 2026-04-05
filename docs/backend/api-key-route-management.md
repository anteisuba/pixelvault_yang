# 用戶 API Route 管理與自定義 Provider 文檔

## 概覽

Studio 現在把「API key 管理」升級成「provider route 管理」。

每一條保存的 route 都包含：

- `adapterType`：決定請求格式與回應解析方式
- `providerConfig`：包含自定義 `label` 與 `baseUrl`
- `modelId`：內建模型 ID 或任意自定義模型 ID
- `encryptedKey`：加密後保存的 API key
- `isActive`：是否讓這條 route 出現在 Studio 模型選擇器中

這個結構的目的是把「誰來執行請求」和「請求發到哪裡」拆開：

- `adapterType` 是執行器
- `providerConfig` 是具體路由配置

目前內建 adapter 仍然只有：

- `huggingface`
- `gemini`
- `openai`

但同一個模型現在可以同時保存多條 provider routes，不再受舊的 `providerType` 單值設計限制。

---

## 數據庫

### `UserApiKey` 表

```prisma
model UserApiKey {
  id             String   @id @default(uuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  modelId        String
  adapterType    String
  providerConfig Json
  label          String
  encryptedKey   String
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, modelId, adapterType])
}
```

### `providerConfig` 內容

```json
{
  "label": "HuggingFace",
  "baseUrl": "https://router.huggingface.co/hf-inference/models"
}
```

### 設計要點

- `adapterType` 只描述執行協議，不再直接代表最終 provider 名稱
- `providerConfig.label` 用於 UI 與生成記錄中的 provider 展示
- `providerConfig.baseUrl` 允許把請求路由到自定義 endpoint 或兼容代理
- `isActive` 現在表示「是否在 Studio 中啟用這條 route」，不再是同模型互斥 radio

---

## 環境變數

```bash
# 必須新增：API Key 加密密鑰（32 bytes hex）
# 生成方式：openssl rand -hex 32
API_KEY_ENCRYPTION_SECRET="<32-byte-hex>"
```

內建 workspace routes 仍然可以使用服務端環境變數作為 fallback key：

| 內建模型                         | `adapterType` | fallback env          |
| -------------------------------- | ------------- | --------------------- |
| `sdxl`                           | `huggingface` | `HF_API_TOKEN`        |
| `animagine-xl-4.0`               | `huggingface` | `HF_API_TOKEN`        |
| `gemini-3.1-flash-image-preview` | `gemini`      | `SILICONFLOW_API_KEY` |
| `gpt-image-1.5`                  | `openai`      | `OPENAI_API_KEY`      |

---

## 文件結構

```text
src/
├── constants/
│   ├── api-keys.ts
│   ├── models.ts
│   └── providers.ts
├── services/
│   └── apiKey.service.ts
├── app/api/
│   ├── api-keys/route.ts
│   ├── api-keys/[id]/route.ts
│   └── generate/route.ts
├── hooks/
│   └── use-api-keys.ts
├── contexts/
│   └── api-keys-context.tsx
└── components/business/
    ├── ApiKeyManager.tsx
    ├── ApiKeyDrawerTrigger.tsx
    ├── GenerateForm.tsx
    └── ModelSelector.tsx
```

---

## Route 類型

### 1. Workspace route

由內建模型常量提供，始終可選：

- Stable Diffusion XL
- Animagine XL 4.0
- Gemini 3.1 Flash Image
- OpenAI GPT Image 1.5

這些 route 使用內建的：

- `adapterType`
- `providerConfig`
- env fallback key

### 2. Saved route

由用戶在 API Routes 面板中新增，可針對：

- 內建模型 ID
- 自定義模型 ID

保存 route 時可以自定義：

- adapter
- provider label
- provider base URL
- model ID
- API key

只要 `isActive: true`，這條 route 就會出現在 Studio 的模型選擇器中。

---

## 生成時的路由規則

### 1. 用戶在 Studio 選中 workspace route

- 使用內建模型的 `adapterType`
- 使用內建模型的 `providerConfig`
- 使用服務端 env fallback key

### 2. 用戶在 Studio 選中 saved route

- 使用該條記錄保存的 `adapterType`
- 使用該條記錄保存的 `providerConfig`
- 使用該條記錄保存的解密 key

### 3. 自定義模型

自定義模型只能透過 saved route 執行。

如果提交的是自定義 `modelId`，但沒有選中對應的 `apiKeyId`，API 會直接返回 `400`。

---

## `generate` 路由行為

`src/app/api/generate/route.ts` 的請求流大致如下：

```ts
if (apiKeyId) {
  // 用戶顯式選中了 saved route
  resolvedAdapterType = selectedApiKey.adapterType
  resolvedProviderConfig = selectedApiKey.providerConfig
  resolvedKey = selectedApiKey.keyValue
} else if (builtInModel) {
  // 走 workspace route
  resolvedAdapterType = builtInModel.adapterType
  resolvedProviderConfig = builtInModel.providerConfig
  resolvedKey = process.env[getAdapterEnvFallback(builtInModel.adapterType)]
} else {
  throw new Error('Custom models require selecting an active API key')
}
```

之後根據 `adapterType` 分發到對應 adapter：

- `huggingface` -> `generateWithHuggingFace`
- `gemini` -> `generateWithGemini`
- `openai` -> `generateWithOpenAI`

生成記錄中保存的 `provider` 字段來自 `providerConfig.label`。

---

## UI 行為

### Studio 模型選擇器

`ModelSelector` 現在會同時顯示：

- 內建的 workspace routes
- 所有已啟用的 saved routes

如果是 saved route，UI 會顯示：

- route 類型
- provider label
- provider base URL
- 對應的 saved key label / masked key

### API Routes 面板

`ApiKeyManager` 現在支持：

- 選擇 `adapterType`
- 自定義 `providerConfig.label`
- 自定義 `providerConfig.baseUrl`
- 綁定內建模型或自定義模型 ID
- 啟用 / 停用 route
- 刪除 route

注意：

- 啟用/停用只影響該條 route 是否出現在 Studio 中
- 不會再自動停用同模型的其他 route

---

## API Endpoints

### `GET /api/api-keys`

返回當前用戶保存的所有 routes。

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "modelId": "gemini-3.1-flash-image-preview",
      "adapterType": "gemini",
      "providerConfig": {
        "label": "Gemini",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta/models"
      },
      "label": "My Gemini Route",
      "maskedKey": "AIza****...****iFwk",
      "isActive": true,
      "createdAt": "2026-03-14T00:00:00Z"
    }
  ]
}
```

### `POST /api/api-keys`

新增一條 saved route。

```json
{
  "adapterType": "huggingface",
  "providerConfig": {
    "label": "My HF Proxy",
    "baseUrl": "https://router.huggingface.co/hf-inference/models"
  },
  "modelId": "black-forest-labs/FLUX.1-schnell",
  "label": "Flux route",
  "keyValue": "hf_xxx"
}
```

### `PUT /api/api-keys/:id`

更新 route label 或 `isActive`。

```json
{ "isActive": false }
```

### `DELETE /api/api-keys/:id`

刪除指定 route，返回 `204 No Content`。

---

## 安全機制

| 措施           | 實現方式                                          |
| -------------- | ------------------------------------------------- |
| 傳輸安全       | HTTPS + Clerk JWT 驗證                            |
| 存儲加密       | AES-256-GCM，密鑰來自 `API_KEY_ENCRYPTION_SECRET` |
| Ownership 驗證 | PUT / DELETE 只允許操作自己的 route               |
| 返回值遮罩     | 只返回 `maskedKey`，原始 key 不會返回到客戶端     |
| 路由保護       | `/api/api-keys` 為受保護路由                      |

---

## 與舊版本的差異

舊版本：

- `providerType` 是單一字符串字段
- 一個模型只能有一條 active key
- 內建模型會自動搶占 active key / fallback key

新版本：

- `adapterType` 和 `providerConfig` 分離
- 同一模型可以有多條同時啟用的 saved routes
- Studio 明確區分 workspace route 與 saved route
- provider label / base URL 可自定義
- 生成記錄可以保留實際 provider 展示名稱
