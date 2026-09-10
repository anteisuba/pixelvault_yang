# Scene · Schema 与存量数据

适用于 schema、数据约束与迁移相关任务。代码原则以 AGENTS 为准，安全门以本节为准；不把技术方案建议当作生产操作授权。

## 场景自查

- 目标属于哪个模型，是否应放进 `GenerationJob` 或专属表？搜索全部读写调用方，避免给 Generation 堆不相关职责。
- 存量数据如何保留，约束是否成立，失败时如何恢复？旧部署仍在运行时是否受影响？
- 当前连接实际指向哪里？仓库已有记录提示 `.env.local` 曾连接生产库；不能因名称含 local/dev 就认定是测试环境，不打印凭据。
- owner 的“不写 migration、不留兼容层”是否允许当前方案？如需求必须依赖例外，先完成只读影响分析与可审查方案，再询问具体例外；不擅自采用 expand-contract 或删数据。
- 验证环境是否可用？`npm run preflight:migrations` 的依赖与已知缺口见 `docs/status.md`，未配置或未运行不能声称验证成功。

## 执行

1. 读 `references/database.md`、`prisma/CLAUDE.md`、相关域文档与当前构建/迁移脚本，核实 schema 和部署事实。
2. 已授权的本地代码修改可继续；任何迁移生成/应用方案先核对应版本的官方 Prisma 文档和目标连接。不要沿用旧文档的“create-only 即可安全在生产运行”假设。
3. 不在生产或未确认隔离的连接执行 `migrate dev`，包括 `--create-only`；不执行 reset、db push、清库或手工改库。生产变更需明确授权、已审阅操作与恢复方案，遵循发布流程。
4. 如已获本任务迁移例外授权，检查 SQL 与存量数据约束，在已授权隔离环境验证。约束型变更的实际证据登记到现有 `prisma/migration-safety.test.ts` 的 `ACKNOWLEDGED`；不改既有迁移历史或生成客户端文件。
5. 按 WORKFLOW 跑全量类型与测试检查，再按 `checklists/database.md` 核对。空库 CI 不能证明生产存量数据满足新增约束。

报告目标模型、调用方影响、数据保留与恢复方案、实际验证环境及未决授权；不把生产操作留作默认下一条命令。
