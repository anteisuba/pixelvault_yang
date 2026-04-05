# Phase 2: Storyboard 4-Shot Coverage System — Implementation Spec

> Estimated: ~4 weeks | Prerequisite: Phase 1, Prep work | ROI: ★★★ (核心差异化)

## Overview

每个场景 (beat) 自动生成 4 个机位 (establishing/medium/closeup/reaction)，卡片系统驱动角色/风格/背景一致性。

---

## 前置准备工作

### Prep A: 提取 `useVideoJobTracker` 共享 hook

**文件**: `src/hooks/use-video-job-tracker.ts`

```typescript
interface UseVideoJobTrackerOptions {
  pollIntervalMs: number
  maxPollAttempts: number
  onPoll: (pollCount: number) => Promise<PollResult>
}
type PollResult = { action: 'continue' } | { action: 'complete'; data?: unknown } | { action: 'fail'; error: string }
interface UseVideoJobTrackerReturn {
  isActive: boolean; elapsedSeconds: number; start: () => void; stop: (error?: string) => void; reset: () => void
}
```

提取后重构 `useGenerateVideo` 和 `useGenerateLongVideo` 使用此 hook。

### Prep B: 添加 `submitIndependentVideoJob` 到 `video-pipeline.service.ts`

Storyboard shots 是独立并行生成（非线性续接），复用现有 `resolveGenerationRoute` + `submitVideoToQueue`，但不创建 Pipeline/Clip DB 记录。

---

## Week 1: Prompt Compiler

### 文件: `src/services/storyboard-prompt-compiler.ts`

纯函数模块，零 DB 依赖，可独立测试。

### 核心类型

```typescript
type ShotType = 'ESTABLISHING' | 'MEDIUM' | 'CLOSEUP' | 'REACTION'
type CameraDirection = 'STATIC' | 'PAN_LEFT' | 'PAN_RIGHT' | 'TILT_UP' | 'TILT_DOWN' | 'DOLLY_IN' | 'DOLLY_OUT' | 'ORBIT' | 'TRACKING' | 'CRANE_UP' | 'CRANE_DOWN'

interface BeatCompileInput {
  character: CharacterCardInput; background: BackgroundCardInput; style: StyleCardInput
  actionDescription: string; cameraDirection: CameraDirection; shotType: ShotType; modelIdOverride?: string
}
interface CompiledShot {
  compiledPrompt: string; referenceImageUrl?: string; modelId: string; usesI2V: boolean
}
```

### 编译逻辑

1. **Shot Framing**: 每种 ShotType 有固定前缀和人物比例描述
   - ESTABLISHING: "Wide establishing shot, full body visible, environment dominant, 24mm"
   - MEDIUM: "Medium shot, waist-up framing, balanced, 50mm"
   - CLOSEUP: "Close-up, face and shoulders filling frame, shallow DoF, 85mm"
   - REACTION: "Reaction shot, over-the-shoulder, face emphasis, 85mm"

2. **参考图选择**: 根据 ShotType 选择最佳 viewType
   - CLOSEUP/REACTION: 优先 front → three_quarter → detail
   - ESTABLISHING/MEDIUM: 优先 side → three_quarter → back
   - Fallback: referenceImages[0] → entries[0].url

3. **I2V 兼容性**: 检查模型 `i2vModelId`
   - 有 I2V: 缩短 characterPrompt（只取第一句），图片作为 referenceImageUrl
   - 无 I2V: 完整 characterPrompt 嵌入 prompt，referenceImageUrl = undefined

4. **最终组装**: framing + camera + character + action + background + style → 逗号连接

### 测试路径 (22 条)

| # | 测试 | 关键断言 |
|---|------|---------|
| 1 | ESTABLISHING + I2V + side image | ref = side URL, 缩短 prompt |
| 2 | CLOSEUP + I2V + front image | ref = front URL |
| 3 | CLOSEUP + I2V + 无 front | fallback chain |
| 4 | T2V-only model | 完整 characterPrompt, ref undefined |
| 5-8 | 4 种 ShotType framing 前缀 | 正确前缀字符串 |
| 9 | 11 种 CameraDirection | 正确摄像机描述 |
| 10-22 | 空字段/长 prompt/override/批量编译等 | 鲁棒性 |

---

## Week 2: DB Schema + Service Layer

### Prisma 新增

3 个枚举: `StoryboardStatus`, `SceneBeatStatus`, `CoverageShotStatus`

3 个模型:

