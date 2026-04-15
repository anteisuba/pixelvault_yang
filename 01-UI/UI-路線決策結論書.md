# UI 路線決策結論書

> 產出於 4 輪 UI 路線確認訪談 · 合計 12 題 · 12 個 Confirmed Decisions + 12 個 Rejected Directions
>
> 本文件是 `WBS-中長期演進計劃.md` 的 **UI 側執行補充**，不替代演進計劃，只補齊「UI 該長什麼樣、組件如何組織、什麼階段做什麼 UI」
>
> 基準日期：2026-04-15

---

## 0. 速查（TL;DR）

- **設計語言**：Editorial warm minimal（全域）· Quiet gallery（Gallery/Profile `/u` 局部修辭）
- **三頁定位**：Studio = 可折疊創意控制台 · Gallery = 篩選 pill 化藝廊 · Profile = 雙形態（展示 vs 管理）
- **核心差異化組件**：StudioRecipeBar（3-slot 組合） + BulkActionBar + GalleryHeader + ProfileShell(Public/Private) + CardDrawer
- **組件基線**：**shadcn/ui 唯一** + 3 個特例補充
- **Dark mode**：Phase 4 之後，token 層預留 CSS variables 結構
- **響應式**：≥1024 三欄 / <1024 側欄折疊 icon / <768 側欄 Sheet 抽屜

---

## 1. 全部 Confirmed Decisions

| #   | 主題                 | 決策                                                                                       | 來源     |
| --- | -------------------- | ------------------------------------------------------------------------------------------ | -------- |
| D1  | 全域設計語言         | Editorial warm minimal（全域）+ Quiet gallery（Gallery / Profile `/u` 局部）               | Q1       |
| D2  | Studio 佈局骨架      | 可折疊控制台，基於現有三欄漸進升級（不重寫）                                               | Q2       |
| D3  | 風格控制顯性層級     | Studio 上方工具條（選卡片） + 左欄保留（管理卡片）互補                                     | Q6       |
| D4  | UI 組件策略          | External first → Reuse Internal → Wrap Internally → Build Custom                           | 通用原則 |
| D5  | 核心自定義邊界       | 只做產品差異化組件（非通用交互）                                                           | 通用原則 |
| D6  | Gallery 定位         | 篩選 pill 化藝廊 + 高級篩選 popover 收納低頻字段                                           | Q3       |
| D7  | Profile 雙形態差異   | 中等區分：`/u` = Quiet gallery 瀑布流 · `/profile` = dashboard 感                          | Q4       |
| D8  | Card IA 演進         | 階段驅動：Phase 1 Studio 內嵌 → Phase 2 末加 nav 級 CardDrawer → Phase 4 可選獨立 `/cards` | Q5       |
| D9  | StudioRecipeBar 視覺 | 3-slot 組合：縮略圖 + 名稱 + 未選「+ Add」；保持 Canvas 主導                               | Q7       |
| D10 | 響應式退化策略       | 選擇性降級：≥1024 三欄 / <1024 側欄折疊為 icon / <768 側欄變 Sheet + RecipeBar stack       | Q8       |
| D11 | Dark mode 策略       | Phase 4 之後才考慮；token 層預留 CSS variables 結構（`var(--color-*)`，不硬編碼）          | Q9       |
| D12 | 篩選 pill 分界       | 3 pill 常駐：sort / type / timeRange；Advanced popover：model / liked；search 用 cmdk      | Q10      |
| D13 | 批量操作 bar 行為    | 選擇時觸發：0 選中隱藏、有選中 fade + translateY 150-200ms 淡入                            | Q11      |
| D14 | 組件庫基線           | shadcn/ui 為唯一通用組件來源；3 個特例補充（見 §5）                                        | Q12      |

---

## 2. 全部 Rejected Directions

