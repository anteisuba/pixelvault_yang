# 05 · 后续计划 / 能力扩展 / 视频剧本

> 范畴：AI 辅助视频创作全链路 — 主题输入 → 结构化剧本 → 分镜图 → 视频 clip → 拼接导出。
>
> Status note：本目录属于**未来能力规划层**，不是当前代码现状层。判断当前代码，请优先回到 `01-UI / 02-功能 / 03-功能測試 / 04-UI測試`。

## 文件总览

| 文件                         | 作用                                     |
| ---------------------------- | ---------------------------------------- |
| `README.md`（本文件）        | L2 拆解 + 文件导览                       |
| `视频剧本-路线决策结论书.md` | 8 个核心决策固化（不可随意翻案）         |
| `03-工作包细分-Phase0.md`    | Phase 0（Video UI 对齐 image）详细工作包 |
| `02-现状映射.md`             | Phase 0 完成时的历史基线快照             |

后续预留：

- `Phase 1+` 工作包文档尚未创建，待剧本后端真正启动时再补。

## L2 拆解

### 5.1 前置：Video UI 布局归一（Phase 0 · v3）

> 📋 范围演变：
>
> - v1 误判 video 与 image 共组件树 → 废弃
> - v2 实作"视觉语言归一"（token grooming）→ 已合入，但实际仍空间浪费
> - **v3（当前）**：Video 迁到 `StudioFlowLayout`（canvas + dock + gallery），与 image mode 真正一致

v3 WPs：

- 5.1.1 StudioWorkspace 移除 video 短路
- 5.1.2 StudioFormState 扩展 video 字段（duration / resolution / longVideo）
- 5.1.3 StudioPromptArea 三模式分叉
- 5.1.4 StudioVideoParams 新 panel
- 5.1.5 Toolbar 三模式矩阵
- 5.1.6 StudioCanvas remix/edit outputType 保持
- 5.1.7 Long Video toggle 集成
- 5.1.8 弃用 VideoGenerateForm
- 5.1.9 手工 QA 矩阵

### 5.2 剧本生成后端（Phase 1）

- 5.2.1 Prisma `VideoScript` + `VideoScriptScene` 模型
- 5.2.2 `video-script.service`（LLM 结构化剧本生成）
- 5.2.3 场景反推算法（按总时长 → 场景数 → 每场景 duration）
- 5.2.4 API `POST /api/video-script` + `PATCH /api/video-script/[id]`
- 5.2.5 Studio 内 `StudioScriptPanel` UI

### 5.3 分镜图生成（Phase 2）

- 5.3.1 `generateSceneFrames` 并行编排
- 5.3.2 主体一致性路径选择（Character Card 路径 · 首帧 ref 路径）
- 5.3.3 复用 `recipe-compiler.service`
- 5.3.4 UI：`SceneFrameGrid` + 单格 Retry/重生/切卡

### 5.4 视频 Clip 生成（Phase 3）

- 5.4.1 2 Provider 选型（Seedance 2.0 Fast · Kling Pro）
- 5.4.2 i2v：分镜图作为 reference + scene.action 作为 motion prompt
- 5.4.3 复用 `video-pipeline.service` 的 clip 状态机
- 5.4.4 UI：`SceneClipGrid`

### 5.5 拼接导出（Phase 4）

- 5.5.1 拼接方案选型（WebCodecs 客户端 · FFmpeg 服务端）
- 5.5.2 转场策略（Phase 4 仅 cut-to-cut · Phase 5+ 淡入淡出）
- 5.5.3 MP4 落 R2 + Gallery 归档

---

## 与现有体系的关联

| 本能力依赖     | 现有实现                                                                |
| -------------- | ----------------------------------------------------------------------- |
| 剧本 LLM       | `llm-text.service` + `llm-output-validator`                             |
| 分镜图生成     | `recipe-compiler.service` + `generate-image.service`（完全复用）        |
| 视频 clip 生成 | `generate-video.service` + `video-pipeline.service`（复用 clip 状态机） |
| 存储           | `storage/r2.ts`（复用）                                                 |
| 计费           | `usage.service` + FREE_TIER（复用）                                     |
| Studio 入口    | Studio `outputType = 'video'` 分支下扩展                                |

**不新增**：独立路由、独立计费模型、独立 provider adapter 层。

---

## 不在本能力域的项

- 独立 `/script` 路由（参考功能结论书 F19 RF17）
- Dark mode（参考 UI 结论书 D11）
- 视频 Gallery 交互增强（属 EP-5）
- LoRA 训练素材管理（属 F20 Parked）
