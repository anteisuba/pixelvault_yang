# 05 · 后续计划 / 能力扩展 / 视频剧本 — Phase 0 工作包细分（布局归一）

> 基准日期：2026-04-18 · 基于远端 HEAD `33099e8` + 本地已合并的视觉 token 归一
>
> Status note：本文件记录的是**已完成的 Phase 0 规划与执行切分**，现在应作为历史实现说明，不应再被当成当前待办清单直接复用。
>
> 本文件经过两次修订：
>
> **v1（已废弃）**：误判 video 和 image 共享组件树，拆出 14 处"差异"，9 处无效。
>
> **v2（已部分完成）**：理解为"视觉语言归一"，只改 VideoGenerateForm 的视觉 token（圆角/边框/表面/label/间距）。已完成，提交在 PR1-3。
>
> **v3（本文件）**：实际需求是"**布局归一**" — Video mode 的表单式布局浪费横向空间，要迁移到 image mode 的 `StudioFlowLayout`（canvas + bottom dock + gallery）。本文件重写 WP，把 v2 工作作为前置收尾，主体是布局迁移。

---

## 0. 当前进度（v2 遗留）

已落地、不需要重做的：

| WP（v2）    | 内容                                                                              | 状态      |
| ----------- | --------------------------------------------------------------------------------- | --------- |
| WP-V0-01~05 | VideoGenerateForm 视觉 token 归一（rounded / border / surface / padding / label） | ✅ 已合入 |
| WP-V0-06    | StudioGallery Remix outputType 保持                                               | ✅ 已合入 |
| WP-V0-07    | StudioCommandPalette 三模式切换                                                   | ✅ 已合入 |

**v2 遗留价值**：

- 若布局迁移完成后 `VideoGenerateForm` 被弃用，v2 的视觉归一"白做"，但零损害
- `StudioGallery.handleRemix` 和 `StudioCommandPalette.switchMode` 的三模式支持 **仍然有效**，为 v3 提供基础

---

## 1. v3 目标与非目标

### 目标（In Scope）

1. 移除 `StudioWorkspace.tsx:81-97` 的 video 短路分支，video 也走 `StudioFlowLayout`
2. 让 `StudioPromptArea` 支持三模式（image / video / audio）
3. 把 video 专属参数（duration / resolution / negativePrompt / long video toggle / target duration）迁到 Studio context + 新 panel
4. 让 `StudioToolbarPanels` 按 outputType 动态显隐按钮（image / video / audio 各自矩阵）
5. 修复 `StudioCanvas.handleRemix` / `handleEdit` 的硬编码 outputType（与 v2 WP-V0-06 同类型但在另一个文件）
6. 弃用 `VideoGenerateForm` / `VideoFormSettings`（`VideoGenerationProgress` 的 stage + PipelineProgress 组件要保留并搬到 dock 上）

### 非目标（Out of Scope）

- **不动** `useGenerateVideo` / `useGenerateLongVideo` / `useUnifiedGenerate` 的生成逻辑（已经支持 video）
- **不动** video provider adapter / service 层
- **不新增** video 模型或 provider
- **不改** GenerationPreview（已支持三 outputType）
- **不改** Gallery / Profile 页面
- **不动** image / audio mode 现有行为

---

## 2. 关键架构发现

扫描后的事实（决定本阶段的 WP 拆分）：

