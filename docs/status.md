# 项目状态

最后更新：2026-07-15

唯一活跃进度文档。保持短，覆盖更新，不追加历史。

## Latest implementation status (2026-07-15)

- LoRA source-image replay writes steps/CFG, exact uint64 seed, allowlisted sampler/scheduler, and source dimensions into the Runner request. HF discovery supports public image-generation LoRAs across multiple base families with real cursor pagination, family filters, and exact file selection. The LoRA workbench supports zero-LoRA Anima Base generation, editable Runner parameters, exact-dimension validation, and independent `4x-AnimeSharp` post-processing. Execution Worker version `b5d08a0e-d7c6-4d1e-88d4-c0ed77bbc505` was deployed on 2026-07-15; completed Runner images are now persisted to R2 inside the polling step so Workflow state only carries compact metadata (avoids the 1 MiB non-stream step-result limit). Exact live replay job `21d9d401-74e2-4d1b-b848-603ef08b1606` completed through RunPod + production callback at 6144×2592. RunPod S3 confirmed `models/upscale_models/4x-AnimeSharp.pth` at 67,010,245 bytes. App/frontend changes remain local pending owner-approved commit/push.
- Mobile Gallery E2E no longer misclassifies an unstyled localhost page as horizontal overflow: development omits CSP `upgrade-insecure-requests`, while production retains it. The release mobile suite passes 23/23, including Gallery at 375/390/430/820 px.
- Node assistant model context is bounded independently from the stored transcript, and long assistant replies can collapse to a one-paragraph preview. Focused tests, full Vitest (3358 tests), typecheck, lint, and live browser checks pass; these app changes remain local pending owner-approved commit/push.
- `.next` was removed, Next route types regenerated, and `npm run typecheck` passes.
- Audio previews now use an inline Fish Audio adapter only when development points at a loopback execution worker; production still requires the worker. Network failures are surfaced as structured 502 errors.
- Canvas and Studio assistants now share the `AssistantShell` frame and `AssistantShellHeader`; canvas history/share controls are anchored at the rail edge. Read-only conversation shares use expiring hashed tokens, an authenticated create API, a public read API, and a locale-aware share page.
- Image editing calls are centralized in `src/lib/canvas-capability-runtime.ts` and covered by focused tests. Character and scene inspectors now offer card selection and hydrate the node image, prompt, references, and metadata from the selected card.
- Remaining follow-up: confirm the external Fish provider path with a real provider request and perform owner visual QA for the shared assistant/history rail alignment. The public share page and invalid-token API path have passed local runtime smoke checks.

## Current Focus

- **Canvas modular execution update (2026-07-14, `codex/canvas-modular-redesign`)**: I3 layer decomposition, E1 runtime seam, V2 video Generation/lineage, A1 Audio Clip semantics, AS1 assistant references/capability actions, and R1 legacy edit cleanup are implemented and verified. E2 is intentionally marked partial because video/audio orchestration still has Workbench-owned paths. Remaining S6 work is owner visual QA for history/empty state/canvas polish plus real Fish provider request validation.

