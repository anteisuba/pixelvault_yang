# UI 實作落地清單

> 本文件是 `UI-路線決策結論書.md` 的**工程化補充** — 不重述決策理由，只回答實作問題：
> **先做哪些組件 / 落在哪些文件 / 哪些直接用 shadcn / 哪些要包一層 / 哪些是自定義核心組件**
>
> 所有規則**以 `UI-路線決策結論書.md` 為準**，本清單僅執行落地。如需變更，先改結論書。

---

## 0. 目錄約定（實作者決定，本文件採用以下版本）

```
src/
├── components/
│   ├── ui/                      ← Layer 3 項目封裝層（消費 design-tokens）
│   │   ├── button.tsx             （包裝 shadcn）
│   │   ├── dialog.tsx             （包裝 shadcn）
│   │   ├── ...
│   │   └── primitives/          ← shadcn 原生產物落地處
│   │       ├── dialog.tsx          ← `npx shadcn@latest add dialog` 產物
│   │       └── ...
│   │
│   ├── business/               ← Layer 4 產品核心自定義組件
│   │   ├── studio/
│   │   ├── gallery/
│   │   ├── profile/
│   │   └── (現有組件按域分組)
│   │
│   └── layout/                 ← 現有 Navbar / MobileTabBar / LocaleSwitcher
│
├── lib/
│   ├── design-tokens.ts        ← 單一 token 來源（讀 CSS variables）
│   └── toast.ts                ← 統一 toast helper
│
└── app/
    └── globals.css             ← CSS variables 定義（:root + 預留 .dark）
```

> 以上目錄是**本清單採用的版本**。若團隊最終選擇不同結構（如 shadcn 放 `ui/shadcn/` 無底線、或不分子目錄），修改本清單頂部即可，下面所有路徑引用保持一致相對關係。

---

## 1. Phase 1（0-3 週）· 奠基 + RecipeBar

### 1.1 新建：Design Token 基礎

| 文件                       | 類型     | 做什麼                                                                                                                                                                             |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/globals.css`      | 修改     | `:root` 定義 CSS variables：`--color-bg` `--color-text-primary` `--color-text-secondary` `--color-accent` `--color-surface` `--color-border`；預留空 `.dark {}` 塊（Phase 4 填入） |
| `src/lib/design-tokens.ts` | **新建** | TypeScript 單一導出，映射 CSS variables 為可導入 const；所有業務代碼禁止直接寫 `#faf9f5` 等                                                                                        |
| `tailwind.config.ts`       | 修改     | `theme.extend.colors` 接入 CSS variables（`bg: 'var(--color-bg)'` 等）；刪除任何硬編碼 hex                                                                                         |

**驗收**：`grep -rn "#faf9f5\|#141413\|#d97757" src/` 應返回 0（除 `globals.css` 與 token 定義本身）。

### 1.2 引入 shadcn 組件（Use External）

執行命令 + 落地路徑：

| 命令                               | 落地文件                                      | 用途                         |
| ---------------------------------- | --------------------------------------------- | ---------------------------- |
| `npx shadcn@latest add combobox`   | `src/components/ui/primitives/combobox.tsx`   | Recipe Slot 內部選卡         |
| `npx shadcn@latest add popover`    | `src/components/ui/primitives/popover.tsx`    | Recipe Advanced 入口         |
| `npx shadcn@latest add hover-card` | `src/components/ui/primitives/hover-card.tsx` | Slot hover 預覽卡片          |
| `npx shadcn@latest add avatar`     | `src/components/ui/primitives/avatar.tsx`     | Slot 內縮略圖                |
| `npx shadcn@latest add badge`      | `src/components/ui/primitives/badge.tsx`      | adapter 格式小標記           |
| `npx shadcn@latest add sonner`     | `src/components/ui/primitives/sonner.tsx`     | Toast 統一（配合 EP-3/EP-4） |

> 若項目已有部分組件，審計是否為 shadcn 規範；不是則替換。

### 1.3 項目封裝層（Wrap Internally）

