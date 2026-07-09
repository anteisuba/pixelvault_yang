# 项目状态

最后更新：2026-07-10

唯一活跃进度文档。保持短，覆盖更新，不追加历史。

## Current Focus

- **文档标准重建三批全部完成（2026-07-10）**：批 1 骨架+迁移 · 批 2 references 十二篇 · 批 3 scenes 九篇（专属 5 问逐篇过审）+ templates 代码骨架 ×4（真实样例抽取）+ CLAUDE.md（287→约 100 行）/ AGENTS.md（2016→约 40 行）激进瘦身成路由。**整个重建是一个完整切片，待 owner 确认后 commit。**
- 待 owner 拍板/启动：Seedream 5.0 接入建议表（model-catalog.md）· 三个 Sonnet 任务 chip（Satoshi 清理 / hydration 修复 / 三篇文档校验+周检基线）· dependabot 分流（#204/#201 不能合，#200/#202/#203 测绿可合）。
- 在飞任务包（plans/）：Comfy runner（RunPod）· 画布重构（ScriptDoc+autospawn 引擎）· 音频域 Phase A · 节点收敛方案 B。
- UI 改版（工坊宅邸 E+F）：大致方向已入 brand-dna，深挖与概念稿等 owner 启动改版时再做；过渡期守 v1 现状。

## Next

- owner 核对后 commit 文档重建切片。
- 模型月审下次 2026-08 初（model-catalog.md）。

## Blocked

- 无。

## Recently Changed

- 2026-07-10 文档体系 v2 完成：WORKFLOW（七步+5 问+路由矩阵+Commit/Push 规则）· brand-dna（工坊宅邸大致方向+过渡期规则）· forbidden（AVOID/PREFER ×7 域）· checklists ×4 · scenes ×9 · references ×13（含 model-catalog 月审与 cicd 排障手册）· templates ×5 · CLAUDE.md/AGENTS.md 瘦身。旧文档：拍板决策在 archive/，全量可从快照 `cddc4384` 找回。
- 产品四项重核：双轨用户 / 北极星=画布+LoRA 双核 / 3D 搁置（远期=导演台 3D 镜头控制）/ Arena·Storyboard 等图片 LoRA 完善。
