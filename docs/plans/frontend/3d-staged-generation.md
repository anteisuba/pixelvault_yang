# 3D 分步生成（Staged Generation）设计文档

**状态**: Draft · 待审查
**作者**: Claude + fulina
**日期**: 2026-05-19
**关联**: PR1（45° 视图+预设+种子重跑，已撤回 45°）/ PR2（流式 R2+provisional 预览）
**估时**: ~10h，分 4 个 PR

---

## 1. 背景与动机

### 1.1 用户痛点

直接来自用户反馈：

1. **"不像原图"** — 生成结果几何/纹理漂移，特别是面部和发型
2. **"等待太久"** — 实际测下来 752s 等待，体验糟糕
3. **"6 张图反而更差"** — PR1 加 45° 视图后 Hunyuan 几何反而崩坏

### 1.2 为什么 PR1 / PR2 没有根治

PR1 / PR2 都是**在现有 auto-chain 框架内做局部优化**：

- 预设按钮（PR1-A2）→ 帮选对参数，但不解决"参数选对了仍不像"
- 种子重跑（PR1-A4）→ 减少 multi-view 重生成成本，但仍要等完整 90+s 才知道结果
- 流式 R2（PR2-B1）→ R2 上传是 752s 中的一小部分，不是大头
- Provisional 预览（PR2-B2）→ 让 fal 一返回就显示，但本质上仍是"等完整结果"

**根本问题**：用户没有任何决策点。提交一次 = 等 90-120s = 看到完整结果（满意/不满意）。不满意只能从头来。

### 1.3 现有代码意外发现

当前 `MESH_FIRST_PREVIEW` 模式（Hunyuan v3 / v3.1 Pro 启用）其实**已经在做两阶段生成**：

1. Stage 1 (~30s)：fal 跑 `generate_type: 'Geometry'` → 灰模 GLB
2. Stage 2 (~60s)：service 检测到 mesh 完成 → **自动**提交第二次 fal 跑 `Normal` 模式 → 完整带 PBR 模型

**问题不在于缺少两阶段，而在于 chain 是自动的**。`WireframeModelPreview` 在 Stage 1 完成那一刻就显示真实 mesh GLB（不是抽象 wireframe），但用户没意识到这是"决策点"，也没办法在这里 stop。

---

## 2. 现状架构

### 2.1 关键文件

| 文件                                            | 行       | 职责                                                                            |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------- | ---------- | ---------- |
| `src/services/generate-3d.service.ts`           | 401-419  | `shouldUseMeshFirstPreview` 判断走 mesh-first                                   |
| `src/services/generate-3d.service.ts`           | 620-712  | `checkMeshFirst3DGenerationStatus` — Stage 1 完成时 **auto-submit** Stage 2     |
| `src/services/generate-3d.service.ts`           | 715-822  | Stage 2 状态机                                                                  |
| `src/services/providers/fal.adapter.ts`         | 935-1047 | `submitModel3DToQueue` — 接受 `generateType: 'Normal'                           | 'Geometry' | 'LowPoly'` |
| `src/components/business/Studio3DWorkspace.tsx` | 785-949  | Main canvas — `WireframeModelPreview` 渲染 Stage 1 mesh，`ModelViewer` 渲染最终 |
| `src/constants/model-3d-generation.ts`          | 55-67    | `MODEL_3D_JOB_STAGE` 枚举（`MESH_RUNNING` / `TEXTURE_RUNNING`）                 |
| `src/constants/model-3d-generation.ts`          | 69-76    | `MODEL_3D_PROGRESS_STAGES`（`queued` / `mesh` / `texture` / `uploading`）       |

### 2.2 当前状态机

```
                  [用户提交]
                       │
                       ▼
              ┌────────────────┐
              │  status: QUEUED │
              │  stage: 无      │
              └────────┬───────┘
                       │ first poll
                       ▼
              ┌────────────────────┐
              │  RUNNING           │
              │  MESH_RUNNING      │ ← Stage 1 跑 Geometry
              │  UI: stage='mesh'  │
              └────────┬───────────┘
                       │ mesh 完成
                       ▼ (auto-chain, 无用户介入)
              ┌────────────────────┐
              │  RUNNING           │
              │  TEXTURE_RUNNING   │ ← Stage 2 跑 Normal
              │  UI: stage='texture'│
              │  显示 mesh GLB     │
              └────────┬───────────┘
                       │ texture 完成
                       ▼
              ┌────────────────────────┐
              │  QUEUED (finalResult)  │
              │  UI: stage='uploading' │
              │  显示 fal 临时 GLB (PR2)│
              └────────┬───────────────┘
                       │ R2 上传完成
                       ▼
              ┌────────────────────┐
              │  COMPLETED         │
              │  generation row    │
              └────────────────────┘
```

### 2.3 现状痛点

| 痛点           | 当前行为                                    | 期望行为                              |
| -------------- | ------------------------------------------- | ------------------------------------- |
| 几何不对       | 等 90s 看完整结果才知道 → 重做全流程        | 30s 看几何 → 不对立刻 abort 或换 seed |
| 几何对但纹理糟 | 没法只重做纹理（其实技术上也不行，见 §4.2） | 至少能"换 seed 重做完整 Stage 2"      |
| 侧视图烂       | 完整跑完才意识到是侧视图问题                | mesh_ready 时回头改侧视图             |
| 成本浪费       | 失败一次 = 付 1.0× 钱                       | mesh 阶段失败 = 付 0.4× 钱            |