| #   | Rejected                                               | 拒絕理由                               |
| --- | ------------------------------------------------------ | -------------------------------------- |
| R1  | Asset-gallery hybrid 作全域氣質                        | 與 Editorial warm 基調衝突，破壞作品感 |
| R2  | Studio 極簡工作台（chat-like）                         | 現有 60+ 組件大面積廢棄                |
| R3  | 風格控制用 `@` mention 觸發                            | Card 藏太深，違背目標 A                |
| R4  | Gallery 左欄分屏篩選                                   | 太工具化，破壞藝廊感                   |
| R5  | Profile 雙形態完全同樣式                               | 一眼分不清展示 vs 管理，信任感崩       |
| R6  | Card 永不升級 IA                                       | 長期 Card 被困在 Studio 臨時工具位     |
| R7  | Recipe 整體大 Block                                    | 占 Canvas 40%，與 D2 衝突              |
| R8  | 移動端 Studio 重設計                                   | 維護兩套 UI，違反 D4                   |
| R9  | 頁面級混合 dark（Studio light / Gallery-Profile dark） | 撕裂 Editorial warm 全域               |
| R10 | Gallery 全 6 pill 篩選                                 | 移動端橫向溢出                         |
| R11 | 批量 bar 永遠顯示                                      | 違反 Editorial warm 克制氣質           |
| R12 | 完全自封裝 Radix primitives                            | 造通用輪子，違反 D4                    |

---

## 3. 設計語言規則（Editorial Warm Minimal 規格）

### 3.1 色彩 Token

| Token                    | 值                                    | 用途                                       |
| ------------------------ | ------------------------------------- | ------------------------------------------ |
| `--color-bg`             | `#faf9f5`                             | 全域背景（米白，**禁止純白 `#fff`**）      |
| `--color-surface`        | `#faf9f5` 或極淺淡米色                | 卡片 / Modal / Drawer 底色                 |
| `--color-text-primary`   | `#141413`                             | 標題、正文主色                             |
| `--color-text-secondary` | `#141413` + 60-70% opacity            | 次要文字                                   |
| `--color-accent`         | `#d97757`                             | 強調色（按鈕、active pill、Recipe 已選態） |
| `--color-border`         | 極淡灰或 `#141413` 低透明度           | 分隔線、卡片邊框                           |
| **禁止**                 | 藍紫漸變 / 霓虹色 / 重陰影 / 純白背景 | —                                          |

### 3.2 字體

| 用途                 | 字體                                 | 特徵                   |
| -------------------- | ------------------------------------ | ---------------------- |
| 標題（h1-h3）        | Space Grotesk                        | sans-serif，幾何感     |
| 正文、副標、強調段落 | Lora                                 | serif，襯線溫暖        |
| 中日文               | Noto Sans CJK（或等效 CJK fallback） | 與上述 sans/serif 配對 |
| 數字 / 代碼          | Geist Mono（已在項目）               | 等寬                   |

**原則**：sans + serif 混排是 Editorial warm 的主要識別符，**禁止全 sans 化**。

### 3.3 動效

| 場景                 | 時長      | 動畫類型                       |
| -------------------- | --------- | ------------------------------ |
| Fade in              | 150-200ms | `opacity 0 → 1`                |
| 批量 bar 滑入（D13） | 150-200ms | `translateY(20px) → 0` + fade  |
| Panel 折疊/展開      | 200-300ms | `width` + `opacity`            |
| Page transition      | 300ms     | fade + translate-y（已有）     |
| **禁止**             | —         | 彈跳 / 過度 / spring overshoot |

### 3.4 留白與節奏

- 大留白是 Editorial warm 的核心語言，**不怕空**
- 頁面垂直節奏：h1 上下間距 ≥ 32px；段落間距 24px；行內元素間距 8-12px
- 雜誌式目錄感：入口鏈接用斜體襯線副標，不用 icon

### 3.5 Dark Mode 預留（D11）

- 所有顏色**必須**用 `var(--color-*)`，禁止硬編碼 `#faf9f5`、`#141413` 等
- CSS variables 定義在 `:root`，未來在 `.dark` 類下重新賦值即可
- 項目內嚴禁 `bg-[#faf9f5]` 式 Tailwind 任意值，改用 `bg-surface` 這種 semantic class

---

## 4. 三大頁面 UI 骨架

### 4.1 Studio（Editorial warm + 可折疊控制台）

