# 圖片一致性策略討論進展

> 日期：2026-04-27
> 狀態：DRAFT · 進行中
> 配套文檔：`docs/progress/2026-04-27-audit.md`（同日項目審計）
>
> **下一台機器接續位置：見文末「下次接續」章節**

---

## 起點問題

「圖片生成目前還是沒有解決一致性問題。只有兩種方法可用：提示詞 + LoRA。如何利用這些需要詳細討論。」

## 現狀澄清

實際代碼裡已有 **5 層一致性機制**（不只 prompt + LoRA）：

| 層                            | 內容                                                                    | 狀態                                    |
| ----------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| 1. 結構化角色描述             | `CharacterCard.attributes` 13 字段 + `characterPrompt` + `modelPrompts` | 字段在，`modelPrompts` 全鏈路用法沒看到 |
| 2. 多視角源圖                 | `sourceImageUrl` + `sourceImages` + `sourceImageEntries.viewType`       | schema 完整，UI 沒引導                  |
| 3. Recipe Compiler 兩階段融合 | LLM fusion + 模板 fallback + LoRA 合併（FAL 5/Replicate 1）             | ✅ 已實現                               |
| 4. Variant 系統               | `parentId` 父子卡片（動漫版/3D 版/Q 版）                                | schema 有，Studio UI 沒 surface         |
| 5. LoRA 訓練                  | `lora-training.service.ts` 雙 provider                                  | API 跑通，**0 測試**，`/studio` 無入口  |

## 一致性失效的 6 個根因

1. **Prompt-only 天花板** — 文字無法穩定還原臉/服裝細節，LLM fusion 把三卡揉一起反而稀釋 character 識別性
2. **i2i 雙刃劍** — sourceImage 保臉但拖走原圖 pose/光影；strength 太高不變、太低失真
3. **LoRA 瓶頸** — 公開 LoRA 是別人角色；自訓門檻高；多 LoRA 疊加打架；strength 與 base model 強耦合
4. **跨 provider 不一致** — `modelPrompts` 字段預留沒走通
5. **Seed 沒被當槓桿** — schema 有但 character card 不記「該角色用過哪個成功 seed」
6. **無迭代精修工作流** — `referenceImages` 字段預留但流程沒走通

## 5 條可走的路

| 路                                 | 改動                                                        | 成本 | 一致性提升 | 適合誰    |
| ---------------------------------- | ----------------------------------------------------------- | ---- | ---------- | --------- |
| A. Character Card 升級為一致性引擎 | 加 `referenceSeeds[]`+`bestGenerations[]`+ 自動 retry       | 中   | 中         | 全用戶    |
| B. 鎖定生成工作流                  | 第 1 張選 1，後續自動 i2i with anchor + 注入 same character | 低   | 中         | 漫畫/系列 |
| C. LoRA 訓練一等公民               | 8-15 張 → 一鍵訓練 → 寫回 character_card.loras              | 高   | **最高**   | 進階用戶  |
| D. Reference Sheet                 | 強制 5 視角才建卡                                           | 中   | 中高       | 原創作者  |
| E. 模型專門化路由                  | attributes.artStyle → 路由到對應最強 model                  | 低   | 低-中      | 小白      |

## 用戶的決策（2026-04-27 階段）

### ✅ 已定

| 決策點     | 選擇                                             |
| ---------- | ------------------------------------------------ |
| 目標用戶   | **B + C 都做** — 漫畫/系列 + 原創角色定制        |
| 一致性檔次 | **兩個模式**：簡單模式 = 提示詞；高級模式 = LoRA |
| 付費邊界   | **先走平台模型**，後續用戶多了上 credit          |

### ⏳ 待澄清（重要！）

「先走平台模型」有歧義，是 (a) 還是 (b)：

|                    | (a) 只 LoRA 訓練平台付                                | (b) 全部平台模型                           |
| ------------------ | ----------------------------------------------------- | ------------------------------------------ |
| 商業模式           | 仍 BYOK，與「Your Key, Your Images, Zero Markup」一致 | **變 SaaS**，與當前定位衝突                |
| 100 活躍用戶月成本 | ~$300（Replicate FLUX LoRA $2-3/次）                  | $2000-5000（訓練+生成全包）                |
| 工程改動           | 少（lora UI + 配額 gate）                             | 大（key 池/配額/計費/防濫用/key rotation） |

**我的判斷：(a) 才合理**。理由：BYOK 是核心差異化；全平台模型直接撞 Midjourney/Krea/OpenArt；訓練平台墊一次當 onboarding 甜頭是合理過渡。

**用戶確認 (a) 還是 (b)？** — **下次必須先答這個再往下做**。

## 下面的設計（按 (a) 假設）

### 簡單模式 — Prompt + 鎖定生成

**不靠模型靠工作流**，零成本零訓練。

流程：

1. Prompt → 生成 4 variants（B5 已有 `VariantGrid`+`selectWinner`）
2. 用戶選最像 → 該圖成 anchor
3. UI 顯示「🔒 已鎖定 [縮略圖]」
4. 後續生成自動：anchor 作 reference image + 注入「same character as reference」+ 帶 anchor seed
5. 手動點 🔒 解鎖