| 发现                                                                                                         | 影响                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `useUnifiedGenerate.generateVideo` L223 **已经存在**，通过 `generate({ mode: 'video', video: {...} })` 路由  | 不需要重写生成逻辑，只需让 PromptArea 正确调用          |
| `GenerationPreview` 已识别 `outputType === 'VIDEO'` 并渲染 `VideoPlayer`（L319）                             | StudioCanvas 下的预览对 video 自动工作                  |
| `StudioFormState` **没有** videoDuration / videoResolution / negativePrompt / longVideoMode 字段             | 需要扩展 reducer                                        |
| `StudioCanvas.handleRemix` L70 + `handleEdit` L99 硬编码 `outputType: 'image'`                               | 与 StudioGallery 同类 bug，v2 只修了 Gallery            |
| `StudioBottomDock` L42/L77 的 `StudioCardSection` 门控是 `workflowMode === 'card' && outputType !== 'audio'` | video mode 会显示 card section — 视情况决定保留还是隐藏 |
| `VideoGenerateForm` 的 character card apply 走的是**内部 state**（`selectedAppliedCardIds`）                 | 迁移时需要改走 `useStudioData.characters`               |
| `VideoGenerateForm` 的 negative prompt 是**内部 state**                                                      | 迁移时应并入 StudioFormState.advancedParams             |
| `useGenerationForm` hook 管理 video 的 prompt / aspectRatio / refImage                                       | 迁移后应统一到 StudioFormContext                        |

---

## 3. 工作包索引

| ID        | 标题                                                   | Priority | Effort | 文件数 |
| --------- | ------------------------------------------------------ | -------- | ------ | ------ |
| WP-V0-L01 | StudioWorkspace 移除 video 短路，全走 StudioFlowLayout | **P0**   | S      | 1      |
| WP-V0-L02 | StudioFormState 扩展 video 字段                        | **P0**   | M      | 2-3    |
| WP-V0-L03 | StudioPromptArea 三模式分叉 + 生成路由                 | **P0**   | M      | 1      |
| WP-V0-L04 | StudioVideoParams 新 panel + Toolbar 按钮              | **P0**   | M      | 3-4    |
| WP-V0-L05 | Toolbar / CardSection 三模式矩阵                       | P1       | S      | 3      |
| WP-V0-L06 | StudioCanvas remix/edit outputType 保持                | P1       | S      | 1      |
| WP-V0-L07 | Long Video toggle 集成到 StudioVideoParams             | P1       | S      | 1      |
| WP-V0-L08 | 弃用 VideoGenerateForm + VideoFormSettings             | P1       | S      | 2-3    |
| WP-V0-L09 | 手工 QA：三模式切换 × 生成链路 × 历史回溯              | **P0**   | M      | 验证   |

**共 9 WP** · P0×5 · P1×4 · Effort S×5 / M×4 · 预估 **3-5 天**完成

**推荐执行顺序**（严格串行，每步可运行验证）：

```
L01 → L02 → L03 → L04 → L06 → L05 → L07 → L08 → L09
```

---

## WP-V0-L01 · 移除 video 短路，走 StudioFlowLayout

### Goal

`StudioWorkspace.tsx:81-97` 的三元判断改为统一走 `StudioFlowLayout`。Video mode 开始时会显示空白 canvas + 空 dock（后续 WP 逐步填）。

### Current Code

```tsx
// StudioWorkspace.tsx L81-97（当前）
{state.outputType === 'video' ? (
  <div className="flex-1 overflow-y-auto p-5">
    <div className="mx-auto max-w-3xl space-y-4">
      <VideoGenerateForm activeCharacterCards={characters.activeCards} />
    </div>
  </div>
) : (
  <StudioFlowLayout canvas={...} dock={...} gallery={...} />
)}
```

### 目标代码

```tsx
<StudioFlowLayout
  canvas={<StudioCanvas />}
  dock={<StudioBottomDock />}
  gallery={<StudioGallery />}
/>
```

### Files to Modify

- `src/components/business/StudioWorkspace.tsx`（删 video 分支 + 删 `VideoGenerateForm` 动态 import）

### Acceptance

- Image / Audio mode 无任何回归（截图对比）
- Video mode 进入时看到 canvas + dock 壳（功能性空）
- `pnpm typecheck` 无错误

### Priority / Effort

**P0 · S**

---

## WP-V0-L02 · StudioFormState 扩展 video 字段

### Goal