```
┌─ StudioShell（響應式、折疊狀態持久化） ─────────────────────┐
│                                                          │
│ ┌────────┬────────────────────────────┬────────┐         │
│ │        │ StudioRecipeBar (D3/D9)    │        │         │
│ │Studio  │ ┌─────┐ ┌─────┐ ┌─────┐    │Studio  │         │
│ │Sidebar │ │[img]│ │[img]│ │ + │  ⚙  │History │         │
│ │(Cards  │ │Alice│ │Water│ │Add│      │Panel   │         │
│ │管理)   │ └─────┘ └─────┘ └─────┘    │        │         │
│ │        ├────────────────────────────┤        │         │
│ │▸ 折疊 │                            │▸ 折疊  │         │
│ │        │      StudioCanvas          │        │         │
│ │        │                            │        │         │
│ │        │    StudioPromptArea        │        │         │
│ └────────┴────────────────────────────┴────────┘         │
└──────────────────────────────────────────────────────────┘
```

- **StudioShell（Wrap）**：封裝響應式、折疊狀態持久化（localStorage）、快捷鍵 `Cmd+\`
- **StudioSidebar（Reuse）**：保留現有 `CharacterCardManager` / `StyleCardManager` / `BackgroundCardManager`，職責明確為「管理視圖」
- **StudioRecipeBar（Build Custom）**：**核心差異化組件** — 3 個 `StudioRecipeSlot` + Advanced 按鈕
- **StudioCanvas（Reuse）**：現有組件不動
- **StudioPromptArea（Reuse）**：現有組件不動
- **HistoryPanel / StudioProjectHistory（Reuse）**：現有組件

### 4.2 Gallery（Editorial warm + 局部 Quiet gallery）

```
┌─ /gallery 頁面 ───────────────────────────────────┐
│                                                  │
│ ┌─ GalleryHeader（D6/D12）─────────────────────┐  │
│ │ Gallery                                 ⌘K   │  │
│ │ ● Newest    ● All types   ● All time    ⋯   │  │
│ │                                          ↑   │  │
│ │                          Advanced popover:  │  │
│ │                          - Model filter     │  │
│ │                          - Liked only       │  │
│ └──────────────────────────────────────────────┘  │
│                                                  │
│ ┌─ GalleryGrid（瀑布流 CSS Grid） ──────────────┐  │
│ │  [卡片] [卡片]  [卡片]                        │  │
│ │     [卡片]   [卡片]     [卡片]                │  │
│ │ [卡片]  [卡片]     [卡片]                     │  │
│ └──────────────────────────────────────────────┘  │
│                                                  │
│ → 點擊 → ImageDetailModal（基於 shadcn Dialog）   │
└──────────────────────────────────────────────────┘
```

- **GalleryHeader（Build Custom）**：3 pill toggle + cmdk search + Advanced popover 三件套
- **GalleryGrid（Reuse）**：現有瀑布流 + 無限滾動保留；Particles 背景按 D11 性能守護（`WP-Gallery-01`）
- **ImageCard / ImageDetailModal（Reuse）**：現有組件；Modal 樣式需對齊 D14 shadcn Dialog 基線

### 4.3 Profile（雙形態：/u 藝廊感 + /profile dashboard）

```
/u/[username] — ProfileShellPublic（Quiet gallery 氣質）
┌──────────────────────────────────┐
│                                  │
│          [avatar]                │
│          @username               │
│          "quiet bio"             │
│          [Follow]                │
│ ─────────────────────────────────│
│  ┌──┐   ┌────┐   ┌──┐            │
│  │作│   │作品│   │作│   ┌──┐     │
│  │品│   │    │   │品│   │作│     │
│  └──┘   └────┘   └──┘   └──┘     │
└──────────────────────────────────┘