---

## 3. 设计目标

按优先级：

1. **失败成本最小化**：几何不满意时不要付纹理钱
2. **决策点显式化**：每个阶段完成时让用户主动选择
3. **总耗时不严重退化**：一次跑通的情况下，比现状最多慢 30s
4. **向后兼容**：现有 Generation 记录不变，老路径保留作可选
5. **状态机可测试**：每个 transition 都能单测

---

## 4. 设计约束

### 4.1 fal Hunyuan v3.1 Pro API 现实

- ✅ `generate_type: 'Geometry'` 单独跑只出 mesh，~30s，费用约 $0.225/run（**需 verify**）
- ✅ `generate_type: 'Normal'` 跑完整 mesh + texture + PBR，~90s，$0.375/run
- ❌ **没有 "based on existing mesh, run texture only" 端点**
- ❌ **不能跨 job 复用 mesh** — Stage 2 的 Normal 内部也是从头跑几何

**这意味着**：

- "继续上色" = 提交一次新的 Normal 调用（输入相同源图 + 同 seed）
- 同 seed 下 Hunyuan 几何输出**视觉上稳定一致**（实测过 Hunyuan 是 deterministic w.r.t. seed），但严格意义上"几何重新跑了一遍"
- 总时长 = Stage 1 (~30s) + Stage 2 (~90s) = ~120s（比现状 mesh-first chain 多 ~30s）
- 总成本 = $0.225 + $0.375 = $0.6（比现状 $0.375 多 60%）
- **但只有在用户"看了 Stage 1 仍然继续"时才付双倍**；abort 的话省下 Stage 2 钱

### 4.2 "持续优化"的真实含义

用户原话："给予生成出来的模型持续优化"。技术上不可能"在 mesh 之上 incrementally 加细节"。能做的是：

- **同 seed 多次跑**：因为 Hunyuan deterministic，结果几乎一样，无意义
- **不同 seed 多次跑**：每次都是独立的完整流程，但用户可以 mesh history 对比挑最好的
- **改输入参数后重跑**：换多视图模型 / 换侧视图 / 调面数 → Stage 1 重跑
- **chain 后处理**：现有 Refine（TripoSR → Hunyuan）可以扩展为 Hunyuan → 二次 Refine（但 fal 没现成端点）

所以"持续优化" = **多次有目的地重跑 + 历史对比 + 选最好的**。

---

## 5. 用户旅程

每个 step 标注"用户动作"和"系统响应"。

### 5.1 黄金路径（用户首次满意）

```
[源图选好 + 多视图已生成]
  │
  ▼
[用户点 "生成 3D"]
  │  → 系统提交到 fal Geometry
  ▼
[stage=mesh, 显示 wireframe 进度条 ~30s]
  │  → fal 返回 mesh GLB
  ▼
[stage=mesh_ready, ModelViewer 显示灰模]
  │  决策按钮: [继续上色 ▶] [换种子重跑] [调侧视图] [放弃]
  │  → 用户点 [继续上色]
  ▼
[stage=texture, 灰模仍可见 + 顶部 "正在上色..." 横幅, ~90s]
  │  → fal 返回完整 GLB
  ▼
[stage=uploading, provisional GLB 显示, R2 后台上传 ~10-30s]
  │  → R2 完成
  ▼
[stage=completed, 完整 GLB + 下载/重跑按钮]
```

**总时长**: 30 + 90 + 20 = ~140s
**决策点**: 1
**对比现状**: 多 ~30s（因为 Stage 1 / Stage 2 不再 chain）

### 5.2 几何不满意路径

```
... → stage=mesh_ready, 灰模显示
  │  用户发现脸形不对（鼻子奇怪 / 头发轮廓飘）
  │  → 点 [换种子重跑]
  ▼
[stage=mesh_running, 新 seed]
  │  ~30s
  ▼
[stage=mesh_ready, 新灰模显示]
  │  对比 mesh history（最近 2-3 个）
  │  挑最好的 → [继续上色 ▶]
  ▼
[stage=texture_running, ...]
```

**成本**: 2 次 Stage 1 ($0.45) + 1 次 Stage 2 ($0.375) = $0.825
**对比 auto-chain**: 2 次完整 ($0.75) 但要等 2×90s = 180s（vs. 这里 ~30+30+90 = 150s）— **时间更省，钱稍多**

### 5.3 调侧视图路径

```
... → stage=mesh_ready
  │  看到背面有奇怪突起 = 背面侧视图不准
  │  → 点 [调侧视图]
  ▼
[弹窗或右侧面板高亮多视图槽]
  │  用户点"重新生成背面" / 手动上传一张
  │  → 多视图更新
  ▼
[用户点 [换种子重跑]（或 自动建议 retry mesh）]
  │  ~30s
  ▼
[stage=mesh_ready, 新灰模]
```

