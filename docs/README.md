# PixelVault 文档入口

本目录是 Agent 可执行的标准体系，参照 [Esther 设计系统](https://hiesther.me/tutorials/esther-design-system/) 的「流程 + 规范 + 起点」模型并扩展到全栈。核心逻辑：**流程与品质底线保持一致，视觉答案按业务域形成**。

## 结构

```text
docs/
├── PLAYBOOK.md      owner 起手式手册：每类任务怎么开口、agent 会先做什么
├── WORKFLOW.md      任务怎么做：七步骨架 + 5 问硬门 + 任务类型×业务域路由矩阵
├── brand-dna.md     薄品牌脊柱 + 设计权力分层 + 域级确认流程 + 工程气质
├── forbidden.md     禁忌清单：AVOID/PREFER 成对，分域（UI/代码/架构/DB/CI/测试）
├── status.md        唯一活跃状态（覆盖更新，不追加历史）
├── checklists/      P0/P1/P2 质检：ui · backend · database · release
├── scenes/          任务类型场景：专属工作流 + 专属 5 问（批 3 填充）
├── references/      规则知识库：frontend · backend · database · cicd · testing · loading 等
│   └── api/         CI 用的模型文档快照（`npm run models:check-docs` 读它，别手改）
├── templates/       任务起点：task-packet 与代码骨架
└── plans/           在飞任务包（**完成即删** —— 2026-08-07 清过一轮，2026-09-01 全清；
    └── research/    目录当前不存在，下一轮任务包按此结构重新建即可）
                     research/ = 调研/可行性结论（非实现授权；中文文件名；按模块分子目录，每模块一份「模块整理」）
```

## 怎么进入

任何任务从 [`WORKFLOW.md`](WORKFLOW.md) 开始：判断任务类型 → 进对应 scene → 按路由矩阵读最小文档集。**不要通读整个 docs/。**

UI 设计文档按职责读取：`brand-dna.md` 管全局不变量与设计权力边界，`references/frontend.md` 管实现事实与共享行为，`references/domains/` 管业务域责任，`references/pages/` 只保存 owner 已确认的页面方向与施工契约。

⚠ `archive/` 与 `references/ui-inspiration/` 已于 2026-08-07 删除（owner 拍板「删，不是归档」）。历史证据一律从 git 历史取，不再有常驻目录。

## 文档原则

1. 代码是实现事实源；文档只记录代码读不出的契约、决策、验证路径。
2. 长期文档要短、明确、指向代码事实源（带 Source of Truth + Last Verified 区块）。
3. plans/ **完成即删**（不归档）；结论先沉淀进 `references/`，再删任务包。删之前必须 grep 全仓（含 `src/` 注释）改掉所有指向它的引用 —— 2026-08-07 那轮清理就是被这一步卡住最久的。
4. 能更新现有文档就不新建；一个事实只有一个家。
5. 新文档默认中文；代码标识符和路径保留英文。
6. **图片用标准 markdown，放引用方旁边**：`assets/<文档名>/x.png` + `![](assets/…/x.png)`。⛔ **禁用 Obsidian 的 `![[…]]` 内嵌语法** —— 只有 Obsidian 认，GitHub 和其它 markdown 渲染器一律显示不出来（`project-map.md` 的 36 张就这么坏了半个月，文件明明一直在 git 里）。