/profile — ProfileShellPrivate（Editorial warm + dashboard）
┌──────────────────────────────────┐
│  My Works       [Edit Profile]   │
│  124 · 89 Public · 35 Private    │
│  ● All  ○ Public  ○ Private   ⋯  │
├──────────────────────────────────┤
│ ☑ ┌──┐  ☐ ┌──┐  ☑ ┌──┐           │
│   │作│    │作│    │作│           │
│   └──┘    └──┘    └──┘           │
├──────────────────────────────────┤
│ 2 selected · [Delete] [Toggle⇅] │ ← D13 選擇時觸發
└──────────────────────────────────┘
```

- **ProfileShellPublic（Build Custom）**：Avatar + bio + Follow + Quiet gallery 瀑布流（樣式與 Gallery 一致）
- **ProfileShellPrivate（Build Custom）**：統計段 + 多選 + 批量 sticky bottom bar
- **BulkActionBar（Build Custom）**：sticky + 動效 + 選中計數；D13 規則
- **ProfileEditModal（Reuse）**：現有組件，樣式對齊 D14 shadcn Dialog

---

## 5. 組件使用基線（四層架構）

### 5.1 Layer 1 · 外部基線（shadcn/ui 唯一）

所有通用交互組件從 shadcn 引入：

| 類別 | shadcn 組件                                             | 替代的其他庫（禁用）                       |
| ---- | ------------------------------------------------------- | ------------------------------------------ |
| 彈層 | Dialog / Sheet / Drawer / Popover / HoverCard / Tooltip | ❌ Headless UI Dialog、Radix 自封裝 Dialog |
| 選擇 | Combobox / Command (cmdk) / Select / Toggle Group       | ❌ react-select、Downshift                 |
| 表單 | Input / Textarea / Checkbox / Radio / Switch            | ❌ 自建表單元件                            |
| 結構 | Tabs / Card / Separator / Avatar / Badge                | —                                          |
| 反饋 | Toast (sonner) / Skeleton / Progress                    | ❌ react-toastify、react-hot-toast         |
| 布局 | Resizable（底層 react-resizable-panels）                | ❌ react-split-pane                        |

### 5.2 Layer 2 · 特例補充（僅限 shadcn 無法覆蓋）

| 組件               | 外部庫                                                                         | 使用場景                    |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------- |
| Drag-and-drop      | `@atlaskit/pragmatic-drag-and-drop`                                            | Studio 卡片拖拽（現有）     |
| Masonry 瀑布流     | **無外部庫**，CSS Grid `grid-template-columns: repeat(auto-fill, minmax(...))` | Gallery + `/u` 作品瀑布流   |
| Lightbox（放大圖） | **無外部庫**，基於 shadcn Dialog + 自定義動效                                  | ImageDetailModal 的放大交互 |

### 5.3 Layer 3 · 項目封裝層（`src/components/ui/`）

**規則**：所有 shadcn 組件**不直接 re-export**，必須經過項目封裝層：

```tsx
// src/components/ui/dialog.tsx（示意）
export { Dialog, DialogContent, DialogTitle, ... }
  from '@/components/ui/_shadcn/dialog'
