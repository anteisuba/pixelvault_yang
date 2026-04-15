# WBS · 3 週開發計劃（基於已有工作包排序）

> 基準日期：2026-04-15 · 規劃週期：3 週（15 個工作日）
>
> **原則**：嚴格從 `01-UI/03` `02-功能/03` `03-功能測試/03` `04-UI測試/03` 四份工作包清單中挑選，不新增任何工作包。僅排優先級、依賴順序與交付節奏。
>
> **規模**：90 個工作包（UI 23 · 功能 24 · 功能測試 22 · UI 測試 21）中，**10 個 P0** 為本計劃核心目標。

---

## 1. 排序依據（三維約束）

### 1.1 優先級軸（已在 WP 本身標記）

- **P0（10 個）**：阻塞性風險或底層基石，本計劃必須完成
  - 功能 P0：WP-Usage-01 / WP-Usage-02 / WP-Storage-01 / WP-Video-01 / WP-Infra-01 / WP-StyleConsistency-01 / WP-StyleConsistency-02
  - UI P0：WP-Global-01 / WP-Gallery-02 / WP-Gallery-06
- **P1**：高價值但非阻塞（合計 26 個，本計劃**選擇性插入 3 個**作為緩衝）
- **P2**：文檔/決策/邊界體驗（合計 18 個）— 本計劃**全部不納入**

### 1.2 依賴軸（硬依賴明確存在）

```
WP-Infra-01 (with-retry)
    ├─► WP-Storage-01 (R2 wrapper，retry mock 共用策略)
    └─► WP-Image-03 (adapter 層 retry 行為驗證)

WP-Usage-01 (Job↔Ledger transaction)
    ├─► WP-Usage-02 (FreeTier 並發，依賴 transaction 基礎設施)
    └─► WP-Usage-03 (Ledger 漂移檢測)

WP-Video-01 (video-pipeline 單測)
    └─► WP-Video-02 (cancel/retry 端到端)

WP-StyleConsistency-01 (compileRecipe)
    ◄─ WP-StyleConsistency-02 (LoRA 合併，合併於同一測試文件)

WP-Storage-03 ◄── 與 WP-Gallery-05 + WP-Profile-05 共用 OG route 測試文件
WP-Studio-02 ◄── 被 WP-Global-02 吸收（studio/loading.tsx 屬 loading 補齊工程）
```

### 1.3 Effort 軸（本計劃工作日估算）

| Size | 工作日換算 | 本計劃 P0 數量   |
| ---- | ---------- | ---------------- |
| S    | 1 天       | 4                |
| M    | 2 天       | 5                |
| L    | 3 天       | 1（WP-Video-01） |

**P0 合計工作量**：4×1 + 5×2 + 1×3 = **17 個工作日**

→ 單人 3 週（15 天）略吃緊；**雙人並行 2 週（20 人日）** 可覆蓋全部 P0 並留 3 天 buffer。

---

## 2. Sprint 1（Week 1）· 韌性基礎 + 顯性缺口

> **目標**：把「無依賴且解鎖後續工作」的 P0 先清掉，建立 mock 模板共用基礎。

### 為什麼這個順序

- **WP-Infra-01** 無任何依賴，且其 retry mock 策略會被 Sprint 1 的 Storage-01 直接借用 → 放第一天
- **WP-Global-01** 是項目**完全缺失的 not-found 頁**（P0），獨立、工作量小 → 早做早安心
- **WP-Storage-01** 依賴 Infra-01 的 retry 模式 → 排在 Infra-01 之後
- **WP-Gallery-06** 獨立小件，可在收尾時做

### Day-by-Day

| Day | 工作包                            | Effort | 交付驗收                                                                                                                               |
| --- | --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | WP-Infra-01 · with-retry 單測     | S      | TC-Infra-01：7 路徑（5xx/429/4xx/驗證/maxAttempts/backoff/jitter/自訂 isRetryable）· CI 穩定性 100%                                    |
| 2   | WP-Global-01 · 補 not-found.tsx   | S      | TC-Global-01：三語 404 + 根級 fallback + Playwright 訪問 `/zh/__nonexistent__` smoke                                                   |
| 3-4 | WP-Storage-01 · R2 wrapper 單測   | M      | TC-Storage-01：5 個 export（generateStorageKey / fetchAsBuffer / uploadToR2 / streamUploadToR2 / deleteFromR2）全覆蓋 · 無真實 R2 調用 |
| 5   | WP-Gallery-06 · Like 樂觀更新競態 | S      | TC-Gallery-06：連按 5 次收斂 · 失敗回滾 · 未登入路徑 · inflight 守護                                                                   |

### Sprint 1 完成標準

- 4 個 P0 WP 全綠
- `src/lib/with-retry.test.ts`、`src/lib/rate-limit.test.ts` 建立的測試工具模板可被 Sprint 2 / 3 復用
- `app/[locale]/not-found.tsx` 上線
- **累計 P0 完成度：4/10**

