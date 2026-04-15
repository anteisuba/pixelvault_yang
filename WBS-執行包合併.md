# WBS · 目標對齊 + 執行包合併

> 基準日期：2026-04-15
>
> **輸入**：4 份 `03-工作包細分.md`（合計 **90 個工作包**：UI 23 · 功能 24 · 功能測試 22 · UI 測試 21）
>
> **產出**：**7 個 Execution Package**，把實作 WP 與對應測試 TC 合併成可交付單元
>
> **約束**：不新增大結構、不重拆 WBS、不做 roadmap · 只依當前三目標做對齊與合併

---

## 1. 對齊原則

### 當前三目標（由你指定）

- **A**：生成風格一致性與可控性
- **B**：Studio / Gallery / Profile 的可見 UI 打磨
- **C**：為 A/B 所必需的可靠性與測試基礎

### 對齊規則

1. 一個 WP 必須明確掛到 A / B / C 其中一個才能入 EP
2. 同能力域的實作 WP + 對應測試 TC **視為一個 EP 的組成**（例如 `WP-StyleConsistency-01 + TC-StyleConsistency-01` 合併）
3. 不對齊的 WP → 明確標註 Later / Parked，並說明為何不進本輪
4. 原 Priority（P0/P1/P2）是**工程優先級**；本輪輸出的 Priority 是**目標優先級**（Now / Next / Later / Parked）— 兩者可能不一致，需要顯式 re-tag

---

## 2. 七個 Execution Packages

### EP-1 · 風格一致性核心鏈路

> **目標對齊**：A（核心）

- **Included Work Packages**
  - WP-StyleConsistency-01 / TC-StyleConsistency-01 · compileRecipe 兩階段單測
  - WP-StyleConsistency-02 / TC-StyleConsistency-02 · LoRA 合併 / 去重 / Civitai token
  - WP-StyleConsistency-03 / TC-StyleConsistency-03 · Character attributes → prompt 3 格式
- **Why Now**：`compileRecipe` 是卡片 → 生成的**唯一鏈路**，目前完全無測試；LoRA 合併邏輯是「用戶可感的風格可控性」直接來源；任何風格一致性工作必先落地本包
- **User-Facing Outcome**：卡片選擇的結果**可預期、可重現**；LoRA 疊加不再出現靜默截斷或順序錯亂
- **Technical Outcome**：`recipe-compiler.service.test.ts` + `character-card.service.test.ts` 建立；3 種 adapter 格式（tag / weighted / natural）有回歸防線
- **Dependencies**：軟依賴 EP-2 的 LLM mock（但可獨立建最小 mock）
- **Risks**：兩階段邏輯（LLM Fusion → Template fallback）複雜；provider LoRA 上限變動需同步 fixture
- **Suggested Owner**：backend
- **Priority**：**Now**
- **Effort**：**M**

---

### EP-2 · LLM 輸出品質穩定化

> **目標對齊**：A（支撐）

- **Included Work Packages**
  - WP-Prompt-01 / TC-Prompt-01 · 4 個 Prompt/LLM service 單測骨架（建立 LLM mock 共用框架）
  - WP-Prompt-04 / TC-Prompt-04 · llm-output-validator 擴展與測試
  - WP-Prompt-02 / TC-Prompt-02 · 5 種 enhance 風格 golden set **（升級 P2→Now）**
- **Why Now**：A 目標不只卡片，還含「prompt 增強 + LLM 融合」的確定性；golden set 是風格回歸的唯一防線；mock 框架同時解鎖 EP-1 Stage 2 的 LLM 測試
- **User-Facing Outcome**：同一 prompt + 同一風格產出**不再漂移**；增強結果不回吐 meta-commentary 或 system prompt 洩漏
- **Technical Outcome**：3 個 LLM service 單測 + validator 擴展；5 風格 golden fixture 固化
- **Dependencies**：無硬前置；EP-1 可復用此包的 LLM mock 基礎
- **Risks**：golden baseline 主觀；LLM 版本升級需重 baseline
- **Suggested Owner**：backend
- **Priority**：**Now**
- **Effort**：**M**

---

### EP-3 · 生成管線韌性基座

> **目標對齊**：C（底盤，被 A 依賴）

- **Included Work Packages**
  - WP-Infra-01 / TC-Infra-01 · with-retry 單測
  - WP-Storage-01 / TC-Storage-01 · R2 wrapper 單測
  - WP-Image-03 / TC-Image-03 · 8 provider adapter 契約 + 3 熱門 adapter 單測
  - WP-Image-04 / TC-Image-04 · 240s timeout 與降級可觀測性