// 注入 design-tokens（D11 CSS variables）
// 統一 radius / padding / 動效 / a11y 行為
```

> **註**：上述 `_shadcn/` 子目錄**為示意路徑**，落地時可按實際目錄結構調整 — 例如：
>
> - 直接用 `src/components/ui/shadcn/` 無底線
> - 或不分子目錄，僅以 `src/components/ui/primitives/` vs `src/components/ui/` 雙層區分
> - 或不分資料夾，僅用檔名約定（`dialog.primitive.tsx` vs `dialog.tsx`）
>
> **關鍵原則不變**：shadcn 原生產物不直接被業務代碼 import，必須經過一層項目封裝注入 token / variants。具體目錄由實作時決定並寫入 `UI-實作落地清單.md`。

**產出物**：一份 `docs/frontend/ui-components.md` 明確每個 UI 組件的使用邊界、props 規範、禁用場景。不上 Storybook（ROI 低）。

### 5.4 Layer 4 · 核心自定義組件（僅限產品差異化）

**只有這 6 個系統值得 Build Custom（共 8 個組件檔案）**：

| 系統                   | 組件檔案              | 職責                                                         | 引入階段   |
| ---------------------- | --------------------- | ------------------------------------------------------------ | ---------- |
| **Studio Recipe 系統** | `StudioRecipeBar`     | 3-slot 組合容器 + Advanced 入口                              | Phase 1    |
|                        | `StudioRecipeSlot`    | 單個卡片槽視覺（縮略圖 + 名稱 + 未選態 + adapter 格式 icon） | Phase 1    |
| **Gallery Header**     | `GalleryHeader`       | 3 pill + cmdk search + Advanced popover 複合殼               | Phase 2    |
| **Profile Shell 系統** | `ProfileShellPublic`  | /u 的 Avatar + bio + 瀑布流封裝                              | Phase 3    |
|                        | `ProfileShellPrivate` | /profile 的統計 + 多選 + 批量封裝                            | Phase 3    |
| **BulkActionBar**      | `BulkActionBar`       | sticky 批量操作 bar（動效 + 計數 + 按鈕組）                  | Phase 3    |
| **CardDrawer**         | `CardDrawer`          | Phase 2 末引入：nav 級 Sheet + cmdk + 3 Tab                  | Phase 2 末 |
| **Lightbox**           | `Lightbox`            | 基於 shadcn Dialog + 自定義放大動效                          | 按需       |

**不得**將下列視為自定義（用 shadcn 即可）：

- 通用 Modal / Drawer / Popover / Tooltip
- 通用 Button / Input / Select
- 通用 Toast / Skeleton

---

## 6. EP × UI 影響矩陣

| EP                                | UI 決策觸及                           | Build Custom 組件                                        | 主要 Wrap 改造                                            |
| --------------------------------- | ------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| **EP-1** 風格一致性核心鏈路       | D3 / D9                               | StudioRecipeBar · StudioRecipeSlot                       | —                                                         |
| **EP-2** LLM 輸出品質穩定化       | D1（Editorial warm 對輸出文本的約束） | —                                                        | prompt-assistant 面板樣式對齊                             |
| **EP-3** 生成管線韌性基座         | 幾乎不觸及 UI                         | —                                                        | Toast 統一（sonner wrap）                                 |
| **EP-4** 計費原子性 / FreeTier    | D13（錯誤 Toast 規則）                | —                                                        | Toast helper 統一封裝                                     |
| **EP-5** Gallery 展示互動閉環     | D6 / D12 / D14                        | GalleryHeader · Lightbox                                 | `components/ui/` 審計、ImageCard / Modal 對齊 shadcn 基線 |
| **EP-6** Studio 核心體驗打磨      | D2 / D10                              | StudioShell                                              | 響應式 + 快捷鍵 + 折疊狀態持久化                          |
| **EP-7** Profile 可見性與隱私閉環 | D7 / D13                              | ProfileShellPublic · ProfileShellPrivate · BulkActionBar | ProfileFeed 拆成兩個 Shell                                |

---

## 7. 階段 UI 實作節奏（對齊 `WBS-中長期演進計劃.md`）

### Phase 1（0-3 週）· UI 側

**主題**：token 奠基 + RecipeBar 原型

- **token 層初始化**（D1 / D11）
  - `globals.css` 定義 CSS variables（`--color-bg`、`--color-text-*`、`--color-accent` 等）
  - 移除硬編碼顏色（grep 檢查 `#faf9f5`、`#141413` 等）
  - Tailwind config 接入 CSS variables（`bg-[var(--color-bg)]` 或 theme extend）
- **EP-3 配套**：Toast / 錯誤提示統一到 shadcn sonner 封裝（配合 `WP-Global-03` 的 toast 規範工作，**但本 EP 不做 toast 全域改造**，只做最小必要）
- **EP-1 配套**：建立 StudioRecipeBar 最小原型
  - 3 個 StudioRecipeSlot 基礎樣式
  - 使用 shadcn Combobox 做每個 Slot 的選擇器
  - 使用 shadcn HoverCard 做 hover 預覽
  - **測試**：`recipe-compiler.service.test.ts`（EP-1 核心）與 UI 解耦，不強依賴 UI 完成
- **不動**：Gallery / Profile UI、Studio 響應式、CardDrawer

**Phase 1 末 UI 產出**：

- `src/lib/design-tokens.ts`（單一來源）
- `src/components/business/studio/StudioRecipeBar.tsx` + `StudioRecipeSlot.tsx`
- `src/components/ui/*.tsx` 審計清單（只記錄，不重構）

### Phase 2（4-8 週）· UI 側

**主題**：Gallery 重構 + CardDrawer 引入

- **EP-2 配套**：prompt-assistant 面板樣式對齊 Editorial warm（輕度）
- **EP-5 配套**：
  - 重構 `GalleryFilterBar` → `GalleryHeader`（3 pill + cmdk + Advanced popover）
  - GalleryGrid 接入 Particles 性能守護（`WP-Gallery-01`）
  - ImageDetailModal 樣式對齊 shadcn Dialog 基線
  - `src/components/ui/` 完整審計 + 替換任何非 shadcn 組件
- **Phase 2 末**：**D8 觸發點 — 推出 CardDrawer**
  - nav 上方加「⌘K My Cards」入口
  - 基於 shadcn Sheet + Command（cmdk）+ 3 Tab
  - 復用現有 CharacterCardManager 等管理組件

**Phase 2 末 UI 產出**：

