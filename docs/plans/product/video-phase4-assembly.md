# Phase 4: Video Assembly — Dual-Track Implementation Spec

> Estimated: ~2-3 weeks | Prerequisite: Phase 2 (Storyboard) | Dependencies: dnd-kit, mediabunny

## Overview

将多个视频片段组装为完整视频。双轨方案: 客户端 WebCodecs + MediaBunny 即时预览 + 服务端 fal.ai merge-videos 高质量导出。

---

## 1. Data Model

### 新增 Prisma 模型

**VideoAssembly**: id, userId(→User), title, status(DRAFT/EXPORTING/COMPLETED/FAILED), bgmUrl, bgmStorageKey, bgmVolume(Float), originalVolume(Float), exportedUrl, exportedStorageKey, exportedDuration(Float), timestamps
- Relations: shots[], exports[]

**AssemblyShot**: id, assemblyId(→VideoAssembly, cascade), generationId(→Generation, cascade), orderIndex(Int), transitionType(CUT/FADE/DISSOLVE, default CUT), transitionDurationMs(Int, default 500)
- @@unique([assemblyId, orderIndex])

**AssemblyExport**: id, assemblyId(→VideoAssembly), status, externalRequestId, videoUrl, storageKey, durationSec, errorMessage, timestamps

### 常量: `src/constants/assembly.ts`

MAX_SHOTS: 30, MIN_SHOTS: 2, transition duration: 200-2000ms, BGM max: 50MB

---

## 2. Shot Arrangement UI (Week 1)

### 技术: dnd-kit (13k+ stars)

安装: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

### ShotArrangementStrip 组件

```
[Shot 1] --[T]-- [Shot 2] --[T]-- [Shot 3] -- [+ Add]
```

- **Shot 卡片**: 16:9 缩略图 + 时长 badge + 拖拽手柄 + 删除按钮(hover)
- **Transition 按钮**: 卡片间圆形图标，点击弹出 Popover
- **TransitionPopover**: radio 选 Cut/Fade/Dissolve + duration slider
- **桌面**: 水平条 overflow-x-auto，DragOverlay 视觉反馈
- **移动端**: scroll-snap，长按拖拽 (delay: 300ms)，最小 48px 触控目标
- **总时长显示**: 底部实时计算

### ShotPickerDialog

Dialog 加载用户 VIDEO 类型 Generations，grid 缩略图 + checkbox，按 Project 过滤。

---

## 3. 客户端预览 — WebCodecs + MediaBunny (Week 2)

### 文件: `src/lib/video-preview-engine.ts` (client-only)

### Pipeline 步骤

1. **LOAD**: 按序 fetch 每个 shot 视频 (ArrayBuffer)，支持 AbortController
2. **DEMUX**: MediaBunny demuxer 提取 encoded video chunks + codec metadata
3. **DECODE**: VideoDecoder 解码为 VideoFrame
4. **TRANSITION**:
   - CUT: 直接拼接，调整时间戳偏移
   - FADE: OffscreenCanvas alpha 混合 (alphaA = 1-t, alphaB = t, 线性)
   - DISSOLVE: easeInOutQuad 曲线 alpha 混合
5. **ENCODE**: VideoEncoder H.264 硬件加速
6. **MUX**: MediaBunny muxer → MP4 Blob → createObjectURL

### 内存管理

- 按序处理 shot，立即 close VideoFrame
- 10+ shots 时分批 3-4 个
- 估算超 512MB 显示警告
- 失败降级: "Preview unavailable, use Export"

### 浏览器兼容性

```typescript
function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
}
```

不支持时: 顺序播放列表（手动切换，无过渡）

---

## 4. 服务端导出 — fal.ai merge-videos (Week 2)

### 文件: `src/services/video-merge.service.ts`

### fal.ai 请求

端点: `fal-ai/ffmpeg-api/merge-videos`

Transition 映射为 ffmpeg xfade filter:
- CUT: concat，无 xfade
- FADE: `xfade=transition=fade:duration={sec}:offset={sec}`
- DISSOLVE: `xfade=transition=dissolve:duration={sec}:offset={sec}`

### 流程