- **Why Now**：A 與 B 的所有生成入口都經過 retry + R2 + provider adapter 這三層；任何風格一致性都建立在「生成不靜默失敗」的前提上
- **User-Facing Outcome**：生成失敗時有明確錯誤信息（而非 500 或無限 loading）；R2 上傳不穩時有正確重試
- **Technical Outcome**：3 個韌性 lib 測試 + 3 個熱門 adapter 契約測試；timeout 邊界有結構化日誌
- **Dependencies**：無硬前置。Infra-01 在包內先行，被 Storage-01 / Image-03 的 mock 模式借用
- **Risks**：AWS SDK mock 覆蓋複雜；provider 響應結構易失真
- **Suggested Owner**：backend
- **Priority**：**Now**
- **Effort**：**L**

---

### EP-4 · 計費原子性與 FreeTier 邊界

> **目標對齊**：C（用戶可感的可靠性）

- **Included Work Packages**
  - WP-Usage-01 / TC-Usage-01 · Job ↔ Ledger `$transaction` 原子化
  - WP-Usage-02 / TC-Usage-02 · FreeTier 並發邊界測試
- **Why Now**：用戶同一設備打開多 tab 猛刷 → 超額扣免費額度 / 扣費漂移，是可直接投訴的體驗問題；項目**無 User.credits 字段**，FreeTier 是唯一限額機制
- **User-Facing Outcome**：FreeTier 並發不超扣；生成成功/失敗與計費記錄嚴格一致
- **Technical Outcome**：Prisma `$transaction` 包裹雙寫；漂移日誌可觀測
- **Dependencies**：Usage-02 硬依賴 Usage-01 的 transaction 基礎
- **Risks**：transaction 範圍過大影響吞吐；並發測試 flaky
- **Suggested Owner**：backend
- **Priority**：**Now**
- **Effort**：**M**

---

### EP-5 · Gallery 展示與互動閉環

> **目標對齊**：B（Gallery 主幹）

- **Included Work Packages**
  - WP-Gallery-02 / TC-Gallery-02 · ImageDetailModal + ImageCard 測試（**P0**）
  - WP-Gallery-06 / TC-Gallery-06 · Like 樂觀更新競態保護（**P0**）
  - WP-Gallery-03 / TC-Gallery-03 · 篩選 URL 狀態與空態
  - WP-Gallery-01 / TC-Gallery-01 · Particles 背景性能防護
  - WP-Gallery-04 / TC-Gallery-04 · 無限滾動 Sentinel 穩定性
- **Why Now**：Gallery 是用戶作品展示的**唯一入口**；Detail Modal + Like + 篩選 + 滾動是核心互動閉環，當前除 route test 外幾乎無覆蓋
- **User-Facing Outcome**：卡片點擊→詳情→點讚/隱私切換路徑穩定；低端設備不卡；篩選結果空態有明確 UI
- **Technical Outcome**：5 個高頻組件/hook 測試落地；響應快速滾動和篩選切換無競態
- **Dependencies**：無硬前置；WP-Gallery-04 的 IntersectionObserver polyfill 需確認
- **Risks**：Radix Dialog focus trap 在 jsdom 下行為特殊；Like 回滾 flakiness
- **Suggested Owner**：frontend / cross-layer
- **Priority**：**Now**
- **Effort**：**L**

---

### EP-6 · Studio 核心體驗打磨

> **目標對齊**：B（Studio 主幹）

- **Included Work Packages**
  - WP-Studio-02 / TC-Studio-02 · loading / error 補全
  - WP-Studio-03 / TC-Studio-03 · 生成 Hook 職責統一（useUnifiedGenerate vs useStudioGenerate）
  - WP-Studio-04 / TC-Studio-04 · 快捷鍵與 Input Focus 衝突驗證
  - WP-Studio-05 / TC-Studio-05 · Studio 核心組件測試骨架（StudioPromptArea / Canvas / HistoryPanel）
