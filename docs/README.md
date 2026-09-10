# PixelVault 文档入口

本目录是 Agent 可执行的标准体系，参照 [Esther 设计系统](https://hiesther.me/tutorials/esther-design-system/) 的「流程 + 规范 + 起点」模型并扩展到全栈。核心逻辑：**流程与品质底线保持一致，视觉答案按业务域形成**。

## 结构

```text
docs/
├── PLAYBOOK.md      owner 起手式手册：每类任务怎么开口、agent 会先做什么
├── WORKFLOW.md      任务怎么做：自主执行 + 按风险澄清与验证 + 任务类型×业务域路由矩阵
├── brand-dna.md     薄品牌脊柱 + 设计权力分层 + 域级确认流程 + 工程气质
├── forbidden.md     禁忌清单：AVOID/PREFER 成对，分域（UI/代码/架构/DB/CI/测试）
├── status.md        唯一活跃状态（覆盖更新，不追加历史）
├── checklists/      P0/P1/P2 质检：ui · backend · database · release
├── scenes/          任务类型场景：专属工作流 + 场景自查
├── references/      规则知识库：ui-defaults（UI 默认食谱，动 UI 必读）· frontend · backend · database · cicd · testing · loading 等
│   └── api/         CI 用的模型文档快照（`npm run models:check-docs` 读它，别手改）
└── templates/       按需参考的代码骨架与对话交接模板
```

## 怎么进入

任何任务从 [`WORKFLOW.md`](WORKFLOW.md) 开始：判断任务类型 → 进对应 scene → 按路由矩阵读最小文档集。**不要通读整个 docs/。**

UI 设计文档按职责读取：`brand-dna.md` 管全局不变量与设计权力边界，`references/frontend.md` 管实现事实与共享行为，`references/domains/` 管业务域责任，`references/pages/` 只保存 owner 已确认的页面方向与施工契约。

`references/pages/` 里两处**一个主题只有一份现行基准**，别读错那一份：

- 助手 → `assistant-shell.md`（**现行施工基准**，2026-09-06 方向 C；旧方向 A 的决策逐条状态在它 §16「历史决策表」）
- 画布 → `node-canvas-v2.md`（**唯一基准**：§1 通用语言 · §2–§5 四类节点的呈现与提示词栏 · §6 剪辑台 · §7 画布外壳与新建词表 · §8 随之而来的数据改动 · §9 分类法/具名槽/连线矩阵 · §10 命名与快照 · §11 动作出口与撤销 · §12 剧本投影 · §13 助手 op 与提案卡 · §14 存储与升级 · §15 皮肤收尾）。⚠ 同目录的 `node-canvas.md` 与 `canvas-*.md` 描述的是已删除的 v3 实现，只作旧决策的论据来源，⛔ 不作施工依据。界面重做的施工规格 `node-canvas-v3-spec.md` 与 `canvas-generate-composer.md` 已于 2026-09-10 并回 / 删除，实现历史见 git log。

⚠ `archive/` 与 `references/ui-inspiration/` 已于 2026-08-07 删除（owner 拍板「删，不是归档」）。历史证据一律从 git 历史取，不再有常驻目录。

## 文档原则

1. 代码是实现事实源；文档只记录代码读不出的契约、决策、验证路径。
2. 长期文档要短、明确、指向代码事实源（带 Source of Truth + Last Verified 区块）。
3. 在飞约束保留在对话，结论写入已有 `references/` 文档；不重建 plans/ 或 archive/。删除文档前搜索并修复引用。
4. 能更新现有文档就不新建；一个事实只有一个家。
5. 新文档默认中文；代码标识符和路径保留英文。
6. **图片用标准 markdown，放引用方旁边**：`assets/<文档名>/x.png` + `![](assets/…/x.png)`。⛔ **禁用 Obsidian 的 `![[…]]` 内嵌语法** —— 只有 Obsidian 认，GitHub 和其它 markdown 渲染器一律显示不出来（`project-map.md` 的 36 张就这么坏了半个月，文件明明一直在 git 里）。
