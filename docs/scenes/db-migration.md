# Scene · Prisma schema / 迁移（db-migration.md）

> 覆盖：`prisma/schema.prisma` 的任何变更与数据迁移。**2026-06 发生过迁移漂移事故，本场景纪律从严**。对应 checklist：`checklists/database.md`。

## 专属 5 问（开工硬门）

1. **影响哪些表和字段？引用面多大？**——`Generation` / `User` 是全库引用最广的模型：**代码侧的调用方 grep 出来一次全改完**（不留旧字段读法的垫片）；**数据库列本身走 expand-contract**——加列可以直接来，改列义 / 删列 / 改类型要留兼容期。理由只有一个，是部署顺序：`vercel.json` 的 buildCommand 走 `scripts/vercel-build.sh`，**生产构建里迁移先于 `next build`、也就先于新代码上线，且旧 serverless 实例还在跑旧查询**，中间那段时间新旧 schema 必须同时可服务。（该脚本按 `VERCEL_ENV` 分支，迁移**只在 production 跑**；Preview 跑的是「新代码 + 旧 schema」，带新迁移的分支在 Preview 上相关路径报错是期望行为。）⚠ 这与 CLAUDE.md Engineering Principle 1 不冲突——那条禁的是**代码层**的兼容垫片，不是禁生产库的 expand-contract。往 `Generation` 加字段前先答：这是不是该拆去 `GenerationJob` / 专属表的东西（长期建模）？
2. **可回滚吗？**——写出回滚评估：纯加列 = 低风险；删列/改类型/改约束 = 要兼容期方案（先双写/后清理），不确定就问 owner。
3. **存量数据怎么迁？**——默认值 / 回填 / 兼容读，三选一说清；要回填的话脚本放哪、谁跑、跑几行。
4. **哪些查询读写这个字段？**——grep service 层用点；WHERE / ORDER BY 用到的字段加 `@@index()`；关系删除语义（Cascade=ownership / SetNull=软引用）说得出理由。
5. **在哪验证？**——⚠ **本仓没有 dev 数据库**：`.env.local` 指向的就是 Vercel 用的生产库（2026-08-22 由构建日志确认，见 `references/cicd.md`）。所以「先在 dev 跑一遍」这条退路不存在，验证只有两种：拿生产数据查一条**只读** SQL，或 `npm run preflight:migrations` 在生产的 Neon 分支副本上真跑。`prisma generate` 后全量 tsc；seed/测试夹具要不要同步。

## 本场景工作流

1. 问 5 问。
2. 读规矩：`references/database.md`（域模型地图 + 迁移纪律）→ `prisma/CLAUDE.md` → `forbidden.md` 数据库节 → 相关 `references/domains/<域>.md`。
3. 设计评审：按长期建模过一遍（属性别编码成类型；视频三系统并存中，新视频字段先看在飞任务包选挂靠点，不开第四套）。
4. 执行四步硬序：改 `schema.prisma` → **`npx prisma migrate dev --create-only --name <description>`**（只生成，不应用）→ 读 `migration.sql` 并按下方「约束型迁移」验一遍 → 确认无误再 `npx prisma migrate dev` + `npx prisma generate`。
   ⛔ **禁止裸跑 `migrate dev`**：它生成并立即应用，而那是生产库。**永远不手改数据库结构、不手改 migrations 历史、不碰 `src/lib/generated/prisma/`**。
   ⚠ **约束型迁移**（唯一索引 / `SET NOT NULL` / 外键 / 改列类型 / 加无默认值的非空列）多一道：先确认它在**现有数据**上成立，再把「怎么验的」登记进 `prisma/migration-safety.test.ts` 的 `ACKNOWLEDGED`（进 pre-push，不登记 push 不出去）。**CI 挡不住这类问题**——它在空库上重放历史，约束怎么都建得上。
5. 落实存量数据路径（第 3 问的答案）。⚠ 回填脚本没有 dev 库可试，先在 `npm run preflight:migrations` 开的分支副本上跑，或写成幂等的、能重跑的形状。
6. 验证：全量 tsc（后台 + exit code）→ 相关 service 测试 → **全量 vitest** → dev 环境功能实测一条主路径。
7. 自检：`checklists/database.md` 逐项。
8. 交付报告：迁移名 + 回滚评估 + 影响面 grep 结论 + 存量数据方案 + 验证结果。

## 必读清单

`references/database.md` · `prisma/CLAUDE.md` · `forbidden.md`（数据库节）· 相关 `references/domains/<域>.md`

## 禁改范围默认值

不顺手"清理"无关模型/字段 · credit / 计费相关字段 = 先问 owner · 不动认证映射（`User.clerkId`）语义 · 迁移文件生成后不回头编辑（要改就再来一个迁移）。

## 验证命令

`npx prisma migrate dev --create-only`（只生成）→ 读 `migration.sql` → 约束型的验一遍并登记 → `npx prisma migrate dev`（应用，⚠ 打的是生产库）→ `npx prisma generate` → 全量 tsc → 全量 vitest → 主路径实测。
