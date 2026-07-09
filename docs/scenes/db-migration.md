# Scene · Prisma schema / 迁移（db-migration.md）

> 覆盖：`prisma/schema.prisma` 的任何变更与数据迁移。**2026-06 发生过迁移漂移事故，本场景纪律从严**。对应 checklist：`checklists/database.md`。

## 专属 5 问（开工硬门）

1. **影响哪些表和字段？引用面多大？**——`Generation` / `User` 是全库引用最广的模型，>5 处只做向后兼容（加列可以，改列义/删列要兼容期）。往 `Generation` 加字段前先答：这是不是该拆去 `GenerationJob` / 专属表的东西（长期建模）？
2. **可回滚吗？**——写出回滚评估：纯加列 = 低风险；删列/改类型/改约束 = 要兼容期方案（先双写/后清理），不确定就问 owner。
3. **存量数据怎么迁？**——默认值 / 回填 / 兼容读，三选一说清；要回填的话脚本放哪、谁跑、跑几行。
4. **哪些查询读写这个字段？**——grep service 层用点；WHERE / ORDER BY 用到的字段加 `@@index()`；关系删除语义（Cascade=ownership / SetNull=软引用）说得出理由。
5. **在哪验证？**——迁移必须在 dev 数据库实跑一遍；`prisma generate` 后全量 tsc；seed/测试夹具要不要同步。

## 本场景工作流

1. 问 5 问。
2. 读规矩：`references/database.md`（域模型地图 + 迁移纪律）→ `prisma/CLAUDE.md` → `forbidden.md` 数据库节 → 相关 `references/domains/<域>.md`。
3. 设计评审：按长期建模过一遍（属性别编码成类型；视频三系统并存中，新视频字段先看在飞任务包选挂靠点，不开第四套）。
4. 执行三步硬序：改 `schema.prisma` → `npx prisma migrate dev --name <description>` → `npx prisma generate`。**永远不手改数据库结构、不手改 migrations 历史、不碰 `src/lib/generated/prisma/`**。
5. 落实存量数据路径（第 3 问的答案），回填脚本先在 dev 验证。
6. 验证：全量 tsc（后台 + exit code）→ 相关 service 测试 → **全量 vitest** → dev 环境功能实测一条主路径。
7. 自检：`checklists/database.md` 逐项。
8. 交付报告：迁移名 + 回滚评估 + 影响面 grep 结论 + 存量数据方案 + 验证结果。

## 必读清单

`references/database.md` · `prisma/CLAUDE.md` · `forbidden.md`（数据库节）· 相关 `references/domains/<域>.md`

## 禁改范围默认值

不顺手"清理"无关模型/字段 · credit / 计费相关字段 = 先问 owner · 不动认证映射（`User.clerkId`）语义 · 迁移文件生成后不回头编辑（要改就再来一个迁移）。

## 验证命令

`npx prisma migrate dev`（dev 库实跑）→ `npx prisma generate` → 全量 tsc → 全量 vitest → dev 主路径实测。
