# UI 優化方案

> 基準日期：2026-04-18
>
> 本文件是對 `docs/plans/ui/` 內四份文檔（`README.md` / `02-現狀映射.md` / `03-工作包細分.md` / `UI-路線決策結論書.md` / `UI-實作落地清單.md`）的 **綜合優化提煉** — 不重述決策理由、不重述工作包字段，只回答三件事：
>
> 1. 目前優化方向有哪幾條主線？
> 2. 下一步該動手做什麼？按什麼順序？
> 3. 怎樣才算優化到位？用什麼守護？
>
> 依據優先：`UI-路線決策結論書.md > UI-實作落地清單.md > 03-工作包細分.md > 02-現狀映射.md`。本文件若與它們衝突，以前者為準。

---

## 0. TL;DR（讀這一段就夠）

**優化焦點 = 五條主線，按 Phase 1 → 2 → 3 展開：**

| #   | 主線                | 核心動作                                                         | 所在 Phase |
| --- | ------------------- | ---------------------------------------------------------------- | ---------- |
| M1  | Design token 奠基   | CSS variables + 清硬編碼顏色 + Tailwind 接入                     | Phase 1    |
| M2  | 差異化組件先落 2 個 | `StudioRecipeBar` + `StudioRecipeSlot`                           | Phase 1    |
| M3  | shadcn/ui 單一基線  | 業務代碼全走 `ui/*.tsx` 封裝層，嚴禁雜組件庫與 primitives 直引   | Phase 1-2  |
| M4  | Gallery 重構閉環    | `GalleryHeader` + `CardDrawer` + `Lightbox` + Particles 降級     | Phase 2    |
| M5  | 響應式 + 雙形態     | `StudioShell` + `ProfileShell{Public,Private}` + `BulkActionBar` | Phase 3    |

**當前 P0 卡點（必做）**：

1. `WP-Global-01` 404 頁面全缺（根 + locale）
2. `WP-Gallery-02` ImageDetailModal 零測試
3. `WP-Gallery-06` Like 樂觀更新無競態守護

**七天內可見產出建議**：完成 Phase 1 的 §1.1 token 奠基 + §1.4 RecipeBar 原型 + P0 三項補齊。

> **2026-04-18 新增**：`docs/plans/ui/design-handoff/` 已落入 Claude Design 匯出的 Studio 三模式完整視覺稿（Image / Video / Audio）+ 30+ 語義 token + 2 個簽名功能（Script Doctor / Character Turnaround）。這份資產 **擴展** 而非否決既有五條主線，對齊細節集中在 §8「Design Handoff 對齊增補」，需讀者在動手 M1/M2 前連同讀完 §8。

---

## 1. 當前狀況速覽

### 1.1 已經到位

- 設計語言已寫定：Editorial warm minimal（全域）+ Quiet gallery（`/u`、Gallery 局部）
- 14 個決策（D1–D14）已鎖、12 個反方向（R1–R12）已鎖，後續不再訪談可直接實作
- 組件策略已鎖：shadcn/ui 為唯一基線 + 3 個特例（Pragmatic DnD / CSS Grid 瀑布流 / 自訂 Lightbox）
- 已有部分阻尼器：Particles `prefers-reduced-motion` 守護、Gallery sentinel 去雙抓、IME isComposing 守護
- 部分 metadata + `robots: noindex` 已補（Auth 頁、Studio、Profile）

### 1.2 明顯缺口

| 缺口                                  | 影響                                 | 優先級 |
| ------------------------------------- | ------------------------------------ | ------ |
| 無 `not-found.tsx`（根 + locale）     | 任意無效路徑得 server 預設錯         | **P0** |
| `ImageDetailModal` 無測試             | Gallery 主互動點，回歸風險高         | **P0** |
| `use-like` 無競態守護                 | 快速連按會導致 UI ↔ DB 不一致        | **P0** |
| 僅 `gallery/loading.tsx` 存在         | 其餘 RSC 頁首屏無骨架，感知慢        | P1     |
| Token 層未落地                        | 設計語言不一致、Dark mode 改造成本高 | P1     |
| `StudioRecipeBar` / `CardDrawer` 未有 | EP-1 / D8 的核心差異化缺口           | P1     |
| `ProfileShell{Public,Private}` 未拆   | `/u` 與 `/profile` 氣質混淆          | P1     |

### 1.3 不碰的邊界（僅提醒）

- 不做 Studio 極簡重寫（R2）
- 不全面 dark mode（D11，延至 Phase 4）
- 不做移動端獨立 Studio UI（R8，只做響應式降級）
- 不自封裝 Radix primitives（R12）
- 不把 Dialog/Popover/Sheet 視為自定義組件

---

## 2. 五條優化主線

### M1 · Design Token 奠基（D1 + D11）

**為什麼是第一條**：所有後續組件都要消費 token，先奠基才能避免二次重構。

**動作**：