把 video 专属参数从 `VideoGenerateForm` 的内部 state 迁到 StudioFormContext，让 PromptArea / 新 panel 可以 dispatch。

### 新增字段

```ts
// src/contexts/studio-context.tsx StudioFormState
videoDuration: number // default: VIDEO_GENERATION.DEFAULT_DURATION
videoResolution: string | null // default: null (use provider default)
longVideoMode: boolean // default: false
longVideoTargetDuration: number // default: 30
```

**negativePrompt**：建议复用 `state.advancedParams.negativePrompt`（已有通用字段），不再新增专字段。

### 新增 actions

```ts
| { type: 'SET_VIDEO_DURATION'; payload: number }
| { type: 'SET_VIDEO_RESOLUTION'; payload: string | null }
| { type: 'SET_LONG_VIDEO_MODE'; payload: boolean }
| { type: 'SET_LONG_VIDEO_TARGET_DURATION'; payload: number }
```

### Files to Modify

- `src/contexts/studio-context.tsx` — state + action + reducer
- `src/contexts/studio-context.test.tsx` — mock 更新
- 可选：`src/types/index.ts` — 若有 StudioFormState 类型导出则同步

### Acceptance

- Context 测试全绿
- 新 action dispatch 可用
- Image / audio mode 下新字段不影响原有行为（有默认值）

### Priority / Effort

**P0 · M**

---

## WP-V0-L03 · StudioPromptArea 三模式分叉

### Goal

`StudioPromptArea` 目前两路分叉（image / audio），扩展为三路。video 模式调用 `useVideoModelOptions` + `generate({ mode: 'video', video: {...} })`。

### 关键改动点

1. 引入 `useVideoModelOptions()` — 注意它需要 `selectedOptionId` 参数（与 image / audio 不同，见 `src/hooks/use-video-model-options.ts:26`）
2. 新增 `isVideoMode = state.outputType === 'video'`
3. `selectedModel` 三路选择：
   ```ts
   const selectedModel = isAudioMode
     ? audioModel
     : isVideoMode
       ? videoModel
       : imageModel
   ```
4. 新增 `buildVideoInput()`（并列 `buildImageInput`）
5. `handleGenerate` 新增 video 分支：
   ```ts
   if (isVideoMode && selectedModel) {
     const video = buildVideoInput()
     await generate({ mode: 'video', video })
   }
   ```
6. `placeholder` 三路切换
7. Variant / Compare split 按钮：video mode 隐藏（暂不支持）
8. Character card apply：video mode 下的"apply"走 StudioCardSection（`state.workflowMode === 'card'`），不需要 PromptArea 内置

### Files to Modify

- `src/components/business/studio/StudioPromptArea.tsx`

### Acceptance

- Video mode 下能选 video model（来自 `getAvailableVideoModels()`）
- 输入 prompt → 点 Generate → 调 `/api/generate-video`
- Image / audio mode 不回归
- `generateVideo` 正常返回 → `GenerationPreview` 渲染 `VideoPlayer`

### Priority / Effort

**P0 · M**

### Risks

- `useVideoModelOptions` 签名与 image / audio 不同（需 selectedOptionId 入参），适配时可能需要改 hook 签名或 wrapper
- Video 首次切入时，`state.selectedOptionId` 可能是 image model id，需要 fallback 到 video 默认

---

## WP-V0-L04 · StudioVideoParams 新 panel

### Goal

创建一个新的 dock panel `StudioVideoParams`，收纳 video 专属参数：Duration / Resolution / Negative Prompt / Long Video toggle / Target Duration。

### 新增文件

- `src/components/business/studio/StudioVideoParams.tsx`（新组件）
- 可能需要：`src/components/business/studio/StudioVideoParams.test.tsx`

### 面板接入流程