**VideoStoryboard**: id, userId(→User), title, description, styleCardId(soft ref), status, completedBeats, totalBeats, estimatedCost, timestamps
- @@index([userId, isDeleted, updatedAt])

**SceneBeat**: id, storyboardId(→VideoStoryboard), beatIndex, characterCardId(soft ref), backgroundCardId(soft ref), actionDescription, cameraDirection, modelId, status
- @@unique([storyboardId, beatIndex])

**CoverageShot**: id, beatId(→SceneBeat), shotType(ShotType enum), compiledPrompt, referenceImageUrl, modelId, usesI2V, externalRequestId, adapterType, videoUrl, storageKey, generationId, status, errorMessage, timestamps
- @@unique([beatId, shotType])

### storyboard.service.ts

CRUD: create/list/get/update/delete storyboard, add/update/delete/reorder beats, estimateCost

### coverage-orchestrator.service.ts

并发控制:
- MAX_CONCURRENT_PER_USER: 3（全局）
- MAX_PARALLEL_PER_BEAT: 2
- Shot 优先级: ESTABLISHING → MEDIUM → CLOSEUP → REACTION
- Beat 顺序: 按 beatIndex 顺序

核心函数:
- `startStoryboardGeneration`: 编译所有 beats → 创建 CoverageShot 行 → kickoff
- `checkStoryboardStatus`: poll 驱动推进（复用 provider adapter 的 checkVideoQueueStatus）
- `submitNextShots`: 填充可用并发槽位
- `regenerateShot`: 重新编译 + 重置状态
- `lockShot`: 锁定状态，防止误操作

### API Routes (13 个)

```
POST/GET  /api/storyboard
GET/PUT/DELETE  /api/storyboard/[id]
POST  /api/storyboard/[id]/beats
PUT/DELETE  /api/storyboard/[id]/beats/[beatId]
PUT  /api/storyboard/[id]/beats/reorder
POST  /api/storyboard/[id]/generate        (rate: 2/60s)
POST  /api/storyboard/[id]/shots/[shotId]/regenerate
POST  /api/storyboard/[id]/shots/[shotId]/lock
GET   /api/storyboard/[id]/status           (rate: 30/60s)
```

---

## Weeks 3-4: Hooks + UI

### useStoryboard hook

CRUD 状态管理: storyboard, isLoading, error + create/update/remove/addBeat/updateBeat/deleteBeat/reorderBeats

### useCoverageGeneration hook

生成进度: isGenerating, elapsedSeconds, status, completedBeats/totalBeats, beatProgress Map + startGeneration/regenerateShot/lockShot/cancel

使用提取的 `useVideoJobTracker`（pollInterval: 5000ms, maxAttempts: 600）

### 组件树

```
StudioStoryboardMode
  StoryboardHeader (title, StyleCard selector, cost estimate, Generate button)
  SceneBeatList
    SceneBeatCard × N (collapsed/expanded)
      Collapsed: beat # + action summary + 4 thumbnail strip
      Expanded: CharacterCard + BackgroundCard selector, action textarea, camera dropdown
        CoverageGrid (2×2)
          ShotPreviewCell × 4 (PENDING/QUEUED/RUNNING/COMPLETED/FAILED/LOCKED states)
    Add Beat button
  SequentialPreview (底部横向 filmstrip, 显示 locked/best shots)
```

### Mode 集成

`STUDIO_MODES` 新增 `'storyboard'`，StudioWorkspace 加第三模式分支。

### i18n

新增 `Storyboard` namespace，约 40 个键，三语言同步。

---

## 文件清单

### 新建 (22 文件)

| 文件 | 周 |
|------|---|
| `src/hooks/use-video-job-tracker.ts` | Prep |
| `src/services/storyboard-prompt-compiler.ts` | 1 |
| `src/services/storyboard-prompt-compiler.test.ts` | 1 |
| `src/services/storyboard.service.ts` | 2 |
| `src/services/coverage-orchestrator.service.ts` | 2 |
| 9 个 API route 文件 | 2 |
| `src/hooks/use-storyboard.ts` | 3 |
| `src/hooks/use-coverage-generation.ts` | 3 |
| 6 个组件文件 (storyboard/) | 3-4 |

### 修改 (10 文件)

`prisma/schema.prisma`, `src/constants/config.ts`, `video-pipeline.service.ts`, `StudioWorkspace.tsx`, `api-client.ts`, 3 个 i18n JSON, `use-generate-video.ts`, `use-generate-long-video.ts`
