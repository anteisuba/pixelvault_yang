# WBS · 中長期演進計劃

> 基準日期：2026-04-15 · 規劃單位：**7 個 Execution Package**（來自 `WBS-執行包合併.md`）
>
> 本文不重排 P0/P1、不新增結構、不做時間窗 roadmap。
>
> 目的是回答：**產品能演進到什麼程度？每階段結束後能力到哪一級？**

---

## 1. 目標終局（Target State · 3 個月後）

### 1.1 產品會呈現成什麼樣子

三個月內做得比較成功時，Personal AI Gallery 會是一個**「風格可控 + 展示完整 + 可以信任」**的個人 AI 創作平台，不是多功能大雜燴：

- **選卡即結果**：用戶選好 Character + Style + Background，生成結果**可預期、可重現**，換一台機器、換一次會話、換一個 provider，風格不會飛
- **創作路徑透明**：Studio 的 prompt、快捷鍵、歷史、LoRA 疊加行為對用戶**不再是黑箱**，每一步變化有跡可循
- **展示層完整**：Gallery 作為「作品歸檔」而不是「生成日誌」— 列表/詳情/點讚/篩選形成閉環
- **隱私可信**：Profile 隱私開關說關就關，切換立即生效，不會出現「私密作品被他人看到」的信任崩塌
- **失敗不沉默**：生成失敗時用戶看到明確訊息而不是 500 或無限 loading；免費額度不會因並發被超扣

### 1.2 用戶能感知到的核心能力

| 維度        | 用戶感知                                          |
| ----------- | ------------------------------------------------- |
| 風格一致性  | 同一卡片組合 → 同樣結果 · LoRA 疊加行為**有規則** |
| 創作體驗    | Studio 流暢、快捷鍵可靠、失敗有錯誤頁             |
| 展示互動    | 滾動不卡、篩選不漂、Like 連按不異常               |
| 隱私信任    | 隱私切換可信 · 他人訪問私密 profile 行為明確      |
| 失敗透明    | 生成失敗有錯誤訊息 · 免費額度扣費準確             |
| Prompt 穩定 | Enhance 5 風格輸出不回吐 meta-commentary          |

### 1.3 工程成熟度

- **韌性基座全綠**：with-retry / R2 wrapper / circuit-breaker / 3 個熱門 provider adapter 全部有測試守護
- **計費原子化**：Job ↔ Ledger 雙寫走 `$transaction`，無漂移
- **風格一致性鏈路可回歸**：`compileRecipe` 兩階段 + LoRA 合併 + 3 種 adapter prompt 格式有測試矩陣
- **LLM 輸出可量化**：5 風格 golden set + validator 擴展
- **UI 核心組件有測試骨架**：Gallery（5 個）· Studio（4 個）· Profile（3 個）
- **不含**：視頻 pipeline 測試、SEO 批次、a11y 工具鏈、視覺回歸 — 刻意延後

---

## 2. 分階段演進路線

### Phase 1 · 近期（0-3 週）· 「基座打底 + 一致性主幹」

#### Phase Goal

把**風格一致性核心**拉到 L2，把**生成可靠性基座**拉到 L2，解決**計費超扣風險**。目標 A 和 C 進入可用狀態，目標 B 暫不動。

#### Included Execution Packages

- **EP-3 · 生成管線韌性基座**（L · C）
- **EP-1 · 風格一致性核心鏈路**（M · A）
- **EP-4 · 計費原子性與 FreeTier 邊界**（M · C）

#### 為什麼這一階段先做這些

- EP-3 是 EP-1 的**隱性前置**：compileRecipe 測試需要 retry/R2 mock 模式，提前做省成本
- EP-1 是目標 A 的**唯一主幹**，沒它產品無法聲稱「風格一致性」
- EP-4 是**用戶可直接投訴的風險**（並發超扣），且獨立於 A/B 線，可並行做

#### 用戶可感知的變化

- 生成失敗時**看到具體錯誤**（而非白屏或 500）
- 免費額度**不再因連按而超扣**
- 卡片組合結果**開始穩定**（LoRA 合併行為符合直覺）

#### 工程可感知的變化

- `with-retry.test.ts` / `storage/r2.test.ts` / `recipe-compiler.service.test.ts` 三個核心測試文件建立
- Prisma `$transaction` 包裹雙寫
- LLM mock 最小模板就緒（為 Phase 2 鋪路）

#### 完成這一階段後產品能到的程度

**「生成可控、不失竊、不失信」**。產品從「功能可用」進入「後端骨架可信」。用戶層面變化有限，主要是工程地基。

