# 项目状态

最后更新：2026-07-10

唯一活跃进度文档。保持短，覆盖更新，不追加历史。

## Current Focus

- **画布间改版启动（2026-07-10）**：概念稿四分叉 + 吞噬交互 v2 均已拍板（深炭桌+纸场记卡 / 石绿克制档 / **吞噬取代连线**——数据层边保留、作用域=省略模式、食物链=connection-rules 矩阵翻译、动效 demo 手感定稿），施工图落 `references/pages/node-canvas.md`（S1–S6，S5a 卡匣四分区 / S5b 吞噬手势）。**S1–S4 已 commit（`2b4906a4`/`98a7bab1`）；S5a+S5b(B0+B1)+「暂无引用」修复+S5c 已完成，待 owner 目验浮层后合并 commit**（最终全绿 391 文件/3111 测试）。S5c 落地：浮层修缮（裁切真根因=固定卡宽 96px 超列宽被 overflow 裁，改 w-full 根治）、角色/背景档案面板（视觉图集网格[加/拆/权重/分类+closeup 并陈]/听觉绑定/词条/出演四区聚合，数据层零新建）、卡匣肚子徽章 📷N ♪、散图一等公民（LooseImageCard+本地文件拖入画布 R2 直传）、融合/拆分无损循环（fusedIntoNodeId 回溯，source:canvas 枚举）。**S5d 模型对齐已完成（2026-07-11）**：六条修正+两缺陷+卡匣新结构（只放收集器卡两分区/音色·参考视频回归素材/upload-first+分类11项+custom 进图例/收集器档案卡面/融合画布化+三拍补齐/把手双锚点）全落地；lint/tsc 绿；**vitest 2 失败归属 comfy-runner 会话遗留**（RUNNER 枚举缺 PROVIDER_CAPABILITIES 配置+三语 i18n，须该会话补齐后才能全绿 push）。**B2（磁吸/快投/张口预览+把手热区）待下片；S5e（画风卡/道具卡/自定义卡新类型）排队**。遗留：新手势单测偏薄、closeup 未隐藏、♪徽章语义双源、shotText/工具条冗余（S6）。剧本笺挂账；任务包战役结束统一归档。⚠ 首页视觉基线当前 fail 与 S1 无关：assistant-ux 在飞批删了 globals.css 的 Satoshi @import 致字体回退，该批收口时处理。同日全项目审计拍板：音乐=ElevenLabs Music v2（待排期）；UI 小伤四条清单挂起。
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