- **Why Now**：Studio 是 A（風格一致性）的承載 UI — 但本 EP 聚焦用戶體感而非 A 的邏輯層；60+ 組件僅 LocaleSwitcher 有測試，變更時回歸風險極高
- **User-Facing Outcome**：Studio 頁載入/失敗有明確骨架和 error；`Cmd+Enter` 在 IME 組字中不誤觸生成；切換卡片不卡頓
- **Technical Outcome**：StudioContext 3-provider mock wrapper 建立；4 個高頻組件/hook 測試落地
- **Dependencies**：軟依賴 EP-1（風格一致性 + Studio 共享 recipe-compiler 的狀態）；Studio-05 可從 Studio-03 減少 mock 複雜度
- **Risks**：StudioContext 3-provider mock 侵入性高；Pragmatic Drag-and-Drop 在 jsdom 不可用
- **Suggested Owner**：frontend
- **Priority**：**Next**（在 EP-1/2/3/4/5 Now 之後啟動）
- **Effort**：**M**

---

### EP-7 · Profile 可見性與隱私閉環

> **目標對齊**：B（Profile 主幹）

- **Included Work Packages**
  - WP-Profile-02 / TC-Profile-02 · ProfileFeed 批量操作（刪除 / 隱私切換）
  - WP-Profile-03 / TC-Profile-03 · Creator / Private View 切換邏輯
  - WP-Profile-04 / TC-Profile-04 · ProfileEditModal 隱私開關完整性
- **Why Now**：Profile 是用戶自我表達 + 隱私控制的中心；隱私開關目前**完全無測試**，錯誤狀態會直接暴露作品給陌生人
- **User-Facing Outcome**：批量刪除/隱藏有明確確認；隱私切換立即生效；他人訪問私密 profile 行為明確
- **Technical Outcome**：3 個 Profile 核心組件測試；`useMyProfile` hook 測試
- **Dependencies**：軟依賴 EP-5 的 ImageDetailModal（ProfileFeed 內部使用 GalleryGrid）
- **Risks**：批量操作中途失敗的 UX 未定義；樂觀更新與 SWR/React Query 快取錯配
- **Suggested Owner**：frontend / cross-layer
- **Priority**：**Next**
- **Effort**：**M**

---

## 3. P0 但應降級的工作包（不在當前 3 目標內）

| Work Package                               | 原 Priority | 重 Tag     | 理由                                                                                                                                                                                                   |
| ------------------------------------------ | ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **WP-Video-01** · video-pipeline 單測（L） | P0          | **Parked** | 視頻長片 pipeline（933 行）是獨立能力域。**不走 recipe-compiler**、**不接收卡片** → 與目標 A 風格一致性無關；Gallery 展示視頻時不涉及 pipeline 本身 → 與目標 B 也弱相關。雖然工程 P0，但不屬本輪三目標 |
| **WP-Global-01** · 補 not-found.tsx（S）   | P0          | **Later**  | 項目缺 404 頁（工程 P0）但屬「全域基礎體驗」，不在 A/B/C 任一目標。建議放下一輪作為「體驗收口 sprint」的一部分                                                                                         |

## 4. 非 P0 但應升級的工作包

| Work Package                                                  | 原 Priority | 重 Tag              | 理由                                                                                                                                  |
| ------------------------------------------------------------- | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **WP-StyleConsistency-03** · Character attributes 3 格式（S） | P1          | **Now**（入 EP-1）  | 目標 A 核心機制：不同 provider 的 prompt 格式差異（NovelAI tag / FLUX weighted / Gemini natural）是用戶切模型時「為何結果變了」的根源 |
| **WP-Prompt-02** · 5 風格 golden set（M）                     | P2          | **Now**（入 EP-2）  | golden set 是「風格穩定性」的唯一客觀基線；目標 A 沒有它就**無法量化**風格回歸                                                        |
| **WP-Gallery-01** · Particles 性能防護（S）                   | P1          | **Now**（入 EP-5）  | 120 粒子 + mousemove 在低端設備是**可直接感知的體驗損失**；目標 B 不能只看功能正確，還看性能順滑                                      |
| **WP-Gallery-04** · 無限滾動穩定性（M）                       | P1          | **Now**（入 EP-5）  | 快速滾動 + 篩選切換的競態是最常見的 Gallery bug；與 B 可見 UI 直接相關                                                                |
| **WP-Profile-04** · ProfileEditModal 隱私開關（M）            | P1          | **Next**（入 EP-7） | 隱私是目標 B 的用戶信任基石；P1 偏低估                                                                                                |

---

## 5. 不納入 2-3 週計劃的項目

### 5.1 視頻整線（目標外）

- WP-Video-01 / WP-Video-02 / WP-Video-03 + 對應 TC — **Parked**
- 若未來「Gallery 上視頻互動」提上議程，再整線入 EP-5

### 5.2 SEO / 元數據（目標外）