### 5.4 完全放弃

```
... → stage=mesh_ready
  │  整个角度都不对，没救
  │  → 点 [放弃]
  ▼
[弹窗确认 "放弃当前生成？已生成的 mesh 会丢弃"]
  │  确认
  ▼
[stage=idle, job 标 CANCELLED]
```

### 5.5 上色后微调

```
... → stage=completed
  │  完整模型显示，但纹理某处不对（如手套颜色错）
  │  → 点 [换种子重新上色]
  ▼
[stage=texture_running, 使用同源图 + 新 seed]
  │  ~90s
  ▼
[stage=completed, 新版本 + 历史 texture 可点切换]
```

**注意**: 因为 fal 不支持基于 mesh 重 texture，这实际是"基于同源图 + 新 seed 跑完整 Normal"。Hunyuan deterministic + 几何稳定 → 视觉上"几何不变只换纹理"。这点要在 i18n 文案里诚实表述。

### 5.6 错误降级路径

| 错误                      | 处理                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Stage 1 fal 返回 FAILED   | 显示错误 + [重试] / [换 seed 重试] / [取消]                                                                |
| Stage 1 R2 上传 mesh fail | mesh 不需要 R2（临时 URL 给前端预览，不入库），不影响                                                      |
| Stage 2 fal 返回 FAILED   | **保留 Stage 1 mesh**，显示 "纹理失败"，按钮 [重试上色] / [换 seed 上色] / [回到几何]                      |
| Stage 2 R2 上传失败       | 走现有 PR2 buffered fallback，最坏情况降级到现状                                                           |
| 用户中途断网              | 状态在 DB（externalRequestId JSON），下次进来可以恢复（现状已支持）                                        |
| 用户离开页面              | 后端 finalize 继续跑（现状已支持，但 Stage 1 完成后会卡在 mesh_ready 等待，可能永远不 continue）— 见 §11.2 |

---

## 6. 新状态机

### 6.1 状态扩展

`MODEL_3D_PROGRESS_STAGES` 扩展：

```ts
'queued' // 同现状
'mesh' // 同现状（Stage 1 running）
'mesh_ready' // 新 — Stage 1 完成，等用户决策
'texture' // 同现状（Stage 2 running）
'uploading' // 同现状（R2 上传中）
```

`MODEL_3D_JOB_STAGE` 扩展：

```ts
SINGLE_RUNNING // 同现状（非 mesh-first 路径）
MESH_RUNNING // 同现状
MESH_READY // 新 — 等用户决策（DB status = RUNNING）
TEXTURE_RUNNING // 同现状
```

### 6.2 Job DB status × Queue Meta stage 矩阵

| `GenerationJob.status` | `queueMeta.stage` | UI stage       | 含义                  |
| ---------------------- | ----------------- | -------------- | --------------------- |
| QUEUED                 | -                 | queued         | 刚提交                |
| RUNNING                | MESH_RUNNING      | mesh           | Stage 1 跑            |
| RUNNING                | **MESH_READY**    | **mesh_ready** | **新**: 等用户决策    |
| RUNNING                | TEXTURE_RUNNING   | texture        | Stage 2 跑            |
| QUEUED + finalResult   | TEXTURE_RUNNING   | uploading      | Stage 2 完，R2 上传中 |
| COMPLETED              | -                 | -              | 完成                  |
| FAILED                 | -                 | -              | 失败                  |
| **CANCELLED**          | -                 | -              | **新**: 用户主动放弃  |

### 6.3 状态转移图

```
                              ┌─────────┐
                              │  IDLE   │
                              └────┬────┘
                                   │ POST /api/generate-3d
                                   ▼
                              ┌─────────┐
                              │ QUEUED  │
                              └────┬────┘
                                   │ first poll
                                   ▼
                            ┌──────────────┐
                            │ MESH_RUNNING │
                            └──────┬───────┘
                                   │ mesh 完成
                                   ▼
            ┌────────────────────────────────────────┐
            │           MESH_READY                   │
            │  (DB: RUNNING, queueMeta.stage=...)    │
            └─────┬───────────┬──────────────┬──────┬┘
                  │           │              │      │
                  │ continue  │ retry-mesh   │ cancel│ chain
        POST/api  │           │              │      │ 兼容老
        /3d/      │           │              │      │ 路径
        continue  ▼           ▼              ▼      ▼
            ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐
            │ TEXTURE_ │ │  MESH_   │ │CANCELLED│ │auto-continue │
            │ RUNNING  │ │ RUNNING  │ │         │ │(staged=false)│
            └────┬─────┘ └──────────┘ └────────┘ └──────┬───────┘
                 │                                       │
                 │ texture 完成                           │
                 ▼                                       ▼
            ┌──────────────────────────┐           (老流程,直接到此)
            │ QUEUED + finalResult     │
            │ (R2 上传中)              │
            └────────────┬─────────────┘
                         │ R2 完
                         ▼
                    ┌──────────┐
                    │COMPLETED │
                    └─────┬────┘
                          │ retry-texture (新)
                          ▼
                    ┌──────────────────┐
                    │ TEXTURE_RUNNING  │
                    │ (新 seed, 同源图)│
                    └──────────────────┘
```