1. 加载 assembly + shots
2. 构建 fal.ai 请求（video URLs + filter_complex）
3. 提交到 queue，获取 requestId
4. 存储到 AssemblyExport.externalRequestId
5. 客户端 3s 轮询
6. COMPLETED → streamUploadToR2 → 更新记录
7. 乐观锁防竞态（updateMany with status filter）

### 费用

N credits / export（N = shots 数量），导出前 UI 显示估算。

### BGM 混音 (Week 3, optional)

ffmpeg filter: `[0:a]volume={origVol}[a0];[bgm]volume={bgmVol}[a1];[a0][a1]amix=inputs=2:duration=longest`

---

## 5. API Routes

| Method | Path | 用途 |
|--------|------|------|
| GET, POST | `/api/video-assemblies` | 列表 + 创建 |
| GET, PUT, DELETE | `/api/video-assemblies/[id]` | 详情 + 更新 + 删除 |
| POST | `/api/video-assemblies/[id]/shots` | 添加 shots |
| DELETE | `/api/video-assemblies/[id]/shots/[shotId]` | 删除 shot |
| POST | `/api/video-assemblies/[id]/reorder` | 重排序 |
| PUT | `/api/video-assemblies/[id]/transition` | 更新过渡 |
| POST, DELETE | `/api/video-assemblies/[id]/bgm` | BGM 上传/删除 |
| POST | `/api/video-assemblies/export` | 提交导出 |
| POST | `/api/video-assemblies/export/status` | 轮询状态 |

---

## 6. Hooks

### use-assembly-editor.ts

状态: assembly, loading, error, isSaving
操作: reorderShots (乐观更新), addShots, removeShot, updateTransition, updateTitle, uploadBgm, removeBgm

### use-assembly-preview.ts

状态: previewBlobUrl, isProcessing, progress (0-100), isSupported
操作: generatePreview, cancelPreview
Debounce 500ms after arrangement change

### use-assembly-export.ts

状态: isExporting, exportProgress, exportedUrl, error
操作: submitExport → 3s polling, reset

---

## 7. 页面结构

```
/assembly          — 列表页 (assembly 卡片 grid)
/assembly/[id]     — 编辑器页
  ShotArrangementStrip    (顶部: 排列条)
  AssemblyPreviewPlayer   (中间: 预览播放器)
  AssemblyExportPanel     (底部: 导出控件 + credit 显示)
  BgmControls            (底部: BGM 上传 + 音量滑块)
```

---

## 8. 边缘情况

- **混合分辨率**: 检测 → 黄色警告，客户端 letterbox，服务端 scale+pad
- **20+ clips**: 客户端分批，增加 polling timeout
- **网络中断**: AssemblyExport 持久化，重连后恢复状态
- **移动端**: 限制预览 720p，deviceMemory < 4 禁用预览
- **源视频删除**: Generation cascade 删 AssemblyShot，低于 MIN_SHOTS 警告
- **并发导出**: 已有 EXPORTING 状态时拒绝新请求

---

## 9. 文件清单

### 新建 (28 文件)

constants(1) + services(2) + API routes(10) + api-client(1) + hooks(3) + lib(1) + pages(3) + components(7)

### 修改 (10 文件)

schema.prisma, types/index.ts, config.ts, routes.ts, api-client.ts, 3×i18n JSON, r2.ts, navigation

### 依赖安装

| 包 | 大小 |
|---|---|
| @dnd-kit/core | ~33KB |
| @dnd-kit/sortable | ~10KB |
| @dnd-kit/utilities | ~2KB |
| mediabunny | ~5KB |

---

## 10. 实施顺序

**Week 1**: Prisma migration → constants/types → assembly service → CRUD routes → api-client → dnd-kit 安装 → ShotArrangementStrip + ShotPickerDialog → use-assembly-editor → assembly pages

**Week 2**: mediabunny 安装 → video-preview-engine.ts → use-assembly-preview → AssemblyPreviewPlayer → video-merge.service → export routes → use-assembly-export → AssemblyExportPanel → 边缘情况

**Week 3 (optional)**: BGM upload → BgmControls → 音频混合 → 跨浏览器测试 → 移动端 → 性能优化
