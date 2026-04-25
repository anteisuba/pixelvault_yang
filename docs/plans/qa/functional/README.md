# 03 · 功能測試（按服務 / API / 核心流程拆）

> 範疇：後端與業務邏輯的正確性驗證。不含 UI 交互測試。
>
> 狀態說明：本目錄聚焦 backend / service / route 正確性；倉庫中已存在的 component / hook / context 測試不作為本目錄的主體規劃，相關 UI 向測試盤點以 `04-UI測試` 為主。

## L2 拆解

### 3.1 Service 層單測

- 3.1.1 生成類服務（image / video / audio）
- 3.1.2 Card 類服務（character / background / style / recipe）
- 3.1.3 社群類服務（follow / like / collection）
- 3.1.4 Arena 服務
- 3.1.5 Prompt / LLM 類服務
- 3.1.6 Model 治理服務
- 3.1.7 Usage / User / ApiKey 服務
- 3.1.8 Storage / R2 適配層

### 3.2 API Route 測試（auth → validate → delegate）

- 3.2.1 生成類 API（`/api/generate*`）
- 3.2.2 資產類 API（`/api/images`、`/api/generations`、`/api/collections`）
- 3.2.3 Card 類 API
- 3.2.4 Arena / Follows / Likes API
- 3.2.5 Storyboard / Projects / Stories API
- 3.2.6 Admin / Health / Usage API
- 3.2.7 Webhook 接收端

### 3.3 核心 E2E 流程

- 3.3.1 新用戶首次生成（註冊 → Free Tier / BYOK 路由 → 產出 → 歸檔）
- 3.3.2 Studio 多步編排（T2I → Edit → 儲存）
- 3.3.3 Character Card 創建 → 使用 → 精修
- 3.3.4 Arena 對戰 → 投票 → 排行更新
- 3.3.5 Storyboard 從 Project 到輸出
- 3.3.6 Follow / Like / Collection 社交迴路

### 3.4 韌性 / 邊界測試

- 3.4.1 Retry / Circuit Breaker 行為
- 3.4.2 Prompt Guard 攔截
- 3.4.3 LLM Output Validator 失敗路徑
- 3.4.4 Provider 超時 / 降級
- 3.4.5 Free Tier 上限 / requestCount 並發

### 3.5 合約 & Schema 測試

- 3.5.1 Zod Schema 有效 / 無效輸入
- 3.5.2 Prisma 模型遷移兼容性
- 3.5.3 i18n 三語 key 一致性

---

**下一步**：L3 將針對每個子項列出具體測試案例與覆蓋矩陣。
