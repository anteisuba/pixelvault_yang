---
name: full-gate
description: 运行共享/高风险变更或发布要求的全量类型与测试验证；不用于每个普通实现切片。
---

# 全量验证

仅在 WORKFLOW 要求的共享/高风险变更、发布或用户明确要求全量验证时使用。普通局部修复不因技能增加全量门禁。

运行项目全量 typecheck 与 Vitest，涉及 Worker 时补独立套件；发布再按 `docs/checklists/release.md` 执行 lint/build 等适用项目。先确认 `package.json` 的实际命令，长任务用工具会话或临时日志保留完整结果。

- 必须取得真实退出码；不要用管道末尾的 `head`、`grep` 或 passed 计数判成功。
- typecheck 非零就不能声称通过，包括生成类型错误；定位环境原因后修复或报告阻塞，不排除错误行制造全绿。
- 验证覆盖最终改动。检查期间发生相关修改时重跑受影响部分；否则不无条件重跑。
- 不因超时跳过，不与 dev 并发 build，不终止 owner 的 dev。
- commit/push 的授权、暂存和 hooks 纪律统一见 WORKFLOW。