### 6.4 关键 Invariants

- `MESH_READY` 状态下 job 处于 `RUNNING`，但**不消耗 fal 资源**（等用户）。
- 如果用户离开页面，job 会停留在 MESH_READY，直到下次访问或被定期清理（见 §11.2）。
- `meshHistory` 仅在 staged 模式下累积。
- `texturedHistory` 仅在 completed 后通过 retry-texture 累积。

---

## 7. API 契约

### 7.1 修改现有 API

#### `POST /api/generate-3d`

- **新增可选字段** `staged: boolean`（默认从 `Generate3DRequestSchema` 推断；PR3-α 阶段默认 `false`，PR3-δ 切到 `true`）
- 行为：当 `staged === true && previewMode === MESH_FIRST` 时，Stage 1 完成后不 auto-chain，等待 continue/retry

#### `GET /api/generate-3d/status`

- **新增 stage** `'mesh_ready'`
- **新增 response 字段**:
  - `meshModelUrl?: string` — mesh_ready 阶段的灰模 GLB URL
  - `meshHistory?: Array<{ seed: number; url: string; createdAt: string }>` — 仅 staged 模式
  - `texturedHistory?: Array<{ seed: number; generationId: string; createdAt: string }>` — 完成后历史
- `provisionalModelUrl` / `uploadProgress`（PR2 已有）保持

### 7.2 新增 API

#### `POST /api/generate-3d/continue`

```ts
// body
{
  jobId: string
  seed?: number  // 不传则用 0 / undefined，让 fal 默认
}
// response
{
  success: true
  data: { jobId: string }
}
```

- **前提**: job 必须处于 `MESH_READY` 状态
- **行为**: 提交 fal Normal 调用，将 `queueMeta.stage` 改为 `TEXTURE_RUNNING`
- **错误**: 非 MESH_READY → 400；其他用户的 job → 403

#### `POST /api/generate-3d/retry-mesh`

```ts
// body
{
  jobId: string
  seed?: number
  multiViewImages?: Generate3DRequest['multiViewImages']  // 可选替换侧视图
}
// response
{
  success: true
  data: { jobId: string }
}
```

- **前提**: job 处于 `MESH_READY` 或 `MESH_RUNNING`
- **行为**:
  - 将当前 `queueMeta.mesh` 推入 `meshHistory`
  - 用新 seed / 视图重新提交 Geometry 调用
  - `queueMeta.stage` 回到 `MESH_RUNNING`
- 同样的 jobId 复用，不创建新 job

#### `POST /api/generate-3d/cancel`

```ts
// body { jobId: string }
// response { success: true }
```

- 任何非 COMPLETED / FAILED 状态都可 cancel
- 行为：job.status → `CANCELLED`，前端清状态

#### `POST /api/generate-3d/retry-texture`

```ts
// body { jobId: string, seed: number }
```

- **前提**: job 处于 `COMPLETED` 且 staged 模式
- **行为**: 将当前 generation 推入 `texturedHistory`，重跑 fal Normal
- 注意：会创建新 generation row（同 jobId 关联）

### 7.3 status response 新结构

```ts
type Model3DStatusResponseData =
  | {
      jobId: string
      status: 'IN_QUEUE' | 'IN_PROGRESS'
      stage?: 'queued' | 'mesh' | 'mesh_ready' | 'texture' | 'uploading'
      previewModelUrl?: string // Stage 1 mesh URL (现状)
      meshModelUrl?: string // 新 — mesh_ready 时的灰模 URL（同 previewModelUrl 但语义清晰）
      provisionalModelUrl?: string // PR2 — Stage 2 完成 fal 临时 URL
      uploadProgress?: { loaded; total } // PR2
      meshHistory?: Array<{ seed; url; createdAt }> // staged 模式
    }
  | {
      jobId: string
      status: 'COMPLETED'
      generation: GenerationRecord
      texturedHistory?: Array<{ seed; generationId; createdAt }>
    }
  | {
      jobId: string
      status: 'FAILED'
      failedStage?: 'mesh' | 'texture' | 'upload' // 新 — 区分失败环节
      meshModelUrl?: string // texture 失败时返回 mesh，让用户能 retry texture
    }
  | {
      jobId: string
      status: 'CANCELLED' // 新
    }
```

---

## 8. 数据模型变更

### 8.1 GenerationJob 表 — 不动 schema

利用现有 `externalRequestId: string` (JSON) 扩展：

```ts
const Model3DQueueMetaSchema = z.object({
  // 现有字段...
  requestId,
  statusUrl,
  responseUrl,
  mode,
  stage,
  mesh,
  final,
  finalResult,
  sourceImageUrl,
  preparedImageUrl,
  sourceGenerationId,
  projectId,
  prompt,
  apiKeyId,
  multiViewImages,
  sourceQuality,
  options,

  // 新增 (PR3-α)
  staged: z.boolean().optional(),

  // 新增 (PR3-γ)
  meshHistory: z
    .array(
      z.object({
        seed: z.number(),
        url: z.string(),
        createdAt: z.string(),
        multiViewSnapshot: z.any().optional(), // 当时的侧视图
      }),
    )
    .optional(),

  texturedHistory: z
    .array(
      z.object({
        seed: z.number(),
        generationId: z.string(),
        createdAt: z.string(),
      }),
    )
    .optional(),
})
```

