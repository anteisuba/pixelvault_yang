# 规范文档目录

`docs/guides/` 用来存放对仓库有持续约束力的规范文档。

默认来源：

- 置顶的 `规范` thread

这类文档不是临时笔记，也不是一次性任务说明。它们应该沉淀：

- 可复用的工程约束
- 可重复执行的工作流
- 会长期影响 AI 和人类协作质量的项目法则

## 更新规则

新增或修改 guide 时，按下面顺序处理：

1. 把文档写入 `docs/guides/`
2. 在 `AGENTS.md` 的 `Appendix B. Guide Index` 中登记
3. 只保留稳定、可执行、可复用的规则，避免混入临时任务背景

## 当前文档

- `codex-thread-operating-model.md`：四线程协作模式、文档落点、回流规则
- `codex-development-workflow.md`：上下文读取顺序、任务包、计划/实现/review 流程、稳定性门禁