1. `src/app/globals.css` → `:root` 定義六個核心變數（`--color-bg` / `--color-surface` / `--color-text-primary` / `--color-text-secondary` / `--color-accent` / `--color-border`），預留空 `.dark {}` 塊
2. `src/lib/design-tokens.ts` 作為 TypeScript 單一匯出（**已存在，需審計是否為權威來源**）
3. `tailwind.config.ts` `theme.extend.colors` 改為 `var(--color-*)`，刪除所有硬編碼 hex
4. 業務代碼清查：`grep -rn "#faf9f5\|#141413\|#d97757" src/` 應僅剩 `globals.css` + `design-tokens.ts`

**驗收**：

- grep 通過（除兩個源文件外 0 命中）
- Tailwind 能用 `bg-surface` / `text-accent` 等語義 class
- 手動切換 `:root` 顏色值即時反映到全頁面

**現況提示**：`design-tokens.ts` 已存在且命中 3 處硬編碼顏色。本步只是「把既有事實標準化 + 擴散到業務代碼」，不是從零開始。

---

### M2 · Studio Recipe 原型落地（D3 + D9 + EP-1）

**為什麼是 Phase 1 主事件**：EP-1（風格一致性）核心差異化組件，解耦測試要求落在 `recipe-compiler.service` 層，UI 不是關鍵路徑但需同步建殼。

**動作**：

1. `src/components/business/studio/StudioRecipeBar.tsx` — 3-slot 容器 + Advanced 按鈕
2. `src/components/business/studio/StudioRecipeSlot.tsx` — 單 slot（縮略圖 + 名稱 + 未選 `+ Add` + adapter 格式 icon + hover 預覽）
3. 掛在 `/studio` 頂部（Canvas 上方、Prompt 下方之間），**不動**現有 StudioSidebar / Canvas / PromptArea
4. Phase 1 暫用 shadcn Combobox + HoverCard + Avatar + Badge 組裝，樣式先對齊 token

**驗收**：

- RecipeBar 在 `/studio` 可見、3 個 Slot 可獨立選卡
- hover 預覽出 HoverCard（內容暫可先用 placeholder）
- 未選態 `+ Add` 用 dashed border + `--color-text-secondary`
- 已選態縮略圖 + 名稱 + `--color-accent` 高亮

**與 §F1 未解問題的關係**：hover 預覽內容（示例圖 grid / 卡片詳情 / 歷史使用記錄）在實作中再定。

---

### M3 · 組件分層單一化（D4 + D14）

**為什麼要在 Phase 1-2 全程推進**：現在 `src/components/ui/` 下 50+ 檔案，混雜 shadcn + 自建 + Magic UI 式花俏組件（`animated-shiny-text` / `hyper-text` 等）。若不治理，後續每次引入 shadcn 新組件都會再污染一次。

**動作**：

1. 建立目錄分層（按 `UI-實作落地清單.md §0`）：
   - `src/components/ui/primitives/` ← shadcn 原生產物
   - `src/components/ui/*.tsx` ← 封裝層，注入 token
2. 審計現有 `ui/` 檔案，三類標記：
   - ✓ **shadcn 規範** → 移入 primitives/ 並建封裝層
   - ⚠ **視覺花俏但有使用**（如 `animated-shiny-text` / `blur-fade` / `interactive-hover-button` / `bento-grid`）→ 歸類為「Landing/Marketing 專用」，不進業務路徑
   - ✗ **自建但 shadcn 已覆蓋** → 替換後刪除
3. 業務代碼 `import` 規則硬性執行：
   - `components/business/` + `app/` 禁止 `from '@/components/ui/primitives/*'`
   - 禁止 `from 'sonner'`（走 `@/lib/toast`）
   - 禁止 `bg-[#...]` / `text-[#...]` 任意值

**驗收**：

- 審計表輸出到 `docs/reference/ui-components.md`（或 `docs/plans/ui/ui-components-audit.md`）
- ESLint rule 或 CI grep 守護上述三條禁令
- Phase 2 末 `src/components/ui/` 每個文件都能回答「shadcn 基線 / 封裝層 / Marketing 特例」三選一

---

### M4 · Gallery 體驗閉環（D6 + D12 + EP-5）

**為什麼在 Phase 2**：Gallery 是目前最成熟頁面，優化動作集中在「pill 化 + 高級收納 + 性能守護 + 測試補齊」，不是推倒重寫。

**動作**：

1. `GalleryFilterBar` → 拆為 `GalleryHeader`（3 pill：sort / type / timeRange + cmdk search + Advanced popover 入口）+ `GalleryAdvancedFilters`（model / liked 收納）
2. `ImageDetailModal` 樣式對齊 `ui/dialog` 封裝層基線；**先補測試**（`WP-Gallery-02` P0）再改樣式，避免回歸無守護
3. `Lightbox.tsx` 基於 `ui/dialog` + 自定義黑幕/縮放動效（動效曲線細節 §F2 延後）
4. `Particles` 性能守護擴展：已有 `prefers-reduced-motion`，補 `navigator.hardwareConcurrency < 4` 降粒子數到 60（`WP-Gallery-01`）
5. Phase 2 末上線 `CardDrawer`：Navbar 右側加「⌘K My Cards」→ Sheet + cmdk + 3 Tab（Characters / Styles / Backgrounds），復用現有 `CharacterCardManager` 等

**驗收**：