- **画布间改版启动（2026-07-10）**：概念稿四分叉 + 吞噬交互 v2 均已拍板（深炭桌+纸场记卡 / 石绿克制档 / **吞噬取代连线**——数据层边保留、作用域=省略模式、食物链=connection-rules 矩阵翻译、动效 demo 手感定稿），施工图落 `references/pages/node-canvas.md`（S1–S6，S5a 卡匣四分区 / S5b 吞噬手势）。**S1–S4 已 commit（`2b4906a4`/`98a7bab1`）；S5a+S5b(B0+B1)+「暂无引用」修复+S5c 已完成，待 owner 目验浮层后合并 commit**（最终全绿 391 文件/3111 测试）。S5c 落地：浮层修缮（裁切真根因=固定卡宽 96px 超列宽被 overflow 裁，改 w-full 根治）、角色/背景档案面板（视觉图集网格[加/拆/权重/分类+closeup 并陈]/听觉绑定/词条/出演四区聚合，数据层零新建）、卡匣肚子徽章 📷N ♪、散图一等公民（LooseImageCard+本地文件拖入画布 R2 直传）、融合/拆分无损循环（fusedIntoNodeId 回溯，source:canvas 枚举）。**S5d 模型对齐已完成（2026-07-11）**：六条修正+两缺陷+卡匣新结构（只放收集器卡两分区/音色·参考视频回归素材/upload-first+分类11项+custom 进图例/收集器档案卡面/融合画布化+三拍补齐/把手双锚点）全落地；lint/tsc 绿；**vitest 2 失败归属 comfy-runner 会话遗留**（RUNNER 枚举缺 PROVIDER_CAPABILITIES 配置+三语 i18n，须该会话补齐后才能全绿 push）。**S1–S5d 已全部进 main（`5b8cdfe1` 画布批 / `ee745b79` runner 批 / `81f229ef` assistant 批，owner 自提）；S5f-A 画布吞噬全覆盖已完成（2026-07-11 全绿 391/3143）**：五行手势齐（收集器卡→镜头/视频、音色→卡/视频、参考视频→视频、散图→视频；散图→镜头图按矩阵正确拒绝）；「鸣潮」数据复原（唯节点像素位置漂移无数据损伤）。**S5f-B 全部完成（2026-07-11，Fable/Opus 接手）**：子代理撞 Fable 限额断在半途留编译不过（PendingDrag 缺字段）已修回绿；四项全落地——B1 磁吸✅、B3 张口预览（卡匣卡路径）✅、**B2 快投模式**✅（CastCard hover Send 钮/长按 onLongPress→进模式；合法目标绿框+序号角标、已含⊘暗；workbench onNodeClick=feed / onPaneClick+Esc=exit；quickThrowApiRef 桥接 provider↔workbench 外部事件）、**B4 把手热区**✅（canvasNodeDragActive→CastDock 折叠态近把手自动展开、拖拽结束回折叠）。tsc/lint/**vitest 392 文件 3168 测试全绿**；B2 chrome 实测确认（进模式 banner+目标绿框序号角标+Esc 退出，DOM 逐项核）；B4 代码绿（真机拖拽近把手需 owner 实测）。⚠ 张口预览仅覆盖卡匣卡路径，画布节点拖拽路径未接（handleNodeDrag 走引擎外）。**待 commit**。
- **画布模块化重构 / Haivis 对标（2026-07-14，分支 `codex/canvas-modular-redesign`）**：W0 分栏壳、CanvasSurface 外观、散图/镜头纯图选中+四角缩放、对象工具条、C2 超分/去背景（源节点 running 态 + placeDerivedImages）、legacy edit 兼容跳转、卡匣并排底栏、**助手会话 DB 持久化与共享**（`AssistantConversation` + 过期哈希分享 token + 本地化只读页）、Studio/Canvas 共享助手 shell、通用 `CanvasCapabilityRuntime` 编辑 API、角色/场景卡纯图选择与完整 hydration。**仍欠**：S6 空态插画、真实 Fish provider 请求联调、owner 对助手历史浮层与画布视觉的最终验收。

- **Seedance @token 核验 + 视频引用重设计（2026-07-11）**：owner 质疑 @名字 token 是否生效 → 联网核验（fal 官方页+两指南）确认 **Seedance 只认位置 token @Image1，不认自定义名字**；卡片抽象对（=Seedance 身份槽）但送法错。设计稿 `plans/node-video-reference-seedance-design.md`（三层 token/卡片加主图/只送已引用/管理素材面板 UI/V1-V3 切片）。**V-1 已完成全绿（393/3181）**：新增 `lib/node-video-prompt-translation.ts` 发送时把 @名字→@Image1（名字），创作层不变；`buildVideoReferenceLegend` 前缀图→@Image。**V-1 已 commit `1d4384f8`。V-2 主图已 commit `36a38d2e`**（2026-07-12 全绿 393/3188）：referenceAssets 加 `isPrimary`（落 asset 级非节点级=避开并行音色批在改的 NodeMediaInspector）+ `getNodePrimaryMediaUrl`（★→mediaUrl→[0]回退）+ 四处收割换用+★指定 UI+折叠卡角标；持久化刷新验证过。⚠ 碰了 use-video-composer.ts（与 @视频N chip worktree 未来合并留意）。**V-3（管理素材面板取代 DepartmentStrip + 只送已引用）已 commit（本批，全绿 393/3202）**：新建 `ReferenceManagerPanel`（已引用条 + 管理素材抽屉 ResponsiveDialog + 4 类型 tab + 搜索 + 行状态/⋮）取代 `DepartmentStrip`（连同 test 删除）；`filterReferencedImages` 只送已引用（两道迁移护栏：无已知名 / prompt 无可命中 @token → 维持全送不静默丢）；`imageIndexByName` 对收窄集重编号保证 body `@ImageN` 与实发位置对齐；prompt 下计数「已引用 N/已连接 M·字数」。⚠ 待 owner 拍板：镜头 tab 是否拆出「动作」独立 tab（现把 video/keyframe/closeup 并进「镜头」，设计稿 §11 决策1）。Seedance 事实补核（设计稿 §0）：多图=多槽、图音靠同名绑定（现设计已做到）、多角色 lipsync 弱项。遗留：@视频N i18n 不对称（chip 处理中）。**S5e 设计稿待拍板；S6 排队**。遗留：新手势单测偏薄、closeup 未隐藏、♪徽章语义双源、shotText/工具条冗余（S6）。剧本笺挂账；任务包战役结束统一归档。⚠ 首页视觉基线当前 fail 与 S1 无关：assistant-ux 在飞批删了 globals.css 的 Satoshi @import 致字体回退，该批收口时处理。同日全项目审计拍板：音乐=ElevenLabs Music v2（待排期）；UI 小伤四条清单挂起。
- **文档标准重建三批全部完成（2026-07-10）**：批 1 骨架+迁移 · 批 2 references 十二篇 · 批 3 scenes 九篇（专属 5 问逐篇过审）+ templates 代码骨架 ×4（真实样例抽取）+ CLAUDE.md（287→约 100 行）/ AGENTS.md（2016→约 40 行）激进瘦身成路由。**整个重建是一个完整切片，待 owner 确认后 commit。**z+
- 待 owner 拍板/启动：Seedream 5.0 接入建议表（model-catalog.md）· 三个 Sonnet 任务 chip（Satoshi 清理 / hydration 修复 / 三篇文档校验+周检基线）· dependabot 分流（#204/#201 不能合，#200/#202/#203 测绿可合）。
- 在飞任务包（plans/）：Comfy runner（RunPod）· 画布重构（ScriptDoc+autospawn 引擎）· 音频域 Phase A · 节点收敛方案 B。
- UI 改版（工坊宅邸 E+F）：大致方向已入 brand-dna，深挖与概念稿等 owner 启动改版时再做；过渡期守 v1 现状。

## Next

- Finish E2 extraction for the remaining video/audio generation orchestration, then run S6 owner visual QA (history placement, empty-state illustration, responsive canvas/assistant rail) and a real Fish provider request.
- 画布 G0：Claude/Fable 输出一张同屏模块板（当前冲突、W0/S1 背景、助手收展、对象选中、I/V/A 最小线路）；owner 目验后拆 W0 与 S1，不先并行改图片/视频/声音。
- owner 核对后 commit 文档重建切片。
- 模型月审下次 2026-08 初（model-catalog.md）。

## Blocked

- 无。

## Recently Changed

- 2026-07-10 文档体系 v2 完成：WORKFLOW（七步+5 问+路由矩阵+Commit/Push 规则）· brand-dna（工坊宅邸大致方向+过渡期规则）· forbidden（AVOID/PREFER ×7 域）· checklists ×4 · scenes ×9 · references ×13（含 model-catalog 月审与 cicd 排障手册）· templates ×5 · CLAUDE.md/AGENTS.md 瘦身。旧文档：拍板决策在 archive/，全量可从快照 `cddc4384` 找回。
- 产品四项重核：双轨用户 / 北极星=画布+LoRA 双核 / 3D 搁置（远期=导演台 3D 镜头控制）/ Arena·Storyboard 等图片 LoRA 完善。
