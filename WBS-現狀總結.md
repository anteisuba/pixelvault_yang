# WBS 第二輪 · 現狀總結表

> 基準日期：2026-04-15 · 對照文件：`01-UI/02-現狀映射.md`、`02-功能/02-現狀映射.md`、`03-功能測試/02-現狀映射.md`、`04-UI測試/02-現狀映射.md`

---

## A. 可直接進入下一輪規劃（代碼底已齊，只缺 L3 拆分 + 計劃）

> 條件：頁面已完整 / service 與 route 都已存在且互通 / 有基礎測試錨點

| 線       | 項                   | 為何可直接推進                                                   |
| -------- | -------------------- | ---------------------------------------------------------------- |
| UI       | 1.1 公開頁           | 首頁完整、Auth 兩頁完整，僅缺 metadata 與 section 級拆分         |
| UI       | 1.2 創作區 `/studio` | 主頁完整，有 `use-unified-generate` 測試錨點                     |
| UI       | 1.3 作品與展示       | 最完整的頁面組，loading/error 都齊                               |
| UI       | 1.5 用戶空間         | RSC 完整、隱私分支已實作                                         |
| UI       | 1.7 全域 UI          | Navbar/MobileTabBar/LocaleSwitcher 都存在，LocaleSwitcher 有測試 |
| 功能     | 2.1 身份與帳戶       | Clerk webhook + 3 service + api-keys route test 就緒             |
| 功能     | 2.2 圖像生成         | 8 provider、6 service、多個 route test 就緒                      |
| 功能     | 2.3 視頻生成         | validation service 有測試，雙 provider 就緒                      |
| 功能     | 2.4 音頻生成         | generate-audio 有測試                                            |
| 功能     | 2.7 社群互動         | 3 個 service + route 齊，最適合作為補測起點                      |
| 功能     | 2.8 Arena 競技       | **route 測試最完整**（6 個），service 層拆補即可                 |
| 功能     | 2.9 Prompt & LLM     | enhance route 有測試 + prompt-guard 有 lib 測試                  |
| 功能     | 2.10 模型治理        | provider-capabilities 有 test + circuit-breaker 有 test          |
| 功能     | 2.13 存儲與資產      | R2 wrapper 被 9+ service 依賴，已穩定運行                        |
| 功能     | 2.14 基礎設施        | 5 個 lib test + factory test，最穩健                             |
| 功能測試 | 3.2 API Route        | 29% 底子上按能力域擴展                                           |
| 功能測試 | 3.4 韌性 / 邊界      | breaker + guard 已有測試，擴 retry/validator                     |
| UI測試   | 4.3 響應式           | mobile profile 已有，擴 tablet/desktop                           |
| UI測試   | 4.4 i18n             | completeness + routing 已 green，補文案溢出即可                  |

---

## B. 需要先補代碼基礎（現狀骨架 / 半成品 / 無測試錨點，推動前要補）

> 條件：頁面是骨架或半成品 / service 有但無測試且邏輯複雜 / 測試維度底子太薄

| 線       | 項                    | 需要先補的基礎                                                                                      |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| UI       | 1.4 競技場 `/arena/*` | `/arena/history` 與 `/arena/leaderboard` 是純 Client 骨架，需先補 metadata/error/loading 與組件封裝 |
| UI       | 1.6 Storyboard        | 列表頁為骨架（內聯表單耦合）、詳情頁為半成品；需先重構 CreateForm / Renderer 切換邏輯               |
| 功能     | 2.5 Character Card    | 8 個 service 皆無測試，LLM 輸出驗證不完整 — 需先建結構化輸出 golden set                             |
| 功能     | 2.6 Storyboard/敘事   | service 無測試，4 種敘事音調無量化驗證 — 需先補 service 單測                                        |
| 功能     | 2.11 LoRA 訓練        | 無任何測試，`.tar→.safetensors` 提取無容錯 — 需先補失敗路徑                                         |
| 功能     | 2.12 計費與用量       | 扣費並發競爭未驗證 — 需先補 Prisma transaction 測試                                                 |
| 功能測試 | 3.1 Service 單測      | **僅 3/33 覆蓋（9%）**，整個維度底子太薄，要先按能力域建立模板                                      |
| 功能測試 | 3.3 核心 E2E          | 5 個 Playwright spec 底子，需先建 Clerk test key + 獨立 DB + provider mock server                   |
| 功能測試 | 3.5 合約 & Schema     | Zod schema 入口大部分無測 · Prisma migration 無相容性守護                                           |
| UI測試   | 4.1 頁面狀態          | 14 頁中僅 3 頁有 error、1 頁有 loading；需先補文件再補測試                                          |
| UI測試   | 4.2 用戶交互          | hook 測試 1/44、component 測試 1/60+，底子過薄；需先確立測試模板                                    |

---

## C. 暫時不應納入近期開發計劃（設施缺失 / 非核心價值 / ROI 低）

> 條件：需引入全新工具鏈 / 影響面極廣 / 當前產品階段 ROI 不高

| 線     | 項                   | 暫緩原因                                                                                                  |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------- |
| UI測試 | 4.5 可訪問性（A11y） | 完全**缺失工具鏈**（無 axe-core / jest-axe / jsx-a11y），追加 ARIA 涉及所有核心組件；建議 GTM 穩定後再做  |
| UI測試 | 4.6 視覺回歸         | 完全**缺失工具鏈**（無 Chromatic/Percy/Playwright snapshot 基線），基線維護成本高；建議設計系統穩定後再做 |

> 可選緩補項：**MSW / fetch mock 基礎設施**（影響 4.1、4.2 的擬真度，但非阻塞）

---

## 總體數字概覽

| 維度                  | 現狀                                         | 可規劃推進                        |
| --------------------- | -------------------------------------------- | --------------------------------- |
| 頁面                  | 8 完整 · 3 半成品 · 3 骨架                   | 8 可推進 + 6 需補基礎             |
| Service               | 33 個（全部存在）                            | 100% 名義存在，測試 9%            |
| API Route             | 79 個（全部存在）                            | 100% 名義存在，測試 29%           |
| Hook                  | 44 個                                        | 測試 1 個（use-unified-generate） |
| Component（business） | 60+ 個                                       | 測試 1 個（LocaleSwitcher）       |
| Provider Adapter      | 8 個                                         | 0 單測，但有 capability 測試      |
| 韌性工具              | 5 個（logger/retry/breaker/guard/validator） | 3/5 有測試                        |
| i18n                  | 三語齊全 1962-1963 行                        | key 完整性有 CI 守護              |
| E2E                   | 5 個 Playwright spec                         | mobile profile 已配               |

---

## 下一輪規劃原則建議

1. **A 類優先**：代碼底齊，適合先做 L3 拆分與時間排期
2. **B 類並行補基礎**：可在 A 類推進同時，按最小可驗證單元補測試錨點
3. **C 類延後**：待產品穩定後成套引入（axe + percy/chromatic）避免半吊子

**下一輪（L3）建議切入口**：

- UI：從 **1.2 Studio** 開始（hook 密度最高、已有測試錨點）
- 功能：從 **2.8 Arena** 或 **2.14 基礎設施** 開始（測試覆蓋最佳，最穩）
- 測試：優先推 **3.1 Service 單測**（覆蓋 9% 是項目最大的技術債）