- 三 pill 橫向寬度移動端不溢出（R10 反制）
- Advanced popover 默認收起，點擊才展開
- `ImageDetailModal` 測試覆蓋：開關 / Like 樂觀更新失敗回滾 / ESC 關閉 / visibility 權限
- Lightbox ESC + 點擊黑幕關閉；動效 150-200ms
- Particles 在 `prefers-reduced-motion` 或低端設備下不掛 canvas
- `CardDrawer` 可從 Navbar 打開、3 Tab 切換、`⌘K` 呼出

---

### M5 · 響應式 + Profile 雙形態（D2 + D7 + D10 + D13）

**為什麼在 Phase 3**：依賴 M1（token）、M3（組件分層）、shadcn `resizable` / `sheet` / `checkbox` 全到位。

**動作**：

1. `StudioShell.tsx` 承接三欄響應式：
   - ≥1024：三欄 + `react-resizable-panels`
   - <1024：側欄折疊為 icon rail
   - <768：側欄變 Sheet 抽屜 + RecipeBar 垂直 stack
   - 折疊狀態 localStorage 持久化
   - `Cmd+\` 切換（IME 組字中不誤觸，沿用 Studio shortcut 既有守護）
2. `ProfileShellPublic.tsx`（`/u/[username]`）：Avatar + bio + Follow + Quiet gallery 瀑布流（樣式對齊 Gallery）
3. `ProfileShellPrivate.tsx`（`/profile`）：統計段 + 分類 tab + 多選模式
4. `BulkActionBar.tsx`：sticky bottom，0 選中隱藏，有選中 `translateY(20px) → 0` + fade 150-200ms（D13）
5. `ProfileFeed` 拆：對外邏輯保留為 hook，UI 按雙形態分叉

**驗收**：

- Studio 在 1440 / 1024 / 768 / 375 四個 viewport 下無 overflow、無閃爍
- Studio 折疊狀態刷新保留
- `/u/[username]` 視覺對齊 Gallery 瀑布流（Quiet gallery 氣質）
- `/profile` 呈 dashboard 感（統計 + 多選 + 批量 bar）
- `BulkActionBar` 0 選中時不佔版面、動畫無彈跳（禁 spring overshoot）

---

## 3. 優先級執行清單（跨主線合併）

### 3.1 立即動手（本週內，與 Phase 1 啟動併行）

| 順序 | 動作                                               | 主線 | 關聯 WP       | Effort |
| ---- | -------------------------------------------------- | ---- | ------------- | ------ |
| 1    | 補 `not-found.tsx`（根 + `[locale]`）              | —    | WP-Global-01  | S      |
| 2    | 補 `ImageDetailModal` / `ImageCard` 測試           | M4   | WP-Gallery-02 | M      |
| 3    | 補 `use-like` 競態測試 + 守護                      | M4   | WP-Gallery-06 | S      |
| 4    | Token 層奠基（globals.css + Tailwind + grep 清查） | M1   | —             | S      |
| 5    | RecipeBar + RecipeSlot 原型上線                    | M2   | EP-1 配套     | M      |

### 3.2 Phase 1 末完成（3 週目標）

| 動作                                 | 主線 | 關聯 WP       |
| ------------------------------------ | ---- | ------------- |
| `src/components/ui/` 首輪審計表輸出  | M3   | §2.6          |
| `lib/toast.ts` 最小版 + EP-3/4 接入  | M3   | WP-Global-03  |
| Studio `loading.tsx` + `error.tsx`   | —    | WP-Studio-02  |
| Studio 快捷鍵白名單驗證 + IME 測試   | —    | WP-Studio-04  |
| `use-studio-generate` 職責邊界 JSDoc | —    | WP-Studio-03  |
| Gallery Particles 低端降級           | M4   | WP-Gallery-01 |

### 3.3 Phase 2（4-8 週）

| 動作                                                    | 主線 |
| ------------------------------------------------------- | ---- |
| `GalleryFilterBar` → `GalleryHeader` 拆分               | M4   |
| `GalleryAdvancedFilters` popover 組件                   | M4   |
| `Lightbox` 組件                                         | M4   |
| `CardDrawer` 上線 + Navbar 入口                         | M4   |
| 5 個新 shadcn 組件引入 + 封裝層（見 §1.1 落地清單 2.1） | M3   |
| `src/components/ui/` 完整審計 + 替換                    | M3   |
| Toast 全域替換（`WP-Global-03`）                        | M3   |
| Gallery URL 狀態 + 空態 + Sentinel + JSON-LD            | M4   |

### 3.4 Phase 3（9-12 週）

| 動作                                     | 主線 |
| ---------------------------------------- | ---- |
| `StudioShell` 三欄響應式 + 折疊持久化    | M5   |
| `ProfileShellPublic` / `Private` 拆分    | M5   |
| `BulkActionBar` + `ProfileFeed` 批量操作 | M5   |
| Profile `loading.tsx` / `error.tsx`      | —    |
| Arena / Storyboard loading/error 三件套  | —    |

---

## 4. 守護與驗收

### 4.1 硬性守護（CI 或 grep）

1. 顏色硬編碼 → `grep -rn "#faf9f5\|#141413\|#d97757" src/ | grep -v "globals.css\|design-tokens.ts"` 必須為 0
2. sonner 直引 → `grep -rn "from 'sonner'" src/components/business src/app` 必須為 0（除 `@/lib/toast` / `@/components/ui/sonner`）
3. primitives 越權引用 → `grep -rn "from '@/components/ui/primitives" src/components/business src/app` 必須為 0
4. `bg-[#...]` / `text-[#...]` Tailwind 任意值 → ESLint rule 或 grep 守護

### 4.2 性能守護

- Gallery 首頁 LCP < 2.5s（現狀映射 §1.1 驗收）
- CLS < 0.1（PageSkeleton 與實際 h1 位置對齊）
- Particles 低端設備 CPU < 30%
- 無限滾動 20 次切換無重複 fetch

### 4.3 功能守護

- 三語 metadata / 三語 error / 三語 toast 全覆蓋
- 未登入進 `/profile` 頁內提示（不是 HTTP redirect）
- Clerk session 跨 locale 切換不中斷
- MobileTabBar ↔ Navbar 767/768 斷點無雙顯示

### 4.4 組件守護

- 新增 UI 組件 **先問**：shadcn 有沒有 → 有則引入並封裝 → 沒有且是產品差異化才 Build Custom
- Build Custom 名單僅限：`StudioRecipeBar` / `StudioRecipeSlot` / `StudioShell` / `GalleryHeader` / `GalleryAdvancedFilters` / `Lightbox` / `CardDrawer` / `ProfileShellPublic` / `ProfileShellPrivate` / `BulkActionBar`（共 10 個）
- 任何試圖新增第 11 個自定義 → 先更 `UI-路線決策結論書.md` 才能寫代碼

---

## 5. 風險提示

| 風險                                            | 緩解                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Phase 1 token 遷移觸發大範圍樣式回歸            | 先 grep 統計影響面，改動集中在一個 commit + 視覺回歸 smoke（待接入）             |
| `GalleryFilterBar` 拆分影響 URL 參數契約        | `GallerySearchSchema` 不動，只改 UI 消費層；`buildGalleryQueryString` 鍵順序保持 |
| `StudioShell` 引入後既有 StudioContext 測試回歸 | `WP-Studio-05` 的 mock wrapper 須先就緒                                          |
| shadcn 升級導致封裝層 props 失效                | 封裝層明確鎖定 shadcn 版本 + 寫入 `package.json` `resolutions`                   |
| IME 組字快捷鍵誤觸                              | `WP-Studio-04` 測試必須先落地，才能碰 `Cmd+\` 折疊快捷鍵                         |
| Dark mode 提前需求                              | 僅允許走 token 層路徑（不引入 `next-themes` / `.dark` 樣式到 Phase 3 前）        |

---

## 6. 未解問題與延後項

直接繼承 `UI-路線決策結論書.md §8`，**本文件不另設新的未解問題**：

- F1 RecipeBar hover 預覽內容 → Phase 1 EP-1 實作中定
- F2 Lightbox 動效細節 → Phase 2 EP-5 實作中定
- F3 首頁 Hero / Models / Workflow 版面 → Phase 3 後期單獨訪談
- F4 404 / error / loading 氣質統一 → Phase 4「全域基礎體驗批次」
- F5 三語微排版（ja/zh 行距、字重）→ 各 EP 實作時按需

Phase 4 延後項（與 `UI-路線決策結論書.md §7` Optional Phase 4 一致）：Dark mode、Lightbox 升級、獨立 `/cards` 頁、視頻 Gallery 互動、SEO 批次 UI。

---

## 7. 文件關聯

```
UI-路線決策結論書.md                ← 所有既有決策源頭（本文件 §0-§6 以它為準）
UI-實作落地清單.md                  ← Phase 1/2/3 具體路徑、shadcn 命令
02-現狀映射.md                       ← 頁面現狀 + 2026-04-17 最新進展
03-工作包細分.md                    ← 23 個 WP 的 Goal / Acceptance / Priority
UI-優化方案.md（本文件）            ← 綜合提煉：優先級 + 主線 + 守護
design-handoff/                     ← 2026-04-18 Claude Design 匯出的 Studio 三模式視覺稿（§8 依據）
  ├── README.md                     ← Handoff 使用指引
  └── project/
      ├── Studio Spec.md            ← 三模式工程交付規格（首選讀物）
      ├── colors_and_type.css       ← 30+ 語義 token + pv-* 工具類
      └── ui_kits/                  ← Image / Video / Audio 三份 HTML + 對應 CSS
```

**本文件維護規則**：

- 既有決策變更 → 先改 `UI-路線決策結論書.md`，再同步本文件 §2 / §3
- Handoff 新增決策 → 先在 §8.5 登記待決項，由用戶確認後回填 `UI-路線決策結論書.md §1` 的決策表，再同步本文件
- Phase 完成 → 更新 §3 對應節並勾除 §1.2 缺口
- 新風險出現 → 補 §5
- 不在本文件新增未解問題（去 `UI-路線決策結論書.md §8`）

---

## 8. Design Handoff 對齊增補（2026-04-18 新增）

> 本章不是重述 `design-handoff/project/Studio Spec.md`，而是回答：
> **1. Handoff 對既有 01-UI 決策做了什麼補強、改變、擴展？**
> **2. 哪些可以直接合進 §2-§3 動手做？**
> **3. 哪些有本質分歧必須先問用戶？**

### 8.1 來源速覽

| 檔案                                                 | 角色                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| `design-handoff/README.md`                           | Handoff 使用指引：先讀 Studio Video.html + 跟進它的 imports           |
| `design-handoff/project/Studio Spec.md`              | **首要工程讀物** — 7 章節覆蓋全域、Image、Video、Audio、引擎注記      |
| `design-handoff/project/colors_and_type.css`         | Design token 權威 CSS（`:root` + `.dark` + `pv-*` 工具類）            |
| `design-handoff/project/ui_kits/Studio - Video.html` | 用戶打開狀態的首要設計（Script Doctor + Character Turnaround 都在此） |
| `design-handoff/project/ui_kits/Studio - Image.html` | Image 模式：run archive + variant tray + 浮動 composer                |
| `design-handoff/project/ui_kits/Studio - Audio.html` | Audio 模式：voice rail + script doc + inspector + transport bar       |

### 8.2 Handoff 與既有 01-UI 的對齊點（直接採納）

這些 handoff 內容與 `UI-路線決策結論書.md` 方向一致，不需新增決策，可直接納入實作：

| 對齊項             | 01-UI 依據 | Handoff 對應                                                                     |
| ------------------ | ---------- | -------------------------------------------------------------------------------- |
| 核心色值           | D1 / §3.1  | `--background` `#faf9f5` · `--foreground` `#141413` · `--primary` `#d97757`      |
| 字體配對           | D1 / §3.2  | Space Grotesk（display）+ Lora（serif）+ Geist Mono — 完全一致                   |
| 全域克制編輯氣質   | D1         | "Warm, editorial, quiet" — 原話一致                                              |
| 禁止純白、藍紫漸變 | D1 / §3.1  | Handoff 強制「raw hex 僅能在 token 檔案」                                        |
| shadcn/ui 單一基線 | D4 / D14   | Handoff 未指定組件庫，但 token + 工具類與 shadcn 可直接共生                      |
| Sidebar + 項目樹   | D8 / §4.1  | `studio.css` 的 `.sidebar` + `.tree-row`（彩色標籤 + 計數 + active left-bar）    |
| 項目樹拖放         | —          | 現有 01-UI 未顯式提，但 Handoff §1.2 建議拖放支援 — 與 Pragmatic DnD 兼容        |
| 命令面板 `⌘K`      | D12 / §4.2 | Handoff §1.3 全量 fuzzy match (projects / models / presets / recent)             |
| 暗色延後           | D11        | Handoff `.dark` 已寫好 token，**Phase 4 之前不啟動 ThemeProvider**（D11 仍生效） |
| 動效節制           | §3.3       | Handoff 用 `--ease-out-expo` + `--dur-base 200ms` — 與禁 spring overshoot 一致   |

### 8.3 Handoff 擴展 / 修改 01-UI 的項目

這些是 handoff 帶來的**新資訊**或**與 01-UI 有明確分歧**，需要在本節登記並分類處理。

#### 8.3.1 Token 系統大擴展 — 可直接採納

`UI-路線決策結論書.md §3.1` 只列 6 個核心 token；`colors_and_type.css` 提供約 30+：

- 核心色：`--background / --foreground / --card / --popover / --primary / --primary-dark / --primary-foreground / --secondary / --muted / --accent / --destructive / --border / --input / --ring`
- 資料可視化：`--chart-1 ~ --chart-5`（amber / cool blue / sage / sand / warm brown — 全部低飽和）
- 衍生表面：`--surface-elevated / --surface-soft / --surface-highlight / --page-border`
- 圓角尺度：`--radius-sm` 到 `--radius-4xl` + `--radius-pill`
- 排版尺度：`--text-3xs` 到 `--text-5xl` + 品牌專用（`--text-brand` / `--text-nav` / `--text-tab`）
- 字距：`--tracking-brand / --tracking-tight / --tracking-display / --tracking-nav / --tracking-eyebrow`
- 間距：`--space-1` 到 `--space-16` + `--max-width-content`
- 陰影：`--shadow-sm / --shadow-card / --shadow-hover / --shadow-primary-btn / --shadow-primary-btn-hover`（color-mix 混 foreground/primary，永不 `rgba(0,0,0,.x)`）
- 動效：`--ease-out-expo / --ease-standard / --dur-fast 150 / --dur-base 200 / --dur-slow 300 / --dur-reveal 600`

並附 `pv-*` 語義工具類：`pv-hero / pv-h1-h3 / pv-body / pv-body-sans / pv-lede / pv-eyebrow / pv-nav-label / pv-label / pv-mono / pv-tabular / pv-card / pv-pill / pv-btn[.pv-btn-primary/.pv-btn-outline/.pv-btn-ghost/.pv-btn-lg] / pv-input`

**處理方式（M1 動作更新）**：

1. 把 `design-handoff/project/colors_and_type.css` 視為 **token 權威藍本**
2. 落地路徑 `src/app/globals.css`（或拆為 `src/app/tokens.css` 後 import）
3. `tailwind.config.ts` 用 CSS variables（`colors.background: 'var(--background)'` 等）
4. `pv-*` 工具類 **選擇性引入** — 和 shadcn 封裝層並存：Marketing/Landing 頁可直用 `pv-*`，業務組件走 shadcn 封裝層
5. **保留 01-UI hard rule**：業務代碼禁止 `bg-[#...]`；現在 Tailwind 有完整語義類，沒有理由硬編碼
6. 檢查既有 `src/lib/design-tokens.ts`（已有，命中 3 處硬編碼）是否與 handoff 一致 — 不一致則以 handoff 為準

#### 8.3.2 Studio 三模式路由 — 需決策

**分歧**：

- **01-UI**：單一 `/studio` 路由，模式通過 context 內部切換（隱含），可折疊三欄
- **Handoff** §0：`/studio/image`、`/studio/video`、`/studio/audio` — 明確 URL 分叉
- **現況**：`src/app/[locale]/(main)/studio/page.tsx`，目前單一 route（`/studio/draft` 已於 2026-04-25 下線，見 `03-工作包細分.md` WP-Studio-01）

**選項**：

- (a) 沿用當前單 route，模式改為 sidebar 頂部 tile 切換（純視覺），不改路由
- (b) 採納 handoff，新增三條 route，現有 `/studio` 變為 mode picker 或 redirect
- (c) 折中：保留 `/studio` 作為預設（Image mode），新增 `/studio/video` / `/studio/audio`

**建議**：走 (c)。理由：視頻在 `05-視頻劇本/` 已有獨立工作線（Phase 1），用獨立 route 更能隔離狀態、SEO 分面。但這需要用戶點頭 — 涉及 6 個 i18n key、metadata、404 fallback。

→ **登記在 §8.5 待決 Q1**

#### 8.3.3 Image 模式 Composer ⇆ RecipeBar — 本質分歧，必須決策

這是 handoff 與 01-UI **最大的分歧**，不可忽略。

**01-UI D9**（`UI-路線決策結論書.md`）：

- `StudioRecipeBar` = 3-slot 組合（Character + Style + Background 三張卡）+ Advanced 按鈕
- 佔 Canvas 頂部，卡片管理在 Sidebar（互補分工）
- 理由：卡片可重複使用，Recipe 可保存復用，是產品差異化核心

**Handoff** §2.4 Image mode：

- **浮動 Composer** 固定在畫布底部（1120px 居中，絕對定位），包含：
  1. Reference row — drop 參考圖 chip 行
  2. Prompt textarea — 自動增高
  3. Preset strip — 橫向滑動的風格 chip（帶微縮圖）
  4. Composer foot — Model trigger / Aspect / Batch / Advanced / Generate 大按鈕
- 主畫布 = 歷史 run 永不清除的檔案流（run archive）
- 最近收藏的生成會觸發自動 variant tray

**分歧本質**：

| 維度     | 01-UI RecipeBar | Handoff Composer                |
| -------- | --------------- | ------------------------------- |
| 位置     | 畫布頂部        | 畫布底部（浮動）                |
| 組合元素 | 3 個卡片槽      | 1 組風格 chip + 多圖參考        |
| 心智模型 | 卡片家譜 / 食譜 | Midjourney-style free-form 生成 |
| 歷史結果 | 交給 Gallery    | Studio 內 run archive（永留）   |
| 收藏動作 | 無特殊效果      | 自動觸發 5 個 variant           |

**選項**：

- (a) **完全採納 Handoff**：廢棄 D9（RecipeBar），Phase 1 改建 Composer；Card 系統降級為 preset chip 的數據來源
- (b) **完全保留 01-UI**：忽略 handoff 的 Image Composer 視覺，只抓 token 層；D9 不動
- (c) **混合**：頂部 RecipeBar（管理已定義的組合）+ 底部 Composer（即興生成）— 功能並存，UX 複雜度高
- (d) **平滑過渡**：Phase 1 先做 RecipeBar（符合 D9），Phase 2 加 Composer 作為 Image mode alt 入口，用戶選擇偏好

**推薦**：(a) 或 (d)。(c) 違反 D2「控制台可折疊」的克制原則，(b) 浪費了 handoff 的設計成熟度。

→ **登記在 §8.5 待決 Q2 —— 這是所有 Phase 1 動作的前置條件**

#### 8.3.4 Video 模式：Script Doctor + Character Turnaround — 高價值新功能

01-UI 完全未涵蓋視頻模式（只在 `UI-路線決策結論書.md §7 Optional Phase 4` 提到「視頻 Gallery 互動」）。Handoff §3 帶來兩個簽名功能：

**A. Script Doctor**（`design-handoff/project/Studio Spec.md §3.3`）

- 用戶貼入散文 → AI 轉出 shot list（相機 / 時長 / 動作）
- 每個 shot row：index + 16:9 預覽 + 標籤 slug + contenteditable 腳本 + 模型/seed/ref 元資料 + 4 個動作按鈕（Lock / Regenerate / Vary / DL 或 Generate / Delete）
- Shot 之間 transition connector（Cut / Dissolve / Hard cut · sound bridge 可點擊切換）
- 鎖定的 shot 在 "Re-doctor script" 時保留 — 這是韌性設計

**B. Character Turnaround 工作台**（Spec §3.4）

- 點任一 Cast card 開啟全工作區 overlay（非 modal）
- 三視圖 triptych：Front 0° / 3/4 45° / Profile 90°
- 每個 view 可獨立 Lock / Vary
- Inspector 面板：Character（名稱、wardrobe tags、description）+ Turnaround settings（model / background / lighting match）+ Usage（被引用的 shot 清單）
- 作用：提供視頻生成模型所需的人物一致性引用

**與現有 05-視頻劇本/ 的關係**：

- 記憶庫 S332-S335 顯示 Phase 1 視頻腳本工作包已拆定（10 個 L01-L10）
- 現有 WBS 未採用 handoff 的 Script Doctor / Character Turnaround 具體 UI
- Handoff 的視覺密度 + 互動深度（shot-level lock / regen / vary / transition）**遠超** 現有 WBS 範圍

**處理方式**：

1. 不改 Phase 1 視頻腳本工作包的 **後端 / 數據層** 決策（L01-L10 的 Prisma / API 繼續）
2. **UI 層**：以 handoff 為準 — 下一輪視頻前端工作拆分時，`StudioVideoShell` / `ShotRow` / `TransitionConnector` / `ScriptIntake` / `CharacterWorkbench` / `AssetsRail` 這些組件名直接採用
3. **簽名功能優先級**：Script Doctor 在 Phase 1 內（已計劃）；Character Turnaround 推 Phase 2（依賴 Shot → Ref 鏈路穩定）
4. **保留決策權**：三視圖 (Front/3-4/Profile) 是否是 MVP 必備？見 §8.5 待決 Q3

→ **登記在 §8.5 待決 Q3**

#### 8.3.5 Audio 模式 — 新輪廓

01-UI 未涵蓋音頻。Handoff §4 帶來：

- **Voice cast rail**（左 260px）：Voice 卡片 + 克隆新 voice 入口
- **Script document**（中）：chapter → block → inline token（`dir` / `pause` / `emph`）
- **Inspector**（右 340px）：Voice 四維滑塊（Pace / Warmth / Energy / Stability）+ Direction preset chips + SFX library
- **Transport bar**（底部浮動）：full-episode waveform + chapter marks + playhead + export dropdown

**處理方式**：Audio 全量視為 **未來 Phase（≥Phase 4）** 的目標狀態，本輪不動手實作。只做：

1. `ROUTES` 預留 `/studio/audio` 常數（若 §8.3.2 選 (c)）
2. Mode 切換 UI 在 sidebar 顯示 Audio tile，但 tile 為 disabled 或跳 coming soon
3. `colors_and_type.css` 的 Audio 綠 `#6d8f5c` 寫入 token 層（即使本輪未用，為未來讓路）

#### 8.3.6 Mode-local accent — 小但重要

Handoff 規則（Spec §0）：

- Image mode 主強調色 = `--primary` (#d97757)
- Video mode 強調色 = `#9b59b6`（僅限 Video 工作區內部）
- Audio mode 強調色 = `#6d8f5c`（僅限 Audio 工作區內部）
- Top nav、sidebar、全域按鈕 **永遠** 用 `--primary`，與模式無關

**M1 動作更新**：

1. CSS variable 加：`--mode-accent`（預設 = `--primary`）
2. `.sb-mode.video.on { --mode-color: #9b59b6 }` 的寫法（`studio.css:128-129`）直接採納
3. Tailwind 不接 `--mode-accent` 到全局 color map（避免誤用），只在需要的 scoped 組件用 `var(--mode-accent)`

#### 8.3.7 Image mode Run Archive — 新架構決策

Handoff §2 的 Image mode 把 **每次生成都保留為一個 run section**，永不清除；Gallery 仍是分離概念（公開展示 / 社群）。

**這是對 01-UI 的補充，不是分歧**：

- 01-UI 未描述 Studio 內的歷史管理方式（只講 Gallery 瀑布流）
- Handoff 明確「Studio 是工作台，每次運行是有時間戳的文檔；Gallery 是公開展示」

**處理方式**：

1. Studio 內既有 `HistoryPanel` / `StudioProjectHistory` 的角色需重新定位
2. 三個選項：
   - (a) Studio 畫布 = run archive（handoff 建議），`HistoryPanel` 降為 sidebar 次要組件
   - (b) 保留 HistoryPanel 為主，run archive 作為可選全屏視圖
   - (c) 合併：把 HistoryPanel 演進成 run archive，不新增組件
3. **推薦** (c) — 最小改動、重用既有組件

→ **登記在 §8.5 待決 Q4**

### 8.4 M1–M5 更新建議（Handoff 整合後）

| 原主線 | 原動作                                     | Handoff 後的調整                                                                            |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| M1     | 6 個 token + Tailwind 接入                 | **擴展**：採納 30+ handoff token + `pv-*` 工具類 + mode-accent 機制                         |
| M2     | StudioRecipeBar + RecipeSlot               | **等待 §8.5 Q2 決策**；若走 Handoff Composer，本主線替換為 `StudioComposer` + `PresetStrip` |
| M3     | shadcn 單一基線                            | **不變**。shadcn + handoff token + `pv-*` 可共生                                            |
| M4     | GalleryHeader + CardDrawer + Lightbox      | **不變**。Handoff 未涵蓋 Gallery                                                            |
| M5     | StudioShell + ProfileShell + BulkActionBar | **擴展**：StudioShell 的三欄骨架要支援 mode-switch + sub-tabs（見 Spec §1.2 / §3.1 / §4.1） |

**新增主線（等待決策）**：

- **M6**（Phase 1-2）：Script Doctor 視頻 UI — `StudioVideoShell` + `ScriptIntake` + `Storyboard` + `ShotRow` + `TransitionConnector` + `AssetsRail`
- **M7**（Phase 2-3）：Character Turnaround — `CharacterWorkbench` + Front/3-4/Profile triptych
- **M8**（Phase 4+）：Audio Studio — `VoicesRail` + `ScriptDocument` + `Inspector` + `TransportBar`

### 8.5 待決問題 — 已於 2026-04-19 全部解決 ✅

> Q1–Q6 已由用戶確認「全部按推薦方案走」，回填為 `UI-路線決策結論書.md §1` 的 D15–D20。

| #   | 問題                             | 決議                                                              | 新決策 |
| --- | -------------------------------- | ----------------------------------------------------------------- | ------ |
| Q1  | Studio 路由結構                  | 折中漸進：`/studio` = Image，新增 `/studio/video`，Audio Phase 4+ | D15    |
| Q2  | Image mode Composer vs RecipeBar | 漸進：Phase 1 RecipeBar，Phase 2 加 Composer 為 alt 入口          | D16    |
| Q3  | Character Turnaround             | 推 Phase 2                                                        | D17    |
| Q4  | Studio 歷史組件                  | 合併演進：HistoryPanel → run archive                              | D18    |
| Q5  | `pv-*` 工具類範圍                | Marketing-only                                                    | D19    |
| Q6  | `oklch()` 色彩空間               | 全面遷移                                                          | D20    |

### 8.6 不等待決策就可動手的 Handoff 整合項

以下動作對 §8.5 待決問題 **無依賴**，可立即執行：

1. ✅ 把 `design-handoff/project/colors_and_type.css` 複製到 `src/app/tokens.css`（或整合到 `globals.css`），替換現有硬編碼顏色 — 這是 M1 的新權威藍本
2. ✅ `tailwind.config.ts` 接入所有 30+ token（semantic naming）
3. ✅ 審計 `src/components/ui/` 下 50+ 組件，比對 handoff 的 `pv-btn` / `pv-card` / `pv-pill` 等基線樣式
4. ✅ 為視頻腳本工作線（`05-視頻劇本/`）Phase 1 UI 新增引用：實作時組件命名、視覺密度以 handoff `ui_kits/Studio - Video.html` 為準
5. ✅ Sidebar 的 `.sb-mode.{image,video,audio}.on { --mode-color: ... }` 寫法直接落地（即使三 route 未拆）
6. ✅ Top nav 的 `⌘K` 命令面板入口（D12）— handoff `studio_shell.js` 有完整示例
7. ✅ 項目樹的 color-tag + active left-bar + drop-target 樣式（`studio.css:147-172`）直接對齊

### 8.7 風險與守護（Handoff 層）

| 風險                                                | 緩解                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 盲目照抄 handoff HTML 結構                          | 僅以 handoff 為 **視覺規格**，組件結構依 React/shadcn 慣例重建，不複製 vanilla DOM       |
| `pv-*` 工具類與 shadcn 變體衝突                     | 分層：shadcn 封裝層走 tailwind class，`pv-*` 只用於非 shadcn 區（Marketing、token 直用） |
| `oklch()` 老瀏覽器不支援                            | Safari 15.4+、Chrome 111+ 已支援；Next.js 16 的 target browserlist 確認通過              |
| Handoff README 提醒「不渲染截圖」                   | 遵守 — 所有對齊用讀 HTML/CSS/Spec 文字，不 screenshot                                    |
| 三模式路由決策拖延                                  | Q1 決不了時，預設走 (a) 單路由，不阻塞 M1 token 奠基                                     |
| Video 組件命名與現有 `StudioResizableLayout` 等衝突 | 新增組件用 `StudioVideo*` 前綴命名空間，不動既有 Studio 組件                             |

### 8.8 建議的確認流程

1. 用戶讀 §8.5 Q1-Q6，逐條給出選項
2. 依 §8.6 立即動手清單開啟 PR 1（token 奠基 + handoff CSS 落地）
3. 依 Q1/Q2 決策結果，發起 PR 2（Studio 路由或 Composer 原型）
4. 依 Q3/Q4 決策結果，排入 Phase 2 工作包細分
5. 回填新決策到 `UI-路線決策結論書.md §1` 決策表（作為 D15+）
6. 同步更新本文件 §0 TL;DR 主線表