- WP-Gallery-05 JSON-LD + OG 守護 — **Later**
- WP-Profile-05 OG 快取失效 — **Later**
- WP-Storage-02 Sitemap 50 URL 解除 — **Later**
- WP-Storage-03 OG route 測試 — **Later**
- **建議**：三者共用 `og/route.test.ts`，屬於「SEO 收口 sprint」可一次性做，但不在當前 A/B/C 範圍

### 5.3 全域基礎體驗（目標外 / 弱相關）

- WP-Global-01 補 not-found — **Later**（雖 P0）
- WP-Global-02 loading.tsx 全頁補齊 — **Later**（Studio loading 已在 EP-6；其他頁延後）
- WP-Global-04 MobileTabBar ↔ Navbar 斷點測試 — **Later**
- WP-Global-05 LocaleSwitcher 跨頁 E2E — **Later**
- WP-Global-06 全局錯誤邊界三語 — **Later**
- WP-Profile-01 未登入頁內提示優化 — **Later**

### 5.4 純文檔 / 決策 / 運維

- WP-Image-01 職責分層文檔化 — **Parked**
- WP-Image-02 image-edit FAL 硬編碼文檔化 — **Parked**
- WP-Infra-02 Errors 映射矩陣文檔化 — **Parked**
- WP-Infra-03 Rate-Limit Upstash 降級測試 — **Later**（有價值但非目標 A/B 直接）
- WP-Infra-04 Circuit breaker 持久化決斷 — **Parked**
- WP-Global-03 Toast 使用規範 — **Parked**
- WP-Global-07 Provider 嵌套文檔化 — **Parked**
- WP-Studio-01 StudioWorkbenchDraft 去留決策 — **Parked**（693 行孤立 UI，無 A/B/C 影響）
- WP-Usage-03 Ledger 漂移檢測任務 — **Later**（EP-4 完成後作為運維補強）

---

## 6. 最終結論

### 現在最值得先做的 3 個 Execution Packages

1. **EP-1 · 風格一致性核心鏈路**

   > 目標 A 的**唯一主幹**。`compileRecipe` 完全無測試是項目最大的「風格不可控風險」直接來源。做完 EP-1 才能談得上「風格一致性」有底。

2. **EP-3 · 生成管線韌性基座**

   > 目標 C 的**底盤**。Infra-01 + Storage-01 + Image-03 是 A/B 所有生成鏈路的前置依賴。底盤不穩，上層測試都是浮萍。EP-1 測試時也會碰到 retry/R2/adapter 行為 → 提前穩固收益最大。

3. **EP-5 · Gallery 展示與互動閉環**
   > 目標 B **最直接可見**的產出。兩個 P0（ImageDetailModal 測試 + Like 競態）是用戶最常走的路徑，修掉直接抬升整體體感。且 EP-5 與 A/C 耦合最少，可並行推進。

### 現在**不應該**進入 2-3 週計劃的項目

- **視頻整線**（Video-01/02/03）— 雖有 P0，但目標外
- **SEO 批次**（Gallery-05 / Profile-05 / Storage-02/03）— 非 A/B/C
- **全域基礎體驗**（not-found / 全頁 loading 補齊 / 斷點測試 / LocaleSwitcher E2E / 錯誤邊界三語 / Profile 未登入提示）
- **純文檔與決策**（Image-01/02 / Infra-02/04 / Global-03/07 / Studio-01）
- **運維補強**（Usage-03）

### Priority 分佈

| Priority   | 包                                  | 備註                                                             |
| ---------- | ----------------------------------- | ---------------------------------------------------------------- |
| **Now**    | EP-1 · EP-2 · EP-3 · EP-4 · EP-5    | 5 個包；Effort 合計 M+M+L+M+L ≈ 12 工作日（雙人並行可壓至 8 天） |
| **Next**   | EP-6 · EP-7                         | 在 Now 完成後啟動                                                |
| **Later**  | 見 §5.2 / §5.3 / Usage-03           | 後續可整批做                                                     |
| **Parked** | 視頻整線 / 純文檔與決策 / Studio-01 | 需要產品信號才啟動                                               |

---

## 7. 本輪邊界重申

- **無新增**：7 個 EP 全部由現有 90 個 WP/TC 合併而成
- **無新 WBS**：不修改 `03-工作包細分.md` 的粒度或結構
- **非 roadmap**：未排時間窗、未綁發布、未綁業務 milestone — roadmap 需下一輪基於本文件 + 業務節奏再做