### 8.2 GenerationJob.status 扩展

需要数据库支持 `CANCELLED`。**先查 Prisma schema 看 enum 现状**：

- 如果是 string enum 在 schema 里 → 加 `CANCELLED` 是 migration
- 如果是 string field 无约束 → 直接用

实施前必须 verify。

### 8.3 Generation 表 — 不动

- Stage 1 mesh 不入 Generation（同现状，临时 fal URL）
- Stage 2 完成时创建 Generation row（同现状）
- `texturedHistory` 里的每个 entry 都对应一个 Generation row（同 jobId 多 generation）

---

## 9. UI 详细设计

### 9.1 Studio3DWorkspace 状态对应表

| stage              | 主区域显示                                    | 顶部 Stepper                       | 决策按钮组（底部 dock）                         | 右侧面板     |
| ------------------ | --------------------------------------------- | ---------------------------------- | ----------------------------------------------- | ------------ |
| `idle`             | 源图 / 占位                                   | 隐藏                               | —                                               | 完全可改     |
| `queued`           | 源图                                          | 几何 ○─ 上色 ─ 完成                | —                                               | 禁用         |
| `mesh`             | 进度 + WireframePreview                       | **几何 ●**─ 上色 ─ 完成            | —                                               | 禁用         |
| `mesh_ready`       | ModelViewer (灰模)                            | **几何 ✓**─ 上色 ○─ 完成           | **[继续上色 ▶] [换种子重跑] [调侧视图] [放弃]** | 仅多视图可改 |
| `texture`          | ModelViewer (灰模) + 顶部"正在上色..." chip   | **几何 ✓**─ **上色 ●**─ 完成       | —                                               | 禁用         |
| `uploading`        | ModelViewer (provisional GLB) + "保存中" chip | **几何 ✓**─ **上色 ✓**─ 完成 ●     | —                                               | 禁用         |
| `completed`        | ModelViewer (R2 URL)                          | **几何 ✓**─ **上色 ✓**─ **完成 ✓** | [下载 GLB] [换种子重新上色] [回到几何] [Refine] | 只读         |
| `failed` (mesh)    | 错误占位                                      | **几何 ✗**                         | [重试几何] [换 seed 重试] [取消]                | 可改         |
| `failed` (texture) | ModelViewer (mesh)                            | **几何 ✓**─ **上色 ✗**             | [重试上色] [换 seed 上色] [回到几何] [取消]     | 部分可改     |
| `cancelled`        | 源图                                          | 隐藏                               | —                                               | 完全可改     |

### 9.2 关键 UI 组件

#### A. Stepper Bar（新组件）

放在 Studio3DWorkspace 头部，title 下方。3 个 step + 连接线。

```
┌─ 几何 ─────── 上色 ─────── 完成 ─┐
│  ●           ○           ○      │
└─────────────────────────────────┘
状态: 进行中 / 完成 ✓ / 失败 ✗ / 未开始 ○ / 当前 ●
```

可选: 鼠标 hover 显示当前阶段的预估时间和成本。

#### B. Decision Dock（mesh_ready 状态下显示）

替代现有的 `WireframeModelPreview overlay`。结构：

```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │      [灰模 GLB 可旋转]              │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ✓ 几何已完成。检查比例和轮廓后继续上色。  │
│                                          │
│  [ 继续上色 ▶ ]  [ 换种子重跑 ]           │
│  [ 调侧视图 ]    [ 放弃 ]                  │
└──────────────────────────────────────────┘
```

按钮优先级（视觉权重）：

- **主操作（实心橙色）**: 继续上色 ▶
- **次操作（轮廓）**: 换种子重跑 / 调侧视图
- **隐藏在 menu 里（三点菜单）**: 放弃 / 下载 mesh GLB（如果允许）

#### C. Mesh History Panel（PR3-γ）

如果 `meshHistory.length > 0`，在 ModelViewer 旁边显示折叠面板：

```
┌─ 历史 ─┐
│ ▼ (3) │
├───────┤
│ [缩图] │ seed: 1234   ← 当前
│ [缩图] │ seed: 5678
│ [缩图] │ seed: 9012
└───────┘
```

每个缩图可点 → 切换 ModelViewer 显示该 mesh + 当时的决策按钮变成 "用这个继续上色"。

实现细节：缩图用静态 GLB 截图（model-viewer 的 capturePoster），存到 ephemeral state（session 内有效）。

#### D. Action Confirmation Modal

某些操作需要确认：

- "放弃" → "确认放弃？已生成的几何会丢失"
- "换种子重跑" → 如果还有 mesh history 满 3 个，提示"最早的 mesh 会被覆盖"

### 9.3 i18n keys（新增）