1. `src/contexts/studio-context.tsx` 的 `PanelName` 类型：追加 `'videoParams'`
2. `src/components/business/studio/StudioToolbarPanels.tsx`：video mode 下显示"Video"按钮，点击 toggle `videoParams` panel
3. `src/components/business/studio/StudioDockPanelArea.tsx`：新 case 渲染 `<StudioVideoParams />`
4. `src/components/business/studio/StudioPanelSheets.tsx` + `StudioPanelPopovers.tsx`：若在这两处有 panel 映射，同步加
5. `StudioBottomDock` 的 `hasOpenPanel` 计算：追加 `state.panels.videoParams`

### 组件内容（复用现有 UI 基础组件）

```
[Duration]  [3s] [5s] [10s]                   ← OptionGroup
[Resolution] [Auto] [480p] [720p] [1080p]     ← OptionGroup
[Aspect Ratio] 已在 StudioGenerateBar 里，复用 — 这里不重复
[Long Video] [◯ Off]                          ← Switch（模型支持时显示）
   └─ Target Duration: [30s] [60s] [120s]     ← 条件显示
[Negative Prompt] <textarea>                  ← advancedParams.negativePrompt 绑定
```

### Files to Modify

- `src/contexts/studio-context.tsx` — PanelName 追加
- `src/components/business/studio/StudioToolbarPanels.tsx` — 按钮
- `src/components/business/studio/StudioDockPanelArea.tsx` — panel 渲染
- `src/components/business/studio/StudioPanelSheets.tsx` + `StudioPanelPopovers.tsx` — 若有 panel 映射表

### 新增 i18n

- `StudioPage.videoParamsLabel`, `videoDurationLabel`, `videoResolutionLabel`, `longVideoToggle`, `longVideoTargetDuration` 三语

### Acceptance

- Video mode 下点击 Toolbar "Video" 按钮 → panel 展开 → 参数可调
- 选的参数被 dispatch 到 StudioFormState
- 生成时 `buildVideoInput()` 读这些字段

### Priority / Effort

**P0 · M**

---

## WP-V0-L05 · Toolbar / CardSection 三模式矩阵

### Goal

确立并实现 Toolbar 按钮与 CardSection 在 image / video / audio 下的显隐矩阵。

### 显隐矩阵

| 按钮 / 区块     | image |             video              | audio |
| --------------- | :---: | :----------------------------: | :---: |
| enhance         |  ✅   |               ✅               |  ❌   |
| reverse         |  ✅   |               ❌               |  ❌   |
| advanced        |  ✅   |               ❌               |  ❌   |
| refImage        |  ✅   |               ✅               |  ❌   |
| transform       |  ✅   |               ❌               |  ❌   |
| layerDecompose  |  ✅   |               ❌               |  ❌   |
| civitai         |  ✅   |               ❌               |  ❌   |
| aspectRatio     |  ✅   |               ✅               |  ❌   |
| **videoParams** |  ❌   |               ✅               |  ❌   |
| voiceSelector   |  ❌   |               ❌               |  ✅   |
| voiceTrainer    |  ❌   |               ❌               |  ✅   |
| **CardSection** |  ✅   | ✅（仅 character card 有意义） |  ❌   |

### Files to Modify

- `src/components/business/studio/StudioToolbarPanels.tsx` — 按钮列表按矩阵过滤
- `src/components/business/studio/StudioPanelSheets.tsx` — 同步
- `src/components/business/studio/StudioPanelPopovers.tsx` — 同步
- `src/components/business/studio/StudioBottomDock.tsx` L42/L77 — CardSection 门控扩展为三模式策略
- `src/components/business/studio/StudioCardSection.tsx` — video mode 下只显示 character（因 background / style 主要服务于 image 的 recipe-compiler）

### Acceptance

- 三模式切换时按钮显隐符合矩阵
- Video 模式仅显示 enhance / refImage / aspectRatio / videoParams
- 手工验证无 panel 残留（切模式时关闭不兼容 panel）

### Priority / Effort