- GalleryHeader 完成、components/ui/ 對齊 shadcn
- CardDrawer 上線
- 設計 token 已被所有 UI 組件消費（grep 驗證）

### Phase 3（9-12 週）· UI 側

**主題**：Studio 響應式 + Profile 雙形態

- **EP-6 配套**：
  - StudioShell 承擔 D10 響應式邏輯（≥1024 / <1024 / <768）
  - 折疊狀態持久化（localStorage）
  - 快捷鍵 `Cmd+\` 切換
  - 移動端 RecipeBar stack 垂直
- **EP-7 配套**：
  - ProfileFeed 拆分 → `ProfileShellPublic` + `ProfileShellPrivate`
  - BulkActionBar 引入（D13 選擇時觸發）
  - `/u/[username]` 視覺對齊 Gallery 瀑布流

**Phase 3 末 UI 產出**：

- Studio 在三個 viewport 下無 overflow
- `/profile` 和 `/u/[username]` 視覺明確區分
- 項目所有 UI 組件從 `src/components/ui/` 單一來源消費

### Optional Phase 4 · UI 延後項

| 項目                                       | 觸發條件                        |
| ------------------------------------------ | ------------------------------- |
| Dark mode token set + ThemeProvider        | 用戶明確反饋 or 運營需要        |
| Lightbox 升級（縮放 / 鍵盤導航 / 手勢）    | `WP-Gallery-02` 完成後用戶反饋  |
| 獨立 `/cards` 頁面（D8 最終階段）          | 平均用戶 Card 數 > N 或運營需求 |
| 視頻 Gallery 互動（hover play / pip 模式） | 視頻整線批次啟動時              |
| SEO 批次 UI（JSON-LD / OG 完善）           | 產品進入公開推廣期              |

---

## 8. 未解問題（延後於未來訪談）

這些問題**刻意未在本輪訪談定死**，留給後續產品/設計節奏決定：

| #   | 問題                                                                       | 建議時機                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------- |
| F1  | StudioRecipeBar 的 hover 預覽內容（示例圖 grid / 卡片詳情 / 歷史使用記錄） | Phase 1 EP-1 實作中                   |
| F2  | Lightbox 動效細節（縮放曲線、黑幕透明度、鍵盤 ←→ 切換）                    | Phase 2 EP-5 實作中                   |
| F3  | 首頁（`/`）的具體版面（Hero 的標語、模型卡片、Workflow 展示的節奏）        | Phase 3 後期單獨訪談                  |
| F4  | 404 / error.tsx / loading.tsx 的視覺語言（已有骨架，氣質未統一）           | Optional Phase 4 「全域基礎體驗批次」 |
| F5  | 三語文案在 Editorial warm 下的微排版差異（ja/zh 行距 / 字重）              | 各 EP 實作時按需調整                  |

---

## 9. 本文件邊界重申

- 本文件**不是**設計稿 — 沒有 mockup、沒有 pixel-perfect、沒有 Figma 鏈接
- 本文件**不是** roadmap — 沒有排日曆日期、沒有綁發布窗口
- 本文件**是**「UI 方向的決策錨點」 — 告訴未來任何實作者「為什麼這樣做、什麼能做、什麼不能做」
- 本文件**是** `WBS-中長期演進計劃.md` 的補充 — EP-1~EP-7 的 UI 側落地規則都在這裡
- 本文件**應**在以下時機被更新：
  - 某個未解問題（§8）被確認
  - 某個 Rejected（§2）被重新提起並翻案（需新訪談）
  - 某個新的產品方向出現需補充新決策
- 本文件**不應**被擴寫成設計系統完整規範 — 那是另一份文檔（未來可用 `docs/frontend/design-system.md` 承接）

---

## 10. 文件關聯索引

```
WBS-現狀總結.md                    ← Target State
WBS-開發計劃-3週.md                 ← P0 排期
WBS-執行包合併.md                  ← 7 個 EP
WBS-中長期演進計劃.md              ← Phase 1/2/3/4 分階段
UI-路線決策結論書.md（本文件）       ← UI 側執行補充

01-UI/03-工作包細分.md             ← UI 實作 WP
02-功能/03-工作包細分.md           ← 功能實作 WP（對 UI 影響見 §6）
03-功能測試/03-工作包細分.md       ← 功能測試對齊
04-UI測試/03-工作包細分.md         ← UI 測試對齊
```