```json
{
  "Model3DGenerate": {
    "stageMeshReady": "几何已完成",
    "stageMeshReadyHint": "检查比例和轮廓后继续上色。继续上色会基于同源图重跑完整生成。",
    "continueToTexture": "继续上色",
    "continueToTextureHint": "用同源图 + 同 seed 跑纹理。约 90 秒。",
    "retryMesh": "换种子重跑几何",
    "retryMeshHint": "保留侧视图，仅换 seed 重新生成几何。约 30 秒。",
    "adjustViewsAndRetry": "调侧视图重跑",
    "cancel3D": "放弃",
    "cancel3DConfirm": "确认放弃当前生成？已生成的几何会丢失。",
    "retryTexture": "换种子重新上色",
    "retryTextureHint": "基于同源图 + 新 seed 重跑完整 Normal。Hunyuan 几何在同源图下视觉一致。",
    "backToGeometry": "回到几何",
    "backToGeometryHint": "切换显示这次生成的几何阶段产物。",
    "stepGeometry": "几何",
    "stepTexture": "上色",
    "stepComplete": "完成",
    "stagedModeToggle": "分步生成（推荐）",
    "stagedModeHint": "几何完成后停下来让你确认。失败成本小，可中途调整。",
    "meshHistoryLabel": "几何历史",
    "meshFailedTitle": "几何生成失败",
    "textureFailedTitle": "上色失败",
    "textureFailedHint": "几何已生成，可以重试上色或换 seed。"
  }
}
```

（en/ja 对应翻译）

---

## 10. 影响范围

### 10.1 必改文件

**Backend (service layer)**:
| 文件 | 改动 |
|---|---|
| `src/services/generate-3d.service.ts` | 拆 `checkMeshFirst3DGenerationStatus` 在 mesh 完成时停止 auto-chain；加 `continue3DGeneration` / `retryMesh3DGeneration` / `cancel3DGeneration` |
| `src/services/providers/fal.adapter.ts` | 不动（已支持 generateType） |

**API routes**:
| 文件 | 改动 |
|---|---|
| `src/app/api/generate-3d/route.ts` | 接受 `staged` 参数 |
| `src/app/api/generate-3d/status/route.ts` | 返回新 stage + meshHistory |
| `src/app/api/generate-3d/continue/route.ts` | **新增** |
| `src/app/api/generate-3d/retry-mesh/route.ts` | **新增** |
| `src/app/api/generate-3d/cancel/route.ts` | **新增** |
| `src/app/api/generate-3d/retry-texture/route.ts` | **新增** (PR3-γ) |

**Types**:
| 文件 | 改动 |
|---|---|
| `src/types/index.ts` | `Generate3DRequestSchema` 加 `staged`；`Model3DStatusResponseData` 加新 stage + meshHistory；新增 Continue/Retry/Cancel request schemas |
| `src/constants/model-3d-generation.ts` | `MODEL_3D_PROGRESS_STAGES` 加 `mesh_ready`；`MODEL_3D_JOB_STAGE` 加 `MESH_READY` |

**Frontend**:
| 文件 | 改动 |
|---|---|
| `src/hooks/use-generate-3d.ts` | 加 `continue / retryMesh / cancel / retryTexture` actions；state 加 `meshModelUrl / meshHistory / texturedHistory` |
| `src/components/business/Studio3DWorkspace.tsx` | 主区域增加 mesh_ready 状态分支；Decision Dock；Stepper Bar；Mesh History Panel；移除现有 auto-chain 假设 |
| 新增 `src/components/business/StageStepperBar.tsx` | |
| 新增 `src/components/business/MeshHistoryPanel.tsx` | (PR3-γ) |
| `src/lib/api-client/generation.ts` | 新增 `continue3DAPI / retryMesh3DAPI / cancel3DAPI / retryTexture3DAPI` |
| `src/messages/{zh,en,ja}.json` | 新增 i18n keys |

**Tests**:
| 文件 | 改动 |
|---|---|
| `src/services/generate-3d.service.test.ts` | 新状态转移用例 — mesh_ready 入口/出口、retry-mesh、cancel、retry-texture |
| `src/app/api/generate-3d/*/route.test.ts` | 新 API route 测试 |
| `src/hooks/use-generate-3d.test.ts` | **新增** (CLAUDE.md 提醒 hooks 0 测试覆盖，这次正好补上 staged 流程) |

### 10.2 不动的（确认稳定）

- Provider adapters
- multiview-generate service
- R2 上传（PR2 改造）
- 现有 mesh-first auto-chain 流程（保留作为 `staged: false` 路径）
- generation.service 创建逻辑
- Refine 路径（TripoSR → Hunyuan）— 跟新流程并列

### 10.3 估算改动规模

| 区块                           | 代码行                            |
| ------------------------------ | --------------------------------- |
| Service 状态机改造             | ~200                              |
| 4 个新 API route + handlers    | ~150                              |
| Types + schemas                | ~80                               |
| Hook 改造                      | ~150                              |
| Studio3DWorkspace 改造         | ~300 (含 Decision Dock + Stepper) |
| 新组件 (Stepper / MeshHistory) | ~150                              |
| i18n (3 语 × ~15 keys)         | ~45                               |
| 测试                           | ~400                              |
| **总计**                       | **~1500 行**                      |

---

## 11. 迁移策略

### 11.1 默认行为