| 新建文件                           | 職責                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/combobox.tsx`   | 從 `primitives/combobox` re-export + 注入 design-tokens；統一 className                                                       |
| `src/components/ui/popover.tsx`    | 同上                                                                                                                          |
| `src/components/ui/hover-card.tsx` | 同上                                                                                                                          |
| `src/components/ui/avatar.tsx`     | 同上                                                                                                                          |
| `src/components/ui/badge.tsx`      | 同上                                                                                                                          |
| `src/lib/toast.ts`                 | 統一 `toastSuccess / toastError / toastLoading / toastPromise`，強制 i18n key 或已翻譯字串（最小版，全域替換留 WP-Global-03） |

**業務代碼禁止**從 `primitives/` 直接 import，只能從 `src/components/ui/*.tsx` 導入。

### 1.4 新建：產品核心自定義（Build Custom）

| 新建文件                                              | 職責                                                                        | 依賴                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/components/business/studio/StudioRecipeBar.tsx`  | 3-slot 組合容器 + Advanced 按鈕；讀 `use-card-manager` + `use-studio-form`  | StudioRecipeSlot、ui/popover、現有 `use-card-manager` |
| `src/components/business/studio/StudioRecipeSlot.tsx` | 單個卡片槽殼：縮略圖 + 名稱 + 未選 `+ Add` + adapter 格式 icon + hover 預覽 | ui/combobox、ui/hover-card、ui/avatar、ui/badge       |

### 1.5 現有組件不動

Phase 1 **不動**以下（避免與 EP-1 測試交叉影響）：

- `GalleryFeed` / `GalleryFilterBar` / `GalleryGrid`
- `ProfileFeed` / `ProfileHeader`
- `StudioSidebar` / `StudioCanvas` / `StudioPromptArea`（只是 Studio 頁面**頂部**加掛 StudioRecipeBar，其他組件保留）

### 1.6 Phase 1 完成檢查

- [ ] `grep` 檢查無硬編碼顏色
- [ ] 6 個 shadcn 組件在 `primitives/` + 6 個封裝層在 `ui/` 下
- [ ] `StudioRecipeBar` + `StudioRecipeSlot` 上線並掛在 `/studio`
- [ ] `toast.ts` helper 可用（至少 EP-3/EP-4 的錯誤路徑已接入）

---

## 2. Phase 2（4-8 週）· Gallery 重構 + CardDrawer

### 2.1 引入 shadcn 組件

| 命令                                 | 落地文件                         | 用途                               |
| ------------------------------------ | -------------------------------- | ---------------------------------- |
| `npx shadcn@latest add toggle-group` | `ui/primitives/toggle-group.tsx` | Gallery pill 篩選                  |
| `npx shadcn@latest add command`      | `ui/primitives/command.tsx`      | cmdk 搜索 + CardDrawer 內部        |
| `npx shadcn@latest add sheet`        | `ui/primitives/sheet.tsx`        | CardDrawer 容器                    |
| `npx shadcn@latest add tabs`         | `ui/primitives/tabs.tsx`         | CardDrawer 3 類分頁 / Profile 分頁 |
| `npx shadcn@latest add dialog`       | `ui/primitives/dialog.tsx`       | ImageDetailModal + Lightbox 底座   |
| `npx shadcn@latest add skeleton`     | `ui/primitives/skeleton.tsx`     | loading 態                         |
| `npx shadcn@latest add tooltip`      | `ui/primitives/tooltip.tsx`      | 按鈕提示                           |

### 2.2 項目封裝層

| 新建文件                             | 職責                                                |
| ------------------------------------ | --------------------------------------------------- |
| `src/components/ui/toggle-group.tsx` | 封裝 + 統一 pill 樣式（active 用 `--color-accent`） |
| `src/components/ui/command.tsx`      | 封裝 + 注入 i18n 快捷命令（若需）                   |
| `src/components/ui/sheet.tsx`        | 封裝 + 統一抽屜寬度與動效時長                       |
| `src/components/ui/tabs.tsx`         | 封裝                                                |
| `src/components/ui/dialog.tsx`       | 封裝 + 統一 radius / padding                        |
| `src/components/ui/skeleton.tsx`     | 封裝 + 統一骨架色                                   |
| `src/components/ui/tooltip.tsx`      | 封裝                                                |

### 2.3 新建：產品核心自定義

| 新建文件                                                     | 職責                                                                               | 依賴                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/components/business/gallery/GalleryHeader.tsx`          | 3 pill toggle（sort / type / timeRange）+ cmdk search + Advanced popover 入口      | ui/toggle-group、ui/command、ui/popover                       |
| `src/components/business/gallery/GalleryAdvancedFilters.tsx` | Popover 內容：model select + liked checkbox + Reset                                | ui/popover、ui/checkbox（待引入）、ui/combobox                |
| `src/components/business/gallery/Lightbox.tsx`               | 圖片放大殼：基於 ui/dialog + 自定義縮放/黑幕動效                                   | ui/dialog                                                     |
| `src/components/business/CardDrawer.tsx`                     | nav 級 Sheet + cmdk + 3 Tab（Characters/Styles/Backgrounds）；復用現有卡片管理組件 | ui/sheet、ui/command、ui/tabs、現有 `CharacterCardManager` 等 |

### 2.4 重構現有組件

| 現有文件                                       | 動作                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/components/business/GalleryFilterBar.tsx` | **拆分** → 頂部邏輯進 `GalleryHeader`，高級篩選進 `GalleryAdvancedFilters`；原文件刪除或作為過渡 re-export |
| `src/components/business/ImageDetailModal.tsx` | **樣式對齊** shadcn Dialog 基線（從封裝層 `ui/dialog` 讀）                                                 |
| `src/components/business/GalleryFeed.tsx`      | 頂部替換為新 `GalleryHeader`；中間 `GalleryGrid` 保留不動                                                  |
| `src/components/ui/particles.tsx`              | 補 `prefers-reduced-motion` + CPU 探測降級（配合 `WP-Gallery-01`）                                         |

### 2.5 新增 nav 入口（Phase 2 末）

| 文件                                     | 修改                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| `src/components/layout/Navbar.tsx`       | 右側加「⌘K My Cards」觸發 `CardDrawer`                 |
| `src/components/layout/MobileTabBar.tsx` | 手機版不加此入口（避免擁擠），Phase 3 再決定是否進 tab |

### 2.6 `src/components/ui/` 完整審計

- [ ] 列出所有 `ui/` 下現有文件
- [ ] 每個標註：shadcn 規範 ✓ / 需重構 ✗ / 歷史遺留 ⚠
- [ ] ✗ 標記的文件在 Phase 2 末替換完畢
- [ ] 業務代碼 `grep -rn "from 'sonner'" src/components/business/ src/app/` 返回 0（全部走 `lib/toast.ts`）

### 2.7 Phase 2 完成檢查

- [ ] `GalleryHeader` + `GalleryAdvancedFilters` 替代 `GalleryFilterBar`
- [ ] `ImageDetailModal` 使用 `ui/dialog` 基線
- [ ] `Lightbox` 可用於 Gallery 詳情放大
- [ ] `CardDrawer` 從 Navbar 可打開，內部 3 Tab 可切換
- [ ] `Particles` 性能降級守護生效（`prefers-reduced-motion` 測試通過）

---

## 3. Phase 3（9-12 週）· Studio 響應式 + Profile 雙形態

### 3.1 引入 shadcn 組件

| 命令                              | 落地文件                      | 用途                                               |
| --------------------------------- | ----------------------------- | -------------------------------------------------- |
| `npx shadcn@latest add resizable` | `ui/primitives/resizable.tsx` | Studio 三欄可折疊（底層 `react-resizable-panels`） |
| `npx shadcn@latest add checkbox`  | `ui/primitives/checkbox.tsx`  | ProfileFeed 多選                                   |
| `npx shadcn@latest add separator` | `ui/primitives/separator.tsx` | Profile 統計條分隔                                 |
| `npx shadcn@latest add card`      | `ui/primitives/card.tsx`      | 統計卡片                                           |

### 3.2 項目封裝層

| 新建文件                          | 職責                                       |
| --------------------------------- | ------------------------------------------ |
| `src/components/ui/resizable.tsx` | 封裝                                       |
| `src/components/ui/checkbox.tsx`  | 封裝 + 統一 checked 色（`--color-accent`） |
| `src/components/ui/separator.tsx` | 封裝                                       |
| `src/components/ui/card.tsx`      | 封裝                                       |

### 3.3 新建：產品核心自定義

| 新建文件                                                  | 職責                                                                                                                       | 依賴                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/components/business/studio/StudioShell.tsx`          | 響應式三欄容器：`≥1024` 三欄 / `<1024` 側欄折疊為 icon / `<768` 側欄變 Sheet；折疊狀態 localStorage 持久化；快捷鍵 `Cmd+\` | ui/resizable、ui/sheet、`use-mobile` hook                           |
| `src/components/business/profile/ProfileShellPublic.tsx`  | `/u/[username]` 用：Avatar + bio + Follow + Quiet gallery 瀑布流（樣式與 Gallery 一致）                                    | ui/avatar、現有 `use-creator-profile`、現有瀑布流組件               |
| `src/components/business/profile/ProfileShellPrivate.tsx` | `/profile` 用：統計段 + 篩選 + 多選 + `BulkActionBar`                                                                      | ui/checkbox、ui/tabs、ui/card、BulkActionBar、現有 `use-my-profile` |
| `src/components/business/profile/BulkActionBar.tsx`       | sticky bottom：fade + translateY 150-200ms；接收 `selectedCount` + 動作按鈕；0 選中隱藏                                    | ui/button（現有）                                                   |

### 3.4 重構現有組件與頁面

| 現有文件                                            | 動作                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/app/[locale]/(main)/studio/page.tsx`           | 用 `StudioShell` 包裝原有三欄；刪除直接寫死的 layout 代碼                                   |
| `src/components/business/StudioResizableLayout.tsx` | 若存在，邏輯遷入 `StudioShell`；原文件刪除或降級為內部工具                                  |
| `src/components/business/ProfileFeed.tsx`           | **拆分**：對外邏輯保留為 hook，但 UI 分別遷入 `ProfileShellPublic` / `ProfileShellPrivate`  |
| `src/app/[locale]/(main)/profile/page.tsx`          | 用 `ProfileShellPrivate` 包裝                                                               |
| `src/app/[locale]/(main)/u/[username]/page.tsx`     | 用 `ProfileShellPublic` 包裝（保留 `CreatorProfileView` / `PrivateProfileView` 的分支邏輯） |

### 3.5 Phase 3 完成檢查

- [ ] Studio 在 1440 / 1024 / 768 / 375 四個 viewport 下無 overflow、無閃爍
- [ ] Studio 折疊狀態刷新後保留
- [ ] `Cmd+\` 切換折疊，IME 組字中不誤觸
- [ ] `/profile` 和 `/u/[username]` 視覺明確區分
- [ ] `BulkActionBar` 在 0 選中時不顯示，選中後 150-200ms 淡入
- [ ] `src/components/ui/` 下所有組件均為 shadcn 封裝層（完整審計通過）

---

## 4. Optional Phase 4（未來）

> 本清單**不列具體路徑** — 觸發時再補落地細節。

| 項目                                         | 觸發條件             |
| -------------------------------------------- | -------------------- |
| Dark mode ThemeProvider + `.dark` token 填充 | 用戶反饋或運營需要   |
| Lightbox 升級（縮放手勢 / 鍵盤 ←→）          | EP-5 完成後用戶反饋  |
| 獨立 `/cards` 頁面（D8 最終階段）            | 平均用戶 Card 數 > N |
| 視頻 Gallery 互動（hover play / pip）        | 視頻整線批次啟動時   |
| `not-found.tsx` / 全頁 `loading.tsx` 補齊    | 全域基礎體驗批次     |
| SEO 批次 UI（JSON-LD / OG）                  | 公開推廣期           |

---

## 5. 三層分工速查表

| 需求                | 直接用 shadcn       | 包一層 `ui/`                     | 自定義核心                                         |
| ------------------- | ------------------- | -------------------------------- | -------------------------------------------------- |
| 確認對話框          | Dialog              | `ui/dialog.tsx`                  | ❌                                                 |
| 抽屜面板            | Sheet               | `ui/sheet.tsx`                   | ❌                                                 |
| 氣泡提示            | Popover / Tooltip   | `ui/popover.tsx`                 | ❌                                                 |
| 選擇器              | Combobox / Select   | `ui/combobox.tsx`                | ❌                                                 |
| 命令面板            | Command (cmdk)      | `ui/command.tsx`                 | ❌                                                 |
| Toast               | Sonner              | `ui/sonner.tsx` + `lib/toast.ts` | ❌                                                 |
| 分頁                | Tabs                | `ui/tabs.tsx`                    | ❌                                                 |
| 頭像                | Avatar              | `ui/avatar.tsx`                  | ❌                                                 |
| 多選框              | Checkbox            | `ui/checkbox.tsx`                | ❌                                                 |
| Toggle pill         | Toggle Group        | `ui/toggle-group.tsx`            | ❌                                                 |
| 骨架屏              | Skeleton            | `ui/skeleton.tsx`                | ❌                                                 |
| 可縮放面板          | Resizable           | `ui/resizable.tsx`               | ❌                                                 |
| Recipe 卡片組合     | ❌                  | ❌                               | **`StudioRecipeBar` + `StudioRecipeSlot`**         |
| Gallery 篩選 + 搜索 | 多個 shadcn 組合    | ❌                               | **`GalleryHeader`**                                |
| 圖片放大            | Dialog（基座）      | ❌                               | **`Lightbox`**（殼）                               |
| Profile /u 頁       | 多個 shadcn 組合    | ❌                               | **`ProfileShellPublic`**                           |
| Profile /profile 頁 | 多個 shadcn 組合    | ❌                               | **`ProfileShellPrivate`**                          |
| 批量操作 bar        | Button              | ❌                               | **`BulkActionBar`**                                |
| nav 卡片抽屜        | Sheet + cmdk + Tabs | ❌                               | **`CardDrawer`**                                   |
| Studio 三欄響應式   | Resizable + Sheet   | ❌                               | **`StudioShell`**                                  |
| 拖拽                | ❌                  | ❌                               | 用 `@atlaskit/pragmatic-drag-and-drop`（特例外部） |
| 瀑布流              | ❌                  | ❌                               | CSS Grid（無外部庫）                               |

---

## 6. 禁止事項（Anti-pattern）

- ❌ 業務代碼（`components/business/` / `app/`）直接 `import { Dialog } from "@/components/ui/primitives/dialog"` — **必須**從 `@/components/ui/dialog` 導入
- ❌ 業務代碼直接 `import ... from "sonner"` — **必須**從 `@/lib/toast` 導入 helper
- ❌ 業務代碼寫死顏色 `bg-[#faf9f5]` / `text-[#141413]` / `text-[#d97757]` — **必須**用 `bg-[var(--color-bg)]` 或語義 class
- ❌ 為通用交互（Dialog/Popover/Sheet/Combobox/Tabs...）自建組件 — 即使看起來更簡單
- ❌ 在一個頁面用 shadcn Dialog，另一個頁面用 Radix primitives 直接封裝 — **只能有一套基線**
- ❌ Phase 1-3 引入 Dark mode 組件（`next-themes`、`.dark` 樣式等）— **延到 Phase 4**

---

## 7. 本文件維護規則

- 本清單是**執行級補充**，不包含決策論證
- 所有規則源頭在 `UI-路線決策結論書.md`
- 如需新增組件類別、改變分層、翻案禁止事項 → 先修結論書，再同步本清單
- 每個 Phase 完成時：勾選「完成檢查」清單；未勾完不進入下一 Phase
- 目錄約定（§0）若變更：只改本文件頂部；下面的相對路徑引用保持一致
