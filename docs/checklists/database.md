# Database Checklist — P0 不过打回

Prisma schema / 迁移 / 数据访问改动完成后逐项过。

## P0（必须全过）

- [ ] schema 变更有迁移文件；可回滚性评估过并写进报告
- [ ] 存量数据迁移路径明确（默认值 / 回填 / 兼容读，三选一说清）
- [ ] 被引用 >5 处的模型只做向后兼容修改
- [ ] ownership（userId 归属）服务端校验，不信客户端
- [ ] `prisma generate` 后全量 tsc 绿（后台跑 + 显式 exit code）

## P1（应过）

- [ ] 新查询路径评估过索引
- [ ] 关联删除行为是有意选择（cascade / restrict 说得出理由）
- [ ] 迁移在 dev 数据库实际跑过一遍

## P2（加分）

- [ ] seed / 测试夹具同步更新