- **PR3-α 完成时**: `staged` 默认 `false` → 行为完全不变（现有 auto-chain），但参数面板加一个开关让用户启用
- **PR3-δ 完成时**: 经过 dogfood 验证后切默认 `true`，老用户在 release notes 看到说明
- **CLAUDE.md 兼容性要求** (类型变更检查): `staged` 是可选字段，向后兼容 ✓

### 11.2 后台 stale job 清理

新增问题：用户离开页面后 `MESH_READY` job 可能永远停在那里（消耗 DB 行，不消耗 fal 资源）。

策略：

- 现有 `MODEL_3D_FINALIZATION_STALE_MS = 15min` 不变（用于 R2 上传卡住的兜底）
- 新增 `MODEL_3D_MESH_READY_STALE_MS = 60min` — MESH_READY 超过 60 分钟自动 `CANCELLED`
- 这个清理在 status poll 进入时检查（不需要单独 cron）

### 11.3 现有 in-flight job

部署时（重启 dev server / 部署生产）：

- 现有 in-flight job 完成它自己的 auto-chain（因为旧代码路径仍存在）
- 新提交的 job 走新逻辑
- 数据库无 schema 变更，平稳过渡

### 11.4 dev 环境注意

PR3 部署后必须重启 dev server（PR2 文末同样提示）。因为 `finalizing3DJobs` 等 in-memory state 持有旧代码引用。

---

## 12. 风险与权衡

### 12.1 性能权衡

| 路径                  | 现状           | 新设计（staged）       | 差异        |
| --------------------- | -------------- | ---------------------- | ----------- |
| 黄金路径（一次通过）  | ~90s           | ~140s                  | **+50s** ❌ |
| 几何不满意 1 次 retry | 90s × 2 = 180s | 30s + 30s + 90s = 150s | **-30s** ✓  |
| 几何不满意 2 次 retry | 90s × 3 = 270s | 30s × 3 + 90s = 180s   | **-90s** ✓  |

**结论**: 当用户完美率 ≥ 1/0 时（实际 1/3 不满意是常态），新设计期望值更优。如果用户基本一次通过（≥ 90%），新设计是退步。

**默认建议**: PR3-α 关闭 staged 默认（用户主动开启），PR3-δ 收数据后再决定是否打开默认。

### 12.2 成本权衡

| 路径                   | 现状           | 新设计（staged）        | 差异        |
| ---------------------- | -------------- | ----------------------- | ----------- |
| 一次通过               | $0.375         | $0.225 + $0.375 = $0.6  | **+60%** ❌ |
| 1 次 mesh retry        | $0.75          | $0.45 + $0.375 = $0.825 | **+10%** ❌ |
| 1 次完整 retry         | $0.75          | $0.6 × 2 = $1.2         | **+60%** ❌ |
| mesh abort（用户放弃） | $0.375（损失） | $0.225（损失）          | **-40%** ✓  |

**结论**: 只有 abort 路径省钱。其他路径都贵 10-60%。

**用户视角**: 用户付 5 credit 是固定的（除非 abort），fal 端的成本由 PixelVault 吸收。**长期看这是平台成本上升**。

**对策**:

- PR3-α 内部 feature flag 默认关
- 收 dogfood 数据：mesh abort 率是多少？如果 < 20%，可能不值得做
- 如果数据好，再考虑用户层面定价调整（Stage 2 单独按 4 credit 计）

### 12.3 复杂度

- 状态机从 4 stage 变成 6 stage
- API route 从 2 个变成 6 个
- 测试用例数翻倍
- UI 状态分支翻倍

**长期维护成本上升**。Karpathy "Simplicity First" 提醒：这个复杂度是否值得？

**回答**: 取决于这个产品的核心价值定位。如果 3D 生成是核心功能，"分步控制" 是 Studio 用户的高频需求 → 值得。如果只是 nice-to-have → 不值得，应该专注其他功能。

需要产品决策。

### 12.4 fal API 行为依赖

新设计强依赖 `generate_type: 'Geometry'` 的实际行为：

- 真实生成时间？文档说 ~30s，实际可能 ~45s
- 实际定价？$0.225 是估计，需要 verify
- Geometry 输出 GLB 是否可独立 view？需要测试
- Geometry mode 是否支持 multi-view 输入？需要测试（如果不支持，整个 Stage 1 体验大打折扣）

**PR3-α 第一件事**：写一个独立的 fal probe 脚本验证以上 4 点。Documented before coding.

---

## 13. 实施计划

### PR3-α — 核心两阶段拆分（~3h）

**Goal**: mesh_ready 状态可达，[继续上色] 按钮工作。

**Out of scope**: retry-mesh, cancel, retry-texture, history, Stepper UI 美化。

**Scope**:

1. fal probe 脚本验证 Geometry 模式 — 30min
2. service 改造：`checkMeshFirst3DGenerationStatus` 在 mesh 完成时不 auto-chain，改 stage → `MESH_READY` — 1h
3. 新增 API: `POST /api/generate-3d/continue` — 30min
4. types: `Model3DStatusResponseData` 加 `mesh_ready` stage + `meshModelUrl` — 15min
5. hook: 加 `continue` action，stage='mesh_ready' 时停止 polling — 30min
6. UI: mesh_ready 时显示简易决策按钮 [继续上色] / [放弃]，无 Stepper 美化 — 30min
7. i18n — 15min
8. 测试 — 30min