---

## 3. Sprint 2（Week 2）· 計費原子性 + 風格一致性測試

> **目標**：解決項目最大的**業務風險**（雙寫漂移）+ 補齊風格一致性的測試空白。

### 為什麼這個順序

- **WP-Usage-01** 是 Usage-02 的硬前置 → 必須先行
- **WP-Usage-02** 緊接 Usage-01，共用 Prisma transaction 基礎 → 連續做減少切換成本
- **WP-StyleConsistency-02**（S，LoRA 合併）與 **WP-StyleConsistency-01**（M，compileRecipe）共用同一測試文件；先做 02 較小塊可以為 01 的 LLM mock 鋪路

### Day-by-Day

| Day | 工作包                                         | Effort | 交付驗收                                                                                               |
| --- | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| 6-7 | WP-Usage-01 · Job↔Ledger `$transaction` 原子化 | M      | TC-Usage-01：5 路徑（成功 / ledger 失敗 → job 回滾 / job 失敗 → ledger 不生 / 並發無漂移 / 漂移日誌）  |
| 8-9 | WP-Usage-02 · FreeTier 並發邊界                | M      | TC-Usage-02：25 並發 → 通過 ≤ 20 嚴格一致 · 時區邊界文檔化                                             |
| 10  | WP-StyleConsistency-02 · LoRA 合併測試         | S      | TC-StyleConsistency-02：6 路徑（優先級 / 去重 / FAL 5 上限 / Replicate 1 上限 / Civitai token / 邊界） |

### Sprint 2 完成標準

- 3 個 P0 WP 全綠
- `GenerationJob ↔ ApiUsageLedger` 雙寫原子化 + 漂移日誌可觀測
- FreeTier 並發安全得到證明
- `src/services/recipe-compiler.service.test.ts` 建立（含 LoRA 測試）
- **累計 P0 完成度：7/10**

---

## 4. Sprint 3（Week 3）· Video Pipeline 硬骨頭 + 收尾

> **目標**：啃下 **933 行**最大單測 WP-Video-01，補齊剩餘 P0。

### 為什麼這個順序

- **WP-StyleConsistency-01** 延續 Sprint 2 的 recipe-compiler 測試文件 → 先做（2 天）
- **WP-Video-01** 是本計劃**最大風險塊**（L = 3 天），放在 Week 3 中段，避免前期被卡住影響其他 P0
- **WP-Gallery-02** 與 Video-01 無依賴，可作為 Video-01 若提前完成時的接力目標

### Day-by-Day

| Day   | 工作包                                            | Effort | 交付驗收                                                                                                                                         |
| ----- | ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 11-12 | WP-StyleConsistency-01 · compileRecipe 兩階段單測 | M      | TC-StyleConsistency-01：7 路徑（Template fallback / LLM Fusion / 降級 / 2 種 adapter / freePrompt only / modelId 取得 / referenceImages 優先級） |
| 13-15 | WP-Video-01 · video-pipeline.service 單測         | L      | TC-Video-01：4 核心函數（createLongVideoPipeline / checkPipelineStatus / cancelPipeline / retryPipelineClip）各 3 路徑 · 計算邏輯 100% branch    |

### Sprint 3 完成標準

- 2 個 P0 WP 全綠
- **累計 P0 完成度：9/10**
- 剩 **WP-Gallery-02**（ImageDetailModal 測試，M）**滾到 Week 4** 或 Sprint 3 末提前完成時插入

### 風險緩衝

若 WP-Video-01 超期（從 3 天擴至 5 天）：

- Gallery-02 延到 Week 4
- 不影響其他已完成工作包

若 WP-Video-01 提前（2 天完成）：

- Day 15 可啟動 WP-Gallery-02 收尾最後一個 P0

---

## 5. 雙人並行選項（2 週壓縮版）

若有 2 名開發者可分線作業，以下排法可在 **2 週（20 人日）** 內完成全部 10 個 P0 並留 3 天 buffer：

### 分線原則

- **A 線（後端重型）**：服務/Lib/基礎設施/計費/視頻
- **B 線（前端全棧）**：UI/風格一致性（含 LLM mock 框架）/全域 UI

### 並行日程

```
Week 1                         Week 2
────────────────────────       ──────────────────────────
A: Infra-01 (1d)               A: StyleConsistency-02 (1d)
A: Storage-01 (2d)             A: StyleConsistency-01 (2d)
A: Usage-01 (2d)               A: Video-01 (3d, main track)
                               ────
B: Global-01 (1d)              B: Gallery-06 (1d)
B: Gallery-02 (2d)             B: buffer / 支援 A 或啟動 P1
B: Usage-02 (2d, 需 A-Usage-01 交付後銜接)
```

### 交叉節點