代碼改動（無新 service）：

- `studio-context.tsx` 加 `lockedAnchor` 狀態
- `use-unified-generate.ts` build payload 時注入 ref+seed
- `StudioCanvas.tsx` 鎖/解鎖 UI
- 新 hook `use-locked-generation.ts` + localStorage

可達成：同臉同服裝 70-80% 還原。

### 高級模式 — LoRA 訓練

**靠模型解，平台墊付首次訓練**。

流程：

1. character card 累積 8-15 張好圖
2. 點「訓練專屬模型」
3. Replicate FLUX LoRA training（$2-3/次）
4. 10-30 分鐘訓練，UI 顯示「🧬 訓練中 X%」
5. 成功 → safetensors 存 R2 → URL 寫回 `character_card.loras`
6. 之後該卡生成自動帶該 LoRA

配額（防失血）：

- 首次免費 1 次
- 第 2 次起 fallback BYOK Replicate/FAL key
- 或等 Phase E credit 系統

代碼改動（多）：

- `lora-training.service.ts` 補單測（0 測試 + 02-現狀映射 §2.11 已標）
- `/studio` LoRA 訓練入口 UI（roadmap F1 沒做）
- 訓練狀態輪詢前端（`use-lora-training.ts` 已有但沒接 Studio）
- 新 Prisma model `LoraTrainingQuota`（userId + freeUsedCount + lifetimeCount）
- 平台 Replicate/FAL key 配置 + `apiKeyId === 'platform'` 特殊分支
- `.tar→.safetensors` 提取失敗回退路徑（02-現狀映射 §2.11）

可達成：同臉 95%+，能記紋身/特定服裝；但 base model 鎖 FLUX。

### 兩模式接通

不是兩條獨立線。**簡單模式是高級模式的入口**：

```
新用戶
  ↓
簡單模式（鎖定生成）
  ↓ 累積 8+ 張同 anchor 好圖
  ↓
系統提示「累積 X 張了，要不要訓專屬模型？(首次免費)」
  ↓
高級模式（LoRA 訓練）
  ↓
之後該卡自動帶 LoRA
```

共享數據：`character_card.referenceImages[]`（已有）+ `bestGenerations[]`（schema 沒有，需加）。

## 上線順序

**不要兩個模式一起做**，分兩波：

### Wave 1（4-6 週）— 簡單模式

- 鎖定生成工作流（純前端 + studio-context）
- character card 加 `bestGenerations` 字段
- character card 詳情頁顯示「鎖定 N 次、最像的 X 張」
- **平台不花一分錢**

觀察指標：

- 鎖定使用率
- 鎖定後生成留存率
- 累積 8+ 張 anchor 的用戶占比

### Wave 2（6-8 週）— 高級模式 LoRA

- 補 lora-training 單測
- Studio LoRA 訓練 UI
- 配額系統 + 平台 key 注入
- Wave 1 累積 8+ 張的用戶**首批內測**

為什麼分波：

- Wave 1 零風險
- Wave 1 驗證「需要進階一致性」用戶比例（可能 80% 簡單模式夠用）
- Wave 2 上線時知道優先服務誰、配額怎麼設、成本怎麼估
- 不會 Wave 2 燒錢一半發現沒人用 LoRA

## 待用戶決定的 3 件事

1. **(a)/(b) 確認** — 「先走平台模型」是只 LoRA 訓練還是全部生成？
2. **「8 張」閾值** — Wave 1→Wave 2 觸發數字。我建議最低 10 張，但要看：漫畫作者容易湊 30+；原創角色定制可能只有 5-8
3. **首次免費後的退路**：
   - **A**：硬要求 BYOK Replicate/FAL key（推薦 — 與 BYOK 定位一致、最簡單）
   - B：等 Phase E credit 系統（2-3 個月後）
   - C：一次性 fee（PayPal/Stripe）

---

## 下次接續

**狀態**：方案大框架已定，等用戶答 3 個問題。

**下一個 message 應該回答的是**：

1. (a) 還是 (b)？
2. 8 張閾值是多少？
3. 首次免費後選 A/B/C？

回答完這 3 個問題後，下一步可以進入 Wave 1 的具體工程設計（schema 改動、studio-context 字段、UI 細節）。

**參考文檔**：

- 同日項目審計：`docs/progress/2026-04-27-audit.md`
- 現有 character card schema：`prisma/schema.prisma:455-499`
- recipe-compiler 邏輯：`src/services/recipe-compiler.service.ts`
- 現有 LoRA 訓練 service（0 測試）：`src/services/lora-training.service.ts`
- 已存在的 Variant 系統（UI 未 surface）：`prisma/schema.prisma:482-485`

**未實現但 schema/service 已有零件**（Wave 1/2 直接接通即可，不用新建）：

- `referenceImages` 字段（schema 預留）
- `Variant` parentId 父子卡片
- `selectWinner` 4-variants 選擇事務（B5）
- `multi-reference image` 多圖 i2i（W1）
- `lora-training.service` 雙 provider
- `use-lora-training.ts` hook
