# References — 规则知识库（批 2 填充）

现状事实 + 契约。每篇必须带 Source of Truth + Last Verified 区块；对照代码写完一篇、审一篇，再写下一篇。

| 篇               | 覆盖                                                                                                                      | 事实源起点                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| frontend.md      | **统一共同设计文档**：字体 / 组件怎么布置 / 布局范式 / 移动端设计范式 / token / i18n（✅ 已写）                           | `src/app/globals.css`（@theme inline）· `src/i18n/fonts.ts` |
| pages/<页>.md    | **每页详细 UI 文档**：先理解该页工作流程与内容，再定 UI 详设                                                              | 对应页面代码 + 实际工作流调研                               |
| backend.md       | service / route 契约 / resilience utilities（✅ 已写）                                                                    | `src/services/` · `src/lib/`                                |
| database.md      | Prisma 域模型边界 / 迁移纪律（✅ 已写）                                                                                   | `prisma/schema.prisma`                                      |
| model-catalog.md | **模型目录月度审计**：现役盘点 / 官方动态 / 加删建议（✅ 已写，**每月更新**）                                             | `src/constants/models/` · model-doc-monitor CI              |
| cicd.md          | GitHub Actions 5 workflows / Vercel / 本地闸门（✅ 已写）                                                                 | `.github/workflows/`                                        |
| testing.md       | vitest / playwright 策略 / 视觉基线双 OS（✅ 已写）                                                                       | `vitest.config.*` · `e2e/`                                  |
| providers.md     | AI provider 接入契约 / BYOK / 错误信息全链路（✅ 已写）                                                                   | `src/constants/providers.ts`                                |
| product.md       | 产品边界与主线（✅ 已写，2026-07-10 四项重核更新）                                                                        | 本文件即现行契约；详版 `archive/product/`                   |
| domains/         | 各业务域契约（负责什么 / 不负责什么 / 不能破坏什么）——高频 4 篇 ✅：studio · assets · gallery · prompts；其余域待需要时补 | `src/` 对应域代码                                           |

**设计文档两层原则**（owner 2026-07-10 拍板）：`frontend.md` 定共同部分，**不要限制得太死**——它是默认值和共享词汇表，不是枷锁；页面文档可以有意破格，但破格必须记录理由。每页 UI 文档动笔前必须先做该页工作流程调研。

**填充前过渡**：以代码为事实源；产品边界看 `archive/product/`，UI 施工基准看 `archive/reviews/` 对应篇。
