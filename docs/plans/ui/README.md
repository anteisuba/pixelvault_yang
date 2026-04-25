# 01 · UI（按頁面拆）

> 範疇：所有使用者可見的頁面與全域 UI 結構。不包含功能邏輯，不包含測試。

## L2 拆解

### 1.1 公開頁

- 1.1.1 首頁 / Landing（`/`）
- 1.1.2 登入頁（`/sign-in`）
- 1.1.3 註冊頁（`/sign-up`）

### 1.2 創作區

- 1.2.1 Studio 主工作台（`/studio`）
- ~~1.2.2 Studio 草稿頁（`/studio/draft`）~~ — 2026-04-25 已下線（WP-Studio-01 ✅）

### 1.3 作品與展示

- 1.3.1 Gallery 列表頁（`/gallery`)
- 1.3.2 Gallery 詳情頁（`/gallery/[id]`）

### 1.4 競技場

- 1.4.1 Arena 主頁 / 對戰（`/arena`）
- 1.4.2 Arena 歷史記錄（`/arena/history`）
- 1.4.3 Arena 排行榜（`/arena/leaderboard`）

### 1.5 用戶空間

- 1.5.1 我的 Profile（`/profile`）
- 1.5.2 他人主頁（`/u/[username]`）

### 1.6 Storyboard

- 1.6.1 Storyboard 列表（`/storyboard`）
- 1.6.2 Storyboard 詳情（`/storyboard/[id]`）

### 1.7 全域 UI

- 1.7.1 Navbar / MobileTabBar
- 1.7.2 錯誤頁 / Loading / 空態
- 1.7.3 Modal / Toast / 通用交互組件

---

**下一步**：L3 將針對每個頁面拆區塊（Section / Panel / Card）。
