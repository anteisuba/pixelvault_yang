# PixelVault 总逻辑思维导图

> 核对日期：2026-09-23（首轮 09-20）。代码基线：`5e422f97`（= origin/main = 生产）；本轮仅改文档，其他会话的 Worker 依赖修改保留。
> 来源：[Claude 生成方向图](https://claude.ai/artifact/AGugEALDdyBLHMqDeNjaTD)全部 19 页、86 张画板（09-20 首轮为 18 页 / 85 张），以及实际路由 / 组件 / 服务 / Prisma。逐项证据见 [18 页核对报告](../design/roadmap-canvas/research/audit-18-pages-2026-09-20.md)。覆盖全部画板不代表每项外部契约或运行效果通过。
> 本文维护整体关系；[当前进度图](../status.md#总进度图2026-09-23-读码核对)维护进度。原始需求与参考图保留在 §3。

## 1 · 总逻辑思维导图

```mermaid
flowchart TB
  PV["PixelVault · 个人 AI 创作工作台"]
  PV --> CORE["双核创作"]
  PV --> CAP["生成与编辑能力"]
  PV --> REUSE["资产与知识复用"]
  PV --> PUBLIC["选择性公开展示"]
  PV --> BASE["共享基础设施"]
  CORE --> CANVAS["画布 /studio/node
剧本 → 镜头 → 多模态节点 → 剪辑台"]
  CORE --> LORA["LoRA /studio/lora
发现 → 配方 / 挂载 → 生成 → 训练 / 我的"]
  CAP --> IMAGE["图片
自然语言 /studio/image
标签 /studio/image/tags"]
  CAP --> VIDEO["视频 /studio/video
短片生成 / 参考素材"]
  CAP --> AUDIO["声音 /studio/audio
台词 / 音色 / 配音"]
  CAP --> THREED["3D /studio/3d
图生模型；远期机位控制另议"]
  CAP --> EDIT["图片编辑 /studio/edit
现有工具；编辑线重整待做"]
  REUSE --> ASSETS["素材库 /assets
归档 / 上传 / 文件夹 / 详情复用"]
  REUSE --> CARDS["卡片 /cards
角色 / 风格 / 背景 / 音色关联"]
  REUSE --> PROMPTS["配方 /prompts
当前仍有个人与灵感双页签"]
  PUBLIC --> HOME["首页 HomeV4
展示能力 → 创作入口"]
  PUBLIC --> GALLERY["画廊 /gallery + 主页 /u
公开作品 / 配方发现"]
  BASE --> ASSIST["统一助手
看 / 查 / 问 / 改 / 请求生成
工作台、画布、LoRA；记忆进设置"]
  BASE --> CONFIG["设置 /settings
key / 用量 / 偏好 / 助手
账号菜单共享语言与设置入口"]
  BASE --> EXEC["鉴权 / 校验 / 任务派发
Execution Worker → provider 或 Runner"]
  BASE --> STORE["Prisma 数据关系 + R2 媒体归档
计费 / 权限 / en-ja-zh"]
```

### 核心闭环与尚未打通的连接

实线表示当前存在的主要产品路径；虚线表示仍需补齐的目标连接。存在实现不等于本轮运行验收。

```mermaid
flowchart LR
  INPUT["提示词 / 参考素材 / 配方"] --> WORK["工作台或画布
选择模型与渠道"]
  WORK --> CONFIRM["用户确认生成"]
  CONFIRM --> JOB["服务端任务 → Worker / Runner"]
  JOB --> RESULT["结果 → R2 / 数据库归档"]
  RESULT --> ASSET["素材库"]
  ASSET --> INPUT
  RESULT --> SHARE["用户选择公开 → 画廊"]
  SHARE --> INPUT
  CARD["角色 / 风格 / 音色卡"] -. "完整 referenceSlots 总线待补" .-> WORK
  SCRIPT["剧本文本节点"] --> SHOTS["确认投影 → 镜头节点"]
  SHOTS --> WORK
  RESULT --> DESK["剪辑台 → 渲染导出 → 成片"]
  ASSIST["统一助手"] --> WORK
  ASSIST -. "时间线提案回传待接" .-> DESK
```

## 2 · 与线上文档的关键差异

| 线上位置 / 旧表述                                             | 当前代码事实                                                                      | 应如何标记 / 依据                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 进度表“现在停在 E1 ④”                                         | 同一张表 E2 / E3 已完成；代码有共享选择器与设置页                                 | 顶部游标已过时；[MainModelPicker](../../src/components/business/studio-shared/pickers/MainModelPicker.tsx)、[SettingsAssistantSection](../../src/components/business/settings/SettingsAssistantSection.tsx)                        |
| 66 / D10“等 ⑤”，44 仍等 D2                                    | 标签台路由、两栏编辑、官方标签补全、V4.5 精确角色参考已有实现；PixAI 09-20 下架   | 代码已落，完整验收待核；[标签编辑器](../../src/components/business/studio/tags/StudioTagsPromptArea.tsx)、[标签控件列](../../src/components/business/studio/tags/StudioTagsControlColumn.tsx)，提交 `6cd58d85` 起                  |
| 70 / D11“等 ⑤”；14 仍描述顶部头像 + 底部设置                  | AccountMenu 已接入侧栏底部与手机，包含语言 / 设置 / 退出                          | D11 代码已落，14 是已被替代的旧设计；[AccountMenu](../../src/components/layout/AccountMenu.tsx)、[AppSidebar](../../src/components/layout/AppSidebar.tsx)，提交 `4a698785`                                                         |
| 13“记忆只有空态”；56 又记录记忆已实现                         | AssistantMemory 模型、读写服务、每轮写入 / 下轮注入与设置列表均已有               | 文档内部矛盾；代码已落，迁移 09-20 已应用（生产站与本地共用 Neon development 分支），运行验收未核；[记忆服务](../../src/services/assistant-memory.service.ts)、[助手服务](../../src/services/kernel/assistant-operator.service.ts) |
| 第 6 页以独立 node-assistant 为“现状”，并把配音间列为助手宿主 | 画布使用 StudioOperatorDock；统一宿主已调整；配音间不挂助手                       | 区分早期比较稿与现行方案；[NodeWorkbenchV4](../../src/components/business/node/workbench-v4/NodeWorkbenchV4.tsx)、[助手现行规范](pages/assistant-shell-v2.md)                                                                      |
| 第 6 页“VoiceCard 与 CharacterCard 零关联”                    | CharacterCard 已有 voiceCardId、voiceProfile、persona、referenceRoles、provenance | 字段 v2 已落；完整编译与 v3 的 summary / relations / lore 仍不能算完成；[schema](../../prisma/schema.prisma)                                                                                                                       |
| 37 剪辑台“等 spec”                                            | 已有时间线 UI、提交 / 轮询 / 取消接口、render-video Worker 与完成回画布逻辑       | 部分落地；[导出生命周期](../../src/components/business/node/edit-desk/use-edit-desk-render.ts)、[渲染 Worker](../../workers/render-video/src/index.ts)                                                                             |
| 剪辑台“一句话排片”容易被读作已闭环                            | 当前请求只送助手，没有 TimelineProposal 生产者                                    | 明确列为缺口；[助手排片请求](../../src/hooks/node/use-canvas-operator-requests.ts)                                                                                                                                                 |
| E7 总结仍写 33 → 34；34 明细已完成                            | 训练分支已抽出 TrainWizard，仍在 LoRA 的 section=train 内                         | 34 的拆分已落，不能误写成新增独立路由；[TrainWizard](../../src/components/business/studio/lora/training/TrainWizard.tsx)                                                                                                           |
| E9 仍是“首页 B 等设计”                                        | 首页入口使用 HomeV4Shell；B 已撤回，09-22 又去掉 v4 的前后景错速                  | 不应继续推进已撤回的 B；[HomeV4Shell](../../src/components/business/home-v4/HomeV4Shell.tsx)                                                                                                                                       |

仍一致的主要缺口：35 卡片总线未贯通；Prompts 仍有 InspirationGrid；剪辑台助手排片回程未接。剧本投影已有 ScriptCardBody 与 project_script，不能把“卡片总线未做”扩大成“剧本节点完全未做”。[剧本卡](../../src/components/business/node/nodes/v4/text/ScriptCardBody.tsx)

### 文档编辑边界

本地 [画板生成源码](../design/roadmap-canvas/gen/build-progress.mjs)可编辑。09-23 已按[既有流程](../design/roadmap-canvas/README.md)以线上最新版为底合并并重发（Version 115），回读逐文件一致；线上批注、布局、owner 手绘与第 19 页会话记录均保留。

## 3 · 原始需求与历史对照（保留 owner 原话及参考图）

> 下列“现状”主要来自 2026-07 / 08，不是本轮进度结论；过时描述以 §2 的代码证据及 `../status.md` 为准。保留是为避免把尚未实现的产品意图当作过时内容删除。

### 🏠 首页 / 展示　🔧

- 🎯 你想做：UI 升级；每个介绍面板升级；整体布局升级；展示公开资源。参考 Haivis 官网拆解（已随 ui-inspiration 清理删除，见 git 历史；你喜欢的登录页 UI）。
- 📍 现状：首页「白厅画廊」已成型——整页米白 + 头尾暗书挡（hero/footer）+ 6 个真功能两栏交替（图/视频/音频/画布/LoRA/图生3D）+ 深窗 Step1–4 流程。组件 `HomepageCapabilityMatrix` / `HomepageMenu` / `HomepageRevealMotion` / `CapabilityForm`；登录 `AuthPageShell`。
- 💡 衔接：haivis-landing 你已标注（2026-07-13）——**登录改 modal 窗**、元素拆分/前后对比/文字图层/魔法擦除的**动效语法 = 喜欢**；纯黑大衬线 + 超大留白 = 仅参考。施工落点已指向 `docs/references/pages/home.md`。"展示公开资源"可复用 Gallery 公开 feed 的作品做证据。
- 登录状态
- ![](assets/project-map/homepage-01.png)
- ![](assets/project-map/homepage-02.png)
- ![](assets/project-map/homepage-03.png)
- ![](assets/project-map/homepage-04.png)![](assets/project-map/homepage-05.png)
- ![](assets/project-map/homepage-06.png)我喜欢这种左侧放入矢量动画，css，svg动画的设计。
  ![](assets/project-map/homepage-07.png)
- ![](assets/project-map/homepage-08.png)
- ![](assets/project-map/homepage-09.png)
-

### 🎬 画布　🔧

- 🎯 你想做：学习 haivis 画布工作区；整理初始状态；功能明确分化——助手、编辑图片、生成视频、管理资源（卡片收集一个角色的图片/声音）。
- 📍 现状：节点按模态收敛为 5 类；助手=剧本脑→ScriptDoc→autospawn 投影节点；两阶段脚本流（大纲→镜头）引擎已落、**UI 两道门待做**；cast v2（缩略图/特写/自动编号/视频引用）已交付；视频汇点用 Seedance reference。services `node-workflow`/`script-breakdown`/`story`；核心状态 `studio-context.tsx`（47 files 高风险）。
- 💡 衔接：haivis-canvas 你已确认整套 CSS/助手布局作为**画布重构对标**（大画布 + 可收起固定右助手 / 选中对象近场工具条 / 附件·模态·模型·思考独立披露）。落点 `docs/references/pages/node-canvas-v2.md`。你说的三件事分别落到：**编辑图片**→图片域迁移/编辑能力接进画布；**生成视频**→视频汇点(已有)；**管理资源(卡片)**→卡片×资产融合（见下）。
- 图片可以直接粘贴。![](assets/project-map/canvas-01.png) -点击图片后上面出现编辑框 ![](assets/project-map/canvas-02.png)
- ![](assets/project-map/canvas-03.png)
- 整体风格![](assets/project-map/canvas-04.png)
- 左侧工具栏以及玻璃透明质感![](assets/project-map/canvas-05.png)
- ![](assets/project-map/canvas-06.png)
- 助手框![](assets/project-map/canvas-07.png)
- ![](assets/project-map/canvas-08.png)
- ![](assets/project-map/canvas-09.png)
- ![](assets/project-map/canvas-10.png)
- ![](assets/project-map/canvas-11.png)
-

### 🧬 LoRA　🔧

- 🎯 你想做：参考 novelai 升级生成页；检索功能（人物 lora / 衣服 lora / 表情 lora …）；生成时自由搭配组合 lora。
- 📍 现状：已拆独立域（/studio/lora：生成/训练/库[公开|我的]）；recipe-first（还原 + 定制）；**多 LoRA 混挂 + 配方面板是现状已有**（别重造）；danbooru 词库 + prompt-tag 引擎；runner（RunPod ComfyUI）已上线、底模按需下载；搜索走 multi-search。
- 💡 衔接：你要的"自由搭配组合"——多挂已有基础，**缺的是按类型（人物/衣服/表情）检索的分类标签 + 组合 UI**。NovelAI 方向明确。当前业务收口施工图见 `docs/references/pages/lora-workbench.md`；旧评审 LoRA 域 UI review v1（已随 archive 清理删除，见 git 历史） 仅作历史依据，未来视觉需重新走域级确认。
  ![](assets/project-map/lora-01.png)
- ![](assets/project-map/lora-02.png)
- ![](assets/project-map/lora-03.png)
- ![](assets/project-map/lora-04.png)
- ![](assets/project-map/lora-05.png)
- ![](assets/project-map/lora-06.png)
- ![](assets/project-map/lora-07.png)
- ![](assets/project-map/lora-08.png)
- ![](assets/project-map/lora-09.png)
- ![](assets/project-map/lora-10.png)
- ![](assets/project-map/lora-11.png)
  ![](assets/project-map/lora-12.png)
  ![](assets/project-map/lora-13.png)

### 🖼 图片　🔧（后端比你以为的多）

- 🎯 你想做：升级 UI（方向未定）；服装迁移 / 动作复刻 / 图片设计 / 画风迁移；图片标注（框选标注改哪里，精确修改）。原话："这些目前还想不到怎么去设计"。
- 📍 现状：**迁移套件后端已建骨架**——`image-transform.service.ts` 是 5 维度策略：**画风迁移(style) ✅、动作复刻(pose) ✅ 已实现**；服装迁移(garment)/背景/细节 = schema 已预留、目前返回 501 待实现。另有 inpaint/outpaint 编辑器、**元素拆分**（`extracted-element` service）、KeepChange、变体网格。⚠ 图层分解（See-Through / `LayerDecomposePanel`）已于 2026-08-18 整条删除（owner：功能废弃），Studio 入口、画布能力、service、API 全部不在了。constants `transform-dimensions` / `style-presets` / `edit-tasks`。
- 💡 衔接：所以动作复刻/画风迁移**不用从零设计，后端已通、缺入口 UI**；服装迁移只差实现一个 handler（架构位已留）。"图片标注"你之前设想过（框选区域+挂注释·DevTools 检查器式·编号框上图+指令进 prompt），可直接从那个设想起步——正好呼应 haivis"图上叠交互证据"。

### 🎙 声音　🔧

- 🎯 你想做：最需要升级情感表达；UI 特定化升级。
- 📍 现状：VoiceCard 角色声音库（可绑 CharacterCard）；services `audio-reference` / `fish-audio-voice`；`AudioTranscribeDialog` / `StudioAudioFeedback`。
- 💡 衔接：**情感表达已有施工基准** `domains/audio.md`（audioKind 属性 / 情绪默认有意图→Creative 无→Natural；**Phase A 情绪见效最先**）。你这条和已拍板方向完全一致，可直接进 Phase A。
  ![](assets/project-map/voice-01.png)![](assets/project-map/voice-02.png)
  ![](assets/project-map/voice-03.png)

### 💡 提示词　🔧（产品边界已重定，待 UI 试点）

- 🎯 你想做：收敛为个人配方工作区；删除“我的模板/共享提示词库”双层级；把类型导航放到最上层，以 `/prompts/image`、`/prompts/video`、`/prompts/lora`、`/prompts/audio` 独立路由承载各自配方结构；进入类型页先找和复用已有配方，新建/编辑居次。
- 📍 现状：`/prompts` 仍是 Recipe 模板 + `InspirationPrompt` 灵感库双 Tab；共享库、clone API/service/hook 和公开 Recipe merge 均仍在运行，尚未删除。
- 💡 衔接：公共配方发现并入 Gallery；Prompts 只保留草稿、从 Gallery 保存、编辑、版本、标签、作品血缘和送往创作域。后续删除范围与未决项见 `domains/prompts.md`；进入 UI 设计时按 `../scenes/ui-page.md` 单独启动该域流程。
- 🧭 设计边界：Image / Video / LoRA / Audio 不是通用配方表单的四个筛选态，而是四份独立契约；例如 Image 只负责 Prompt / Negative Prompt，不出现 LoRA 参数。

### 🃏 卡片　✅（域已完整）

- 🎯 你想做：（你在画布/资产里提到）角色收集容器——一个角色的图片、声音等聚在一起。
- 📍 现状：Cards 域已很完整——`character-card`(角色一致性) / `style-card`(画风) / `background-card`(背景) / `card-recipe`(配方) 四类 service + scoring + refine + cardify；大量组件（`CharacterCardManager` / `StyleCardManager` / `CardifyPreview`）。
- 💡 衔接：你说的"卡片收集角色的图/声音" + "文件夹和卡片融合"是**同一个设想**——把角色卡升级成"一个角色的图/视频/音频/3d 聚合容器"。见资产分支。

### 📦 资产 / 素材库　✅（大体完成，缺架构升级）

- 🎯 你想做：大体完成；文件夹和卡片融合管理；一个文件夹装一个角色的图/视频/音频/3d；再用场景或项目包含这些卡片。
- 📍 现状：私有素材库（浏览/上传/文件夹/批量/详情复用）；services `collection` / `project`；四模态（图/视频/音频/3d）。P0 待办=检索露出 + picker 场景化重设计（`assets-optimization` 调研）。
- 💡 衔接：你的信息架构设想 = **三层聚合：角色卡（聚合一个角色的多模态素材）→ 场景/项目（聚合多张卡）**。现状 collection/project/cards 是分开的，融合它们是一个跨 **卡片×资产×画布** 的架构升级，值得单独拉一张施工图。

### 🌐 展示 / 画廊　✅

- 🎯 你想做：优化 UI；承接公开作品自带配方的发现与复用；可能做社区管理。
- 📍 现状：公开 feed + 详情（gallery）；Profile 创作者主页（/u）；follow/like service；`GalleryAdvancedFilters` / `GalleryFilterBar`。
- 💡 衔接：公共单位仍是作品/图集，Prompt、模型、参数、seed、LoRA 等作为经授权清洗的作品配方展开、比较和复用；Prompts 不再另做公共 feed。⚠ "社区管理"仍不是当前主定位。

### ⚙ 底座（全域共享，你没提，仅登记）

- Providers ×10 · Runner(ComfyUI/RunPod) · R2 归档 · Clerk/Credit/i18n · model-router/model-health。一般不作为需求域，除非要动模型阵容或执行架构。

> **次要域**（Storyboard 分镜 / 3D）：你这次没提，按 `product.md` 是 gate 住的（图片和 LoRA 完善后再推），先不展开。

---

## 变更记录

| 日期       | 变更                                                                                                                | 谁            |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-07-16 | 建立协作骨架                                                                                                        | Claude        |
| 2026-07-16 | owner 填 6 域想法                                                                                                   | owner         |
| 2026-07-16 | 补 提示词/卡片 分支 + 各域现状核实扩充（读 haivis 双文档 + 核实 image-transform 等代码）                            | Claude        |
| 2026-07-19 | Prompts 收敛为个人配方工作区；共享提示词发现并入 Gallery，独立共享库与 `InspirationPrompt` 链路列入后续删除         | owner + Codex |
| 2026-08-08 | 36 张内嵌图从 `docs/` 根移进 `assets/project-map/`，按域重命名；`![[…]]` 全改标准相对路径（原写法只有 Obsidian 认） | Claude        |
