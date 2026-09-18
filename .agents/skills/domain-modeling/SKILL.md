---
name: domain-modeling
description: 明确或修订领域术语、业务概念和模型边界时使用。
---

# 领域建模

用于明确业务术语、职责与重要决策；单纯读取术语不需要启动建模工作流。

- 先读相关 `docs/references/domains/` 与代码，区分术语歧义、实现事实和目标行为。用具体场景检验归属、生命周期与失败路径。
- 对会改变业务结果的歧义提出精确问题和推荐；不要把所有命名选择交给用户。
- 确认后的术语与边界更新到该域现有文档；难以逆转、未来读者难以理解的真实权衡记录在同一事实所属文档。
- 不另建 CONTEXT/ADR 体系，不为每个决定增加文档，不自动改产品代码。

术语结构可参考 [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md)，重大取舍可参考 [ADR-FORMAT.md](ADR-FORMAT.md)；只借用相关字段，输出位置遵循 `docs/WORKFLOW.md`。