- Day 3 結束：A 完成 Storage-01 · B 完成 Gallery-02
- Day 5 結束：A 完成 Usage-01 → B 可啟動 Usage-02（繼承 transaction 模式）
- Day 10 結束：全部 10 個 P0 完成

---

## 6. 本計劃**明確排除**的工作包

### P0 全部納入（10/10）

### P1（26 個）全部不在排期中

包括但不限於：

- UI 線：WP-Studio-02/03/04/05、WP-Gallery-01/03/04/05、WP-Profile-02/03/04、WP-Global-02/04/05
- 功能線：WP-Image-03/04、WP-Video-02/03、WP-Prompt-01/03/04、WP-Usage-03、WP-Storage-02/03、WP-Infra-03、WP-StyleConsistency-03

### P2（18 個）全部不在排期中

### 刻意延後說明

- **WP-Video-02**（長片 cancel/retry E2E）雖然是 P1，但依賴 WP-Video-01 完成。若 Video-01 進度順利，**下一個 2 週**將其作為首個接力對象
- **WP-Gallery-02** 雖是 P0（M），作為本計劃最後一個接力項；若 Sprint 3 Video-01 延期，將被擠到 Week 4
- **WP-Prompt-01**（LLM mock 框架，P1 M）是 WP-Prompt-02/03/04 + WP-StyleConsistency-01 的共用基礎；本計劃內 StyleConsistency-01 自建 mock 即可，**框架化建議放到下一個 2 週**

---

## 7. 下一個 2 週的接力候選（供參考，不在本計劃範圍）

若 3 週完成順利，下一輪優先處理：

**高價值 P1 候選（按跨線共用價值排序）**

1. **WP-Prompt-01**（M）— 建立 LLM mock 共用框架 → 同時解鎖 WP-Prompt-02/03/04 加速
2. **WP-Storage-03 + WP-Gallery-05 + WP-Profile-05**（3 個 S/M 合併）— 共用 `og/route.test.ts` 單一測試文件
3. **WP-Gallery-02**（若未完成，M）
4. **WP-Video-02**（M）— 依賴 Video-01 完成
5. **WP-Global-02**（M，吸收 Studio-02）— 補齊所有頁面 loading.tsx

**避免碎片化**：P2 建議**整批**處理一次（例如專門一個 Sprint 做文檔化 + 決策類，一次性消化完）。

---

## 8. 風險登記與緩解

| 風險                                       | 來源 WP                             | 緩解措施                                                                                           |
| ------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| WP-Video-01 超期（L = 3-5 天，933 行邏輯） | 計算邏輯 branch 多 · DB mock 深度大 | Sprint 3 Day 13 啟動時預留 2 天 buffer；若 Day 15 仍未完成，Gallery-02 推遲，Video-01 允許滑 +2 天 |
| Usage-01 transaction 範圍錯估              | provider 回調與 transaction 邊界    | Day 6 上午先與團隊對齊 transaction 邊界，下午才開始代碼                                            |
| Storage-01 AWS SDK mock 覆蓋不足           | 5 個命令類需分別 mock               | 借鑑既有 `api-route-factory.test.ts` / `errors.test.ts` mock 風格                                  |
| FreeTier 並發測試 flaky（Day 8-9）         | 並發場景在測試中不穩定              | 使用 Vitest fake timers + 確定性種子；CI 重跑 3 次取穩定                                           |
| StyleConsistency-01 LLM mock 框架缺位      | 無 WP-Prompt-01 鋪底                | 在 Sprint 3 Day 11 當場建立最小 LLM mock（單一文件內，不求通用化）                                 |

---

## 9. 交付節奏匯總

| Sprint        | 週  | 日    | P0 完成數 | 主要交付                                       |
| ------------- | --- | ----- | --------- | ---------------------------------------------- |
| 1             | W1  | 1-5   | 4/10      | Infra-01 · Global-01 · Storage-01 · Gallery-06 |
| 2             | W2  | 6-10  | 7/10      | Usage-01 · Usage-02 · StyleConsistency-02      |
| 3             | W3  | 11-15 | 9/10      | StyleConsistency-01 · Video-01                 |
| Week 4 Buffer | W4  | 16    | 10/10     | Gallery-02（若未提前完成）                     |

**最終 P0 完成度：10/10 在 15-16 個工作日內** · **P1/P2 全部順延**。

---

## 10. 計劃邊界重申

- 本計劃**不新增**任何工作包，所有條目來自 4 份 `03-工作包細分.md`
- 本計劃**不展開** L4 或實作細節 — 由各 WP 自身的 `Concrete Tasks` 和對應 TC 的 `Test Cases` 驅動
- 本計劃**不承諾**P1/P2 的推進時間 — 它們在「下一個 2 週接力候選」中列出等待選擇
- 本計劃**不是** roadmap — roadmap 需要額外納入產品節點、發布窗口、業務 milestone
