# Scenes — 任务类型场景（批 3 填充）

每个 scene 文件 = 该类任务的完整执行包。**前端、后端、测试的工作流各自独立定义，不共用一套步骤**（owner 2026-07-10 拍板）。

## Scene 文件固定结构

1. **本场景工作流** — 七步总骨架（WORKFLOW.md）在本场景的具体化
2. **专属 5 问** — 开工硬门，与通用 5 问叠加
3. **必读** — brand-dna / forbidden 相关节 + references 对应篇 + 业务域文档
4. **起点模板** — templates/ 对应骨架
5. **对应 checklist** — checklists/ 哪一份
6. **禁改范围默认值** — 本类任务默认不许碰什么

## 计划清单

| scene             | 覆盖                     | 状态                                    |
| ----------------- | ------------------------ | --------------------------------------- |
| ui-page.md        | 产品内页 UI              | ✅（owner 已过 5 问）                   |
| ui-marketing.md   | 首页 / 营销页            | ✅（owner 已过 5 问）                   |
| api-endpoint.md   | API route 新增/修改      | ✅（owner 已过 5 问）                   |
| service-change.md | service / 业务逻辑       | ✅（owner 已过 5 问）                   |
| new-model.md      | 接入模型 / provider      | ✅（owner 已过 5 问）                   |
| db-migration.md   | Prisma schema / 迁移     | ✅（owner 已过 5 问）                   |
| testing.md        | 测试补齐 / 测试维护      | ✅（owner 已过 5 问）                   |
| bugfix.md         | Bug 诊断修复             | ✅（owner 已过 5 问）                   |
| deploy-release.md | ship / 部署 / 发布       | ✅（owner 已过 5 问）                   |
| research.md       | 调查 / 可行性 / 技术选型 | ✅（2026-07-10 补充，待 owner 过 5 问） |

Owner 起手方式见 [`../PLAYBOOK.md`](../PLAYBOOK.md)（每类任务怎么开口）。
