# PixelVault 文档入口

本目录是 Agent 可执行的标准体系，参照 [Esther 设计系统](https://hiesther.me/tutorials/esther-design-system/) 的「流程 + 规范 + 起点」模型并扩展到全栈。核心逻辑：**限制自由度 = 保证质量**。

## 结构

```text
docs/
├── PLAYBOOK.md      owner 起手式手册：每类任务怎么开口、agent 会先做什么
├── WORKFLOW.md      任务怎么做：七步骨架 + 5 问硬门 + 任务类型×业务域路由矩阵
├── brand-dna.md     我们是谁：视觉基因（双面模式/色彩配比/字体/动效）+ 工程气质
├── forbidden.md     禁忌清单：AVOID/PREFER 成对，分域（UI/代码/架构/DB/CI/测试）
├── status.md        唯一活跃状态（覆盖更新，不追加历史）
├── checklists/      P0/P1/P2 质检：ui · backend · database · release
├── scenes/          任务类型场景：专属工作流 + 专属 5 问（批 3 填充）
├── references/      规则知识库：frontend · backend · database · cicd · testing 等（批 2 填充）
├── templates/       任务起点：task-packet 与代码骨架
├── plans/           只放在飞任务包，完成即删/归档/沉淀
└── archive/         拍板决策与历史证据，不进默认阅读路径
```

## 怎么进入

任何任务从 [`WORKFLOW.md`](WORKFLOW.md) 开始：判断任务类型 → 进对应 scene → 按路由矩阵读最小文档集。**不要通读整个 docs/。**

## 文档原则

1. 代码是实现事实源；文档只记录代码读不出的契约、决策、验证路径。
2. 长期文档要短、明确、指向代码事实源（带 Source of Truth + Last Verified 区块）。
3. plans/ 完成即删、归档或沉淀；过期进度不留在默认阅读路径。
4. 能更新现有文档就不新建；一个事实只有一个家。
5. 新文档默认中文；代码标识符和路径保留英文。