**验收**: 提交 → 等 30s → 看到灰模 + [继续上色] 按钮 → 点 → 等 90s → 完整模型。

**默认 staged**: `false`（参数面板加 toggle 让用户启用）。

### PR3-β — 几何阶段 retry / 调侧视图（~2h）

**Scope**:

1. `POST /api/generate-3d/retry-mesh`
2. 按钮 [换种子重跑] + [调侧视图]
3. retry-mesh 时把当前 mesh 推 `meshHistory`（max 3）
4. status response 返回 `meshHistory`
5. 测试

**验收**: mesh_ready 状态下可以多次 retry geometry 不进 texture，看到历史。

### PR3-γ — 上色阶段持续优化（~3h）

**Scope**:

1. `POST /api/generate-3d/retry-texture` + `POST /api/generate-3d/cancel`
2. completed 状态加按钮 [换种子重新上色] / [回到几何] / [Refine]
3. `texturedHistory` 维护
4. 状态 `CANCELLED` 处理（前端 + DB）
5. 测试

**验收**: completed 后可以重跑纹理，可以切回旧版本对比。

### PR3-δ — UI 美化 + 默认开启（~2h）

**Scope**:

1. `StageStepperBar` 组件
2. `MeshHistoryPanel` 组件（缩图 + 切换）
3. 默认 `staged: true`
4. 老用户提示 modal（首次进入 3D Studio 提示新流程）
5. 文档更新（README / studio-feature-map）

**验收**: 视觉上等价于这份 doc §9 的设计。

### 总计 ~10h，每个 PR 独立可 ship。

---

## 14. 测试策略

### 14.1 单元测试

- **状态机转移**：every transition 一个测试
  - `QUEUED → MESH_RUNNING`
  - `MESH_RUNNING → MESH_READY` (新)
  - `MESH_READY → TEXTURE_RUNNING` (via continue)
  - `MESH_READY → MESH_RUNNING` (via retry-mesh)
  - `MESH_READY → CANCELLED` (via cancel)
  - `TEXTURE_RUNNING → COMPLETED`
  - `COMPLETED → TEXTURE_RUNNING` (via retry-texture)
  - `MESH_RUNNING → FAILED`
  - `TEXTURE_RUNNING → FAILED` (mesh 保留)
- **向后兼容**：`staged: false` 路径完全等价于现有行为
- **stale cleanup**：MESH_READY 超时自动 CANCELLED

### 14.2 集成测试

- API route × service mock
- continue/retry/cancel 的权限检查（403 跨用户）
- failed stage 字段返回正确

### 14.3 Hook 测试（新覆盖）

- continue/retryMesh/cancel actions 触发 polling 重启
- stage='mesh_ready' 时 polling 停止
- meshHistory state 同步

### 14.4 手工 QA Checklist（PR3-δ 之前）

- [ ] 黄金路径：上传→生成→灰模→继续→完整
- [ ] 几何不满意：retry-mesh 3 次→选最好的→继续
- [ ] 上色失败：保留 mesh，[重试上色] 工作
- [ ] 完成后 retry-texture：新 generation 出现在历史
- [ ] cancel：状态清空，源图保留
- [ ] 离开页面 1h+：MESH_READY 自动 CANCELLED
- [ ] 现有 mesh-first auto-chain（staged=false）：完全不变
- [ ] Refine TripoSR → Hunyuan 路径：仍工作

---

## 15. 需要确认的决策点

请在审查这份 doc 时回答：

1. **要不要做这个重构**？长期成本上升 + 复杂度上升，是否值得？
2. **PR3-α 默认 staged 状态**：`false`（保守，需要用户主动开）还是 `true`（激进，老用户首次进来不一样）？
3. **mesh history 保留多少个**：3 个（默认）还是更多？
4. **mesh_ready 阶段是否允许切换 3D 模型**：默认建议不允许（不同模型 mesh 不一致），但用户可能想"v3 几何对了再用 v3.1 Pro 上色"？
5. **是否需要 fal probe 脚本先做技术验证**：建议是，因为 Geometry 模式的实际表现还没验证
6. **要不要把"Stage 1 灰模"做成可下载的独立产物**：用户可能想要纯几何 GLB 给 Blender 后处理。但增加 Generation row 复杂度
7. **是否在分步模式下也允许 cancel 进行中的 Stage 1**：技术上 fal 调用已发出，cancel 只是 client-side 放弃；fal 还在跑（钱已花）。要明确告诉用户

---

## 16. 不在 PR3 范围（明确放下）

- 多 mesh 并行跑（A/B/C 三个 seed 同时跑后挑）— 成本不可控
- LoRA 微调路径 — Hunyuan 不支持
- 手动后处理 UV 编辑器 — 太大
- 自动质量评分（vision model 看 mesh 评分）— 不可靠
- 跨 session 的 mesh history（持久化历史挑选）— 数据库复杂度

这些都是合理需求但需要单独立项。