#### 進入 Phase 2 前的 Gate / Exit Criteria

- [ ] `compileRecipe` 兩階段 + LoRA 合併測試 green
- [ ] `with-retry` + R2 wrapper 測試 green
- [ ] `$transaction` 原子化 + FreeTier 並發 25 → 通過 20 測試 green
- [ ] CI 穩定性 ≥ 98%（允許 flaky 修 1 次）

#### 不應該在這一階段做的事

- ❌ Studio 組件測試（EP-6）— 先不動，待 EP-1 穩定後再測 Studio 對 recipe 的消費
- ❌ Gallery UI 打磨（EP-5）— 避免前後端線一起動影響回歸
- ❌ LLM golden set（EP-2 的 Prompt-02）— baseline 建立需 LLM 穩定期，Phase 2 啟動更合理
- ❌ SEO / 視頻 / a11y — 與目標 A/B/C 無關

---

### Phase 2 · 短中期（4-8 週）· 「A 完整 + Gallery 可見閉環」

#### Phase Goal

把**風格一致性**從 L2 推進到 L3（加 LLM 品質維度），把**Gallery 互動**從 L1 拉到 L2。目標 A 達成產品化成熟，目標 B 開始可見。

#### Included Execution Packages

- **EP-2 · LLM 輸出品質穩定化**（M · A）
- **EP-5 · Gallery 展示與互動閉環**（L · B）

#### 為什麼這一階段先做這些

- EP-2 是 A 目標的**補強**：有了 EP-1 的 compileRecipe，還需要 enhance/assistant/feedback 的輸出品質穩定，否則「風格一致」只覆蓋一半（卡片側穩 + prompt 側飄）
- EP-5 啟動時機：EP-1 完成後 Gallery 上的作品風格會更一致，Gallery UI 打磨**剛好能承接**「更好的作品」帶來的體感提升
- EP-5 的 Gallery-02（ImageDetailModal）+ Gallery-06（Like）是 2 個 P0，不可長期拖

#### 用戶可感知的變化

- **Prompt Enhance 5 種風格不再漂移**（同 prompt + 同風格 → 高度相似輸出）
- Gallery 列表**滾動順滑**（Particles 性能降級）
- 點卡片**穩定彈出詳情**，Like 連按**不會出現錯誤態**
- 空篩選結果有**明確 UI** 而不是空白

#### 工程可感知的變化

- 4 個 Prompt/LLM service 有單測 + 5 風格 golden fixture
- `llm-output-validator` 擴展（敏感詞、fallback 路徑）
- 5 個 Gallery 核心組件/hook 測試
- IntersectionObserver polyfill + 競態保護

#### 完成這一階段後產品能到的程度

**「創作結果可預期 + 展示層可用」**。用戶第一次感覺到「這個產品在前進」— 不只是 bug 少了，而是風格可控 + 互動順暢。

#### 進入 Phase 3 前的 Gate / Exit Criteria

- [ ] 5 風格 golden set CI 回歸 green
- [ ] Gallery 5 個測試 WP 全綠
- [ ] Playwright 快速滾動 + 篩選切換 E2E 無競態
- [ ] Lighthouse 在 Gallery 列表頁 Performance ≥ 80（低端設備模擬）

#### 不應該在這一階段做的事

- ❌ Studio 組件測試（EP-6）— 仍需等 Phase 1/2 穩定
- ❌ Profile 批量操作（EP-7）— Profile 使用頻率低於 Gallery，可後置
- ❌ 視頻 pipeline（WP-Video-01 等）— 目標外
- ❌ 404 / 全頁 loading 補齊 — 目標外

---

### Phase 3 · 中期（2-3 個月 · 9-12 週）· 「UI 全域成熟 + 信任閉環」

#### Phase Goal

把 **Studio 體驗**從 L1 拉到 L3，把 **Profile 隱私閉環**從 L1 拉到 L3。目標 B 達成產品化成熟。A/B/C 三線在 Phase 3 末期全部進入 L3。

#### Included Execution Packages

- **EP-6 · Studio 核心體驗打磨**（M · B）
- **EP-7 · Profile 可見性與隱私閉環**（M · B）

#### 為什麼這一階段先做這些

- Studio 是 A 的承載 UI，但 Studio UI 穩定**依賴 A 邏輯先穩**（Phase 1 EP-1 / Phase 2 EP-2 完成後才有意義）
- Profile 是信任終點：隱私切換 + 批量操作的可靠性是**用戶長期留存的基礎**，但 ROI 不急於 Phase 1/2
- 60+ Studio 組件的回歸測試骨架搭建，是**降低未來改動風險**的關鍵投資