**P1 · S**

---

## WP-V0-L06 · StudioCanvas remix / edit 保持 outputType

### Goal

v2 WP-V0-06 修了 `StudioGallery.handleRemix` 的硬编码，但 `StudioCanvas.tsx` 有自己的副本（L70 handleRemix · L99 handleEdit），同类 bug 未修。

### Files to Modify

- `src/components/business/studio/StudioCanvas.tsx`

### Concrete Tasks

- L70 `handleRemix`：读 `generation.outputType` → 映射到对应 mode（VIDEO → 'video'，AUDIO → 'audio'，否则 'image'）
- L99 `handleEdit`：仅对 image 有意义（Kontext 编辑是图像专用），video/audio 的 generation 应当 disable / 隐藏 edit 按钮 — 目前 GenerationPreview 已按 `outputType === 'IMAGE'` 门控，无需 StudioCanvas 侧再做

### Acceptance

- Remix 视频 → 切到 video mode + 填 prompt
- Remix 音频 → 切到 audio mode
- Edit 按钮仅对 image 可用

### Priority / Effort

**P1 · S**

---

## WP-V0-L07 · Long Video toggle 集成

### Goal

`VideoGenerateForm` 当前有独立的 Long Video 切换逻辑（L280-322），迁移到 `StudioVideoParams` panel 内。

### Current Code

- `VideoGenerateForm.tsx:103` — `const [longVideoMode, setLongVideoMode] = useState(false)`
- `VideoGenerateForm.tsx:104` — `const [targetDuration, setTargetDuration] = useState(30)`
- `VideoGenerateForm.tsx:64` — `const longVideo = useGenerateLongVideo()`

### 改动

- State 迁入 StudioFormState（WP-V0-L02 已处理）
- `useGenerateLongVideo` 注入 `useUnifiedGenerate` 的 generateVideo path — **注意**：当前 useUnifiedGenerate 的 generateVideo **不支持 long video**，需要扩展
- `generate({ mode: 'video', video: { longVideoMode, targetDuration, ... } })` 内部根据 longVideoMode 路由到 `useGenerateLongVideo.generate()` 或 `submitVideoAPI`

### Files to Modify

- `src/hooks/use-unified-generate.ts` — generateVideo 追加 longVideo 分支
- `src/components/business/studio/StudioVideoParams.tsx` — UI
- `src/components/business/studio/StudioPromptArea.tsx` — buildVideoInput 带上 longVideo 字段

### Acceptance

- Long Video toggle 打开后 Target Duration 可见
- 点 Generate 触发 pipeline 生成
- `PipelineProgress` 正确显示（此处保留 `VideoGenerationProgress` 的 PipelineProgress 渲染逻辑，迁到 canvas 层或 dock 层）

### Priority / Effort

**P1 · S**

### Risk

`useUnifiedGenerate` 是核心组件，改动需谨慎；建议先内部判断 longVideoMode 再转调 `useGenerateLongVideo`

---

## WP-V0-L08 · 弃用 VideoGenerateForm / VideoFormSettings

### Goal

布局迁移完成后，`VideoGenerateForm` + `VideoFormSettings` 没人用了，删除。`VideoGenerationProgress` 的 Pipeline UI 要**保留并迁移**到 StudioCanvas 下的 long video 渲染路径（可能成为 `GenerationPreview` 的新分支，或一个独立组件挂在 canvas）。

### Files to Delete

- `src/components/business/VideoGenerateForm.tsx`
- `src/components/business/video/VideoFormSettings.tsx`
- `src/components/business/video/VideoGenerationProgress.tsx`（内容部分迁移）
- `src/components/business/studio/StudioVideoMode.tsx`（不再被引用）

### Files to Keep / Migrate

- `VideoGenerationProgress` 里的 **PipelineProgress 渲染**逻辑 → 移到 StudioCanvas 或新组件
- `VideoGenerationProgress` 的 **stage 指示器** → 可合并到 GenerationPreview 的 loading 分支

