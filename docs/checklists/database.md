# Database Checklist — P0 不过打回

Prisma schema / 迁移 / 数据访问改动完成后逐项过。

## P0（必须全过）

- [ ] schema 变更有明确数据保留和恢复方案；若必须写 migration/兼容层，已有本任务例外授权
- [ ] 存量数据路径已验证，不能把“不留兼容”解释为允许数据丢失
- [ ] 已核实当前部署顺序与旧实例影响，方案符合 AGENTS；不自动套用 expand-contract
- [ ] ownership（userId 归属）服务端校验，不信客户端
- [ ] `prisma generate` 后全量 tsc 绿（后台跑 + 显式 exit code）
- [ ] 目标连接与操作授权已核实；未在生产或未知环境执行 migrate dev（含 create-only），已授权迁移 SQL 经审查
- [ ] **约束型迁移**（唯一索引 / `SET NOT NULL` / 外键 / 改列类型 / 加无默认值非空列）已在**现有数据**上验过，且「怎么验的」登记进 `prisma/migration-safety.test.ts` 的 `ACKNOWLEDGED`。⚠ **CI 绿不算证据**——它在空库上重放历史，约束怎么都建得上

## P1（应过）

- [ ] 新查询路径评估过索引
- [ ] 关联删除行为是有意选择（cascade / restrict 说得出理由）
- [ ] 复杂迁移（`USING (CASE …)` 转换 / 多条互相依赖 / 回填脚本）跑过 `npm run preflight:migrations`（生产的 Neon 分支副本）。⚠ **本仓没有 dev 数据库**，「先在 dev 跑一遍」这条退路不存在

## P2（加分）

- [ ] seed / 测试夹具同步更新