#### 用戶可感知的變化

- Studio 載入/失敗**有明確骨架和錯誤頁**，不再白屏
- 快捷鍵 `Cmd+Enter` 在**中日文輸入組字時不誤觸**
- Profile 的**批量刪除有確認對話框**，隱私切換立即生效
- 他人訪問私密 profile 行為**明確且統一**

#### 工程可感知的變化

- `StudioContext` 3-provider mock wrapper 建立，為後續重構提供保護
- 4 個 Studio + 3 個 Profile 核心組件/hook 有測試
- `ProfileEditModal` 樂觀更新 + 失敗回滾路徑覆蓋

#### 完成這一階段後產品能到的程度

**「創作、展示、信任三位一體」**。用戶能完整走一個創作閉環：選卡 → 在 Studio 創作 → 歸檔到 Gallery → 在 Profile 中管理隱私。所有可見面都有測試守護。

#### 進入 Optional Phase 4 前的 Gate / Exit Criteria

- [ ] Studio 4 個測試 WP + Profile 3 個測試 WP 全綠
- [ ] 隱私切換 E2E（改為私密 → 他人訪問 → 顯示 PrivateProfileView）全路徑
- [ ] 項目整體測試覆蓋率從 ~5% 提升到 ≥ 30%

#### 不應該在這一階段做的事

- ❌ 把 Studio 體驗升到 L4（可擴展新 panel）— 先 L3 夠用
- ❌ 把 Profile 擴展成完整用戶中心（訂閱、打賞）— 超出當前目標

---

### Optional Phase 4 · 更後面的方向（12+ 週）

> 不在本計劃主線。僅列為**未來可能的批次**，需基於 Phase 3 結束後的業務信號再決定。

| 批次                 | 包含                                                                                                                                         | 觸發條件                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **SEO 收口批次**     | WP-Gallery-05 JSON-LD · WP-Profile-05 OG · WP-Storage-02 Sitemap · WP-Storage-03 OG route                                                    | 當產品進入公開推廣階段、需搜索引擎收錄時 |
| **全域基礎體驗批次** | WP-Global-01 not-found · WP-Global-02 loading 全頁補齊 · WP-Global-04 斷點測試 · WP-Global-05 LocaleSwitcher E2E · WP-Global-06 錯誤邊界三語 | 當產品用戶量進入萬級、邊緣場景投訴增多時 |
| **視頻整線批次**     | WP-Video-01 pipeline · WP-Video-02 cancel/retry · WP-Video-03 validation                                                                     | 當視頻生成成為核心使用場景（目前非主線） |
| **可觀測性批次**     | WP-Infra-02 Errors 文檔 · WP-Infra-03 Rate-limit 降級 · WP-Infra-04 Breaker 決斷 · WP-Usage-03 漂移檢測                                      | 當需要接入 SRE / 運維監控時              |
| **a11y + 視覺回歸**  | 需新增工具鏈（axe-core / Chromatic）— 本計劃中明確延後                                                                                       | 當合規或大客戶要求 WCAG 時               |

---

## 3. 能力成熟度階梯

### 3.1 風格一致性與可控性

| Level             | 描述                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| L1 可用但脆弱     | 卡片 + prompt 能生成，結果有漂移，`compileRecipe` 零測試               |
| L2 穩定可控       | compileRecipe 兩階段 + LoRA 合併有測試矩陣；同卡片組合結果可重現       |
| L3 產品化成熟     | 3 種 adapter prompt 格式有回歸防線；LLM enhance 5 風格 golden set 守護 |
| L4 可擴展與可運營 | 新模型接入有標準流程；風格 golden 持續維護；用戶可見風格評分           |

**軌跡**：當前 **L1** → Phase 1 末 **L2** → Phase 2 末 **L3** → Phase 3 末 **L3**（保持）

---

### 3.2 Studio 創作體驗

| Level             | 描述                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| L1 可用但脆弱     | 功能完整但 60+ 組件零測試（除 LocaleSwitcher）；無 loading/error 邊界 |
| L2 關鍵路徑有守護 | loading/error 補全；快捷鍵衝突被覆蓋；使用的 hook 職責明確            |
| L3 產品化成熟     | Studio 4 個核心組件有測試骨架；重構時不回歸                           |
| L4 可擴展         | 新加 panel / workflow mode 不破壞現有；StudioContext mock 可複用      |

**軌跡**：當前 **L1** → Phase 1 末 **L1** → Phase 2 末 **L1** → Phase 3 末 **L3**