### Acceptance

- grep 全项目无引用到已删除组件
- Long video 生成路径的 pipeline 可视化保留
- `pnpm typecheck` + `pnpm test` 全绿

### Priority / Effort

**P1 · S**

---

## WP-V0-L09 · 手工 QA 验证

### Goal

布局迁移完成后的手工验证矩阵，确保三模式 × 核心链路均无回归。

### 验证矩阵

| 测试项                          | Image | Video | Audio |
| ------------------------------- | ----- | ----- | ----- |
| 模式切换保留 prompt             | ☐     | ☐     | ☐     |
| 模式切换保留 ref image          | ☐     | ☐     | —     |
| Quick / Card workflow 正常      | ☐     | ☐     | —     |
| 生成一次成功                    | ☐     | ☐     | ☐     |
| 生成失败提示                    | ☐     | ☐     | ☐     |
| Remix（从 Gallery / Canvas）    | ☐     | ☐     | ☐     |
| 历史面板显示                    | ☐     | ☐     | ☐     |
| Toolbar 显隐符合矩阵            | ☐     | ☐     | ☐     |
| Character card apply            | ☐     | ☐     | —     |
| Long video pipeline（仅 video） | —     | ☐     | —     |
| 三语（en/ja/zh）无破版          | ☐     | ☐     | ☐     |
| Mobile viewport 无 overflow     | ☐     | ☐     | ☐     |

### Priority / Effort

**P0 · M**

---

## 4. 风险与缓解

| #   | 风险                                                                        | 缓解                                                                                               |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| R1  | `useUnifiedGenerate` 改动影响 image mode                                    | 每次改 useUnifiedGenerate 后立刻跑 `pnpm test`，验证现有测试（`use-unified-generate.test.ts`）全绿 |
| R2  | Long video pipeline 的 UI 挂载点不明                                        | WP-V0-L07 单独评估，决定 canvas-level vs dock-level 渲染                                           |
| R3  | `useVideoModelOptions` 签名不一致                                           | WP-V0-L03 可能需要同步改 hook 接口或 wrap 适配                                                     |
| R4  | 已持久化用户选择切模式时残留（image model id 出现在 video mode）            | 加 `useEffect` 监听 outputType，首次切入时 fallback 到对应默认 optionId                            |
| R5  | 移除 `VideoGenerateForm` 时漏迁功能（如 VideoFormSettings 里 CJK label 等） | v2 的视觉归一工作已清理过一遍，遗漏概率低                                                          |
| R6  | 现有 E2E 测试（若有 video 路径）failed                                      | 先 grep e2e 目录看 video 相关 spec，提前适配                                                       |
| R7  | Character card apply 在 video mode 的行为变化                               | 保留现有语义：character prompt 拼到最终 prompt，第一张 source image 作为 ref image                 |

---

## 5. Phase 0 完成检查（v3 最终）

进入 Phase 1 前全部打勾：

- [ ] WP-V0-L01~L08 全部合入
- [ ] WP-V0-L09 手工 QA 全通
- [ ] `pnpm typecheck` 改动文件 0 错
- [ ] `pnpm test` 479+ 测试全绿
- [ ] 手动访问 `/en/studio` → Video mode 布局与 Image mode 一致（横向填满、canvas 居中、dock 在底）
- [ ] 生成一段短视频成功
- [ ] 生成一段 long video（pipeline）成功
- [ ] Remix 一段历史视频 → 模式正确保持
- [ ] `02-现状映射.md` 刷新

---

## 6. 本文件维护

- v3 生效后，**v1 / v2 部分作为历史记录保留在文件头部**，不单独留文件
- v3 执行中若再次发现架构误读：追加 §修订历史，不另起 v4
- v3 完成后 `02-现状映射.md` 重写，覆盖 Phase 0 最终代码基线
