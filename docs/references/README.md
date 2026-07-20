# References — 规则知识库（批 2 填充）

现状事实 + 契约。每篇必须带 Source of Truth + Last Verified 区块；对照代码写完一篇、审一篇，再写下一篇。

| 篇               | 覆盖                                                                                                                             | 事实源起点                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| frontend.md      | **前端实现事实与共享行为契约**：token 分层 / 组件 API 与状态 / overlay / responsive / i18n（✅ 已写）                            | `src/app/globals.css`（@theme inline）· 共享组件代码 |
| pages/<页>.md    | **owner 已确认的页面方向与施工契约**：先完成域定义、三方向和关键切片，再写入                                                     | 对应页面代码 + 实际工作流调研 + owner 确认           |
| backend.md       | service / route 契约 / resilience utilities（✅ 已写）                                                                           | `src/services/` · `src/lib/`                         |
| database.md      | Prisma 域模型边界 / 迁移纪律（✅ 已写）                                                                                          | `prisma/schema.prisma`                               |
| model-catalog.md | **模型目录月度审计**：现役盘点 / 官方动态 / 加删建议（✅ 已写，**每月更新**）                                                    | `src/constants/models/` · model-doc-monitor CI       |
| cicd.md          | GitHub Actions 5 workflows / Vercel / 本地闸门（✅ 已写）                                                                        | `.github/workflows/`                                 |
| testing.md       | vitest / playwright 策略 / 视觉基线双 OS（✅ 已写）                                                                              | `vitest.config.*` · `e2e/`                           |
| providers.md     | AI provider 接入契约 / BYOK / 错误信息全链路（✅ 已写）                                                                          | `src/constants/providers.ts`                         |
| product.md       | 产品边界与主线（✅ 已写，2026-07-10 四项重核更新）                                                                               | 本文件即现行契约；详版 `archive/product/`            |
| domains/         | 各业务域契约（负责什么 / 不负责什么 / 不能破坏什么）——高频 5 篇 ✅：studio · assets · gallery · prompts · lora；其余域待需要时补 | `src/` 对应域代码                                    |
| ui-inspiration/  | owner 策展的 UI 参考与模式拆解；**不是规范或施工图**                                                                             | owner 截图 · 来源页面 · `brand-dna.md` 设计边界      |

**设计权力分层**（owner 2026-07-19 拍板）：`brand-dna.md` 只管薄品牌脊柱与品质底线；`frontend.md` 只管实现事实和共享行为；`domains/` 定业务责任与域级身份；`pages/` 记录 owner 已确认的页面方向。共享组件不统一页面皮肤，page/domain token 不得反向污染全局。每页 UI 文档动笔前必须先做工作流调研，并完成三个结构方向与关键切片确认。

**历史证据**：`archive/` 与 `ui-inspiration/` 只能帮助理解过去决策或外部模式，不进入默认规范链；代码外观也只能证明现状，不能自动成为下一版设计答案。

## Last Verified

- 2026-07-19 · 将 references 设计职责改为 frontend 实现事实、domains 业务责任、pages 已确认施工契约；archive 与 inspiration 降为证据。