---

### 3.3 Gallery 展示與互動

| Level           | 描述                                                                  |
| --------------- | --------------------------------------------------------------------- |
| L1 可用但脆弱   | 列表 + 詳情功能存在；Detail Modal / Like 無測試；Particles 低端卡     |
| L2 核心互動穩定 | ImageDetailModal + Like + 篩選空態 + 滾動穩定性全有測試               |
| L3 性能與響應   | Particles 按設備能力降級；快速切換無競態；Lighthouse Performance ≥ 80 |
| L4 可運營       | JSON-LD + OG + Sitemap 支持 SEO；點讚/收藏/評論形成社交閉環           |

**軌跡**：當前 **L1** → Phase 1 末 **L1** → Phase 2 末 **L2-L3**（EP-5 完成後同步達成）→ Phase 3 末 **L3**

---

### 3.4 Profile 與隱私控制

| Level           | 描述                                                     |
| --------------- | -------------------------------------------------------- |
| L1 可用但脆弱   | 頁面存在，隱私開關無測試；Creator/Private 切換邏輯無守護 |
| L2 關鍵路徑覆蓋 | Creator/Private 切換 + ProfileEditModal 隱私有測試       |
| L3 完整信任閉環 | 批量刪除 + 隱私同步 + OG cache buster 齊備               |
| L4 高級運營     | 訂閱 / 打賞 / 身份驗證 / 二級權限（超出當前 EP）         |

**軌跡**：當前 **L1** → Phase 1 末 **L1** → Phase 2 末 **L1** → Phase 3 末 **L3**

---

### 3.5 生成可靠性

| Level           | 描述                                                       |
| --------------- | ---------------------------------------------------------- |
| L1 可用但脆弱   | 生成功能存在，retry / R2 / provider adapter 零測試         |
| L2 基座有守護   | with-retry + R2 wrapper + 3 熱門 adapter 契約測試 green    |
| L3 可觀測可降級 | 240s timeout 結構化日誌；計費雙寫原子化；FreeTier 並發安全 |
| L4 SLA 級       | 全 8 個 adapter 測試 + 自動監控告警 + 運維儀表板           |

**軌跡**：當前 **L1** → Phase 1 末 **L3**（EP-3 + EP-4 完成）→ Phase 2 末 **L3** → Phase 3 末 **L3**

> 注：生成可靠性在 Phase 1 就跳到 L3 是因為 EP-3 + EP-4 同時覆蓋 L2 和 L3 要件。

---

### 3.6 LLM / Prompt 品質穩定性

| Level              | 描述                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| L1 可用但脆弱      | enhance/assistant/feedback 能用，無單測，無 golden set                     |
| L2 核心測試到位    | 4 個 service 單測 + validator 擴展；fallback 鏈有斷言                      |
| L3 Golden Baseline | 5 風格 golden set CI 守護；meta-commentary / system prompt leak 攔截有測試 |
| L4 可運營          | 持續 golden 維護 + 多 LLM provider 無縫切換 + 成本監控                     |

**軌跡**：當前 **L1** → Phase 1 末 **L1**（EP-2 未啟動）→ Phase 2 末 **L3** → Phase 3 末 **L3**

---

### 3.7 成熟度總表

| 能力         | 當前 | P1 末  | P2 末     | P3 末  |
| ------------ | ---- | ------ | --------- | ------ |
| 風格一致性   | L1   | **L2** | **L3**    | L3     |
| Studio 體驗  | L1   | L1     | L1        | **L3** |
| Gallery 展示 | L1   | L1     | **L2-L3** | L3     |
| Profile 隱私 | L1   | L1     | L1        | **L3** |
| 生成可靠性   | L1   | **L3** | L3        | L3     |
| LLM 品質     | L1   | L1     | **L3**    | L3     |

**3 個月後 6 大能力全部達到 L3（產品化成熟）**；L4 不在本計劃範圍。

---

## 4. 未來能做到什麼程度（產品語言總結）

### 4.1 3 週後（Phase 1 結束）

用戶感知：

> 「生成終於不會莫名其妙失敗了，我這個月的免費額度也沒被莫名扣光。我用卡片組合出的圖，感覺**比以前更穩定**。」

產品在這個時間點還不會有大的視覺變化，但用戶會**停止抱怨基礎問題**。這是產品進入「可以認真打磨」狀態的前提。

### 4.2 8 週後（Phase 2 結束）

用戶感知：

> 「同一個 prompt + 同一個風格，結果**真的一致**了。Gallery 翻起來很順，點 Like 也不會卡。我開始**願意把作品分享給朋友**。」

產品從「後端可信」進入「前端可見」。Gallery 是用戶最常看到的頁面，它的順滑感 = 整個產品的第一印象。

### 4.3 3 個月後（Phase 3 結束）· 最理想狀態

用戶感知：

> 「我在 Studio 裡創作很順手，快捷鍵該怎樣就怎樣；作品歸檔到 Gallery 展示也漂亮；我設私密的作品**沒人看得到**，我信任這個產品。」

產品達到**「個人 AI 創作平台的產品化成熟版」**：

- 創作閉環（Studio）→ 歸檔閉環（Gallery）→ 管理閉環（Profile）全部可靠
- A / B / C 三目標全部進入 L3
- 具備**承接外部用戶**和**開始推廣**的前提
- 尚未做：SEO 批次、a11y、視覺回歸、視頻深度 — 這些是**下一個 3 個月的議題**

---

## 5. 簡化排期視圖

### 5.1 單人 12 週節奏

```
Week  1  2  3  4  5  6  7  8  9 10 11 12
     [== Phase 1 ==][==== Phase 2 ====][== Phase 3 ==]
      EP-3 EP-1 EP-4  EP-2    EP-5     EP-6    EP-7
       L    M    M    M        L        M       M

  Phase 1    Phase 2               Phase 3
  (0-3 週)   (4-8 週)              (9-12 週)
```

- Phase 1（3 週）：7 個工作日 + 8 天 buffer（首輪壓力最大）
- Phase 2（5 週）：5 個工作日 + 20 天 buffer（LLM golden baseline 建立需時間）
- Phase 3（4 週）：4 個工作日 + 16 天 buffer（充足空間處理 Studio 60+ 組件的邊界）

### 5.2 雙人並行 8 週節奏

```
Week  1  2  3  4  5  6  7  8
     [=P1=][===P2===][===P3===]

A:   EP-3  EP-2      EP-6
B:   EP-1  EP-5      EP-7
     EP-4 (交接後B接)
```

- Phase 1（2 週）：A 專注 EP-3，B 先 EP-1 後接 EP-4
- Phase 2（3 週）：A 做 EP-2，B 做 EP-5
- Phase 3（3 週）：A 做 EP-6，B 做 EP-7
- 全程有 buffer 處理 flaky 測試和 review

### 5.3 Later / Parked 明確延後理由

| 批次                                                                                                                            | 狀態       | 延後理由                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 視頻整線（Video-01/02/03）                                                                                                      | **Parked** | 視頻不走 recipe-compiler、不接收卡片 · 與 A 無關；Gallery 展示視頻不依賴 pipeline · 與 B 弱相關。需要產品信號（視頻成為主要場景）才啟動 |
| SEO 批次（Gallery-05 / Profile-05 / Storage-02 / Storage-03）                                                                   | **Later**  | 當前階段產品未進入公開推廣期；批次做（Optional Phase 4）比分散做更省成本                                                                |
| 全域基礎體驗（Global-01 not-found / 全頁 loading / LocaleSwitcher E2E / 錯誤邊界三語 / MobileTabBar 斷點 / Profile 未登入提示） | **Later**  | 邊緣場景；目前用戶量下投訴率低；Optional Phase 4 批次做                                                                                 |
| 純文檔與決策（Image-01/02 · Infra-02/04 · Global-03/07 · Studio-01）                                                            | **Parked** | 非功能性產出；團隊規模小時 ROI 低；待團隊擴大或重構前再做                                                                               |
| 運維（Usage-03 Ledger 漂移檢測）                                                                                                | **Later**  | EP-4 原子化後漂移風險已降；運維補強屬 Optional Phase 4 的可觀測性批次                                                                   |
| a11y · 視覺回歸（未在 EP 中）                                                                                                   | **Later**  | 需新增工具鏈（axe-core / Chromatic / Storybook）· 投資大且無短期 ROI；待合規或大客戶要求觸發                                            |

---

## 6. 本計劃邊界重申

- **規劃單位**：全程使用 7 個 Execution Package，不退回到 WP 層級排序
- **無新結構**：未引入任何 WBS 層級之外的新分類或新任務
- **非 roadmap**：未綁定日曆日期、發布窗口、業務 milestone — 需產品經理用本文件 + 業務節奏再疊一層才能成為正式 roadmap
- **能力成熟度不是 KPI**：L1→L3 是工程視角的質量躍遷，不等同於用戶數或營收指標
- **Optional Phase 4 非承諾**：所有 Later / Parked 項目的啟動需額外業務信號
