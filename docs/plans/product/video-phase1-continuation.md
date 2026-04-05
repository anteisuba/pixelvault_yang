# Phase 1: Video Continuation + Style Anchoring — Implementation Spec

> Estimated: ~1 week | Prerequisite: None | ROI: ★★★★★

## Overview

在已完成视频的基础上添加"续拍"功能和项目级风格锚定，利用已有的 `lastFrameUrl` 字段和 I2V 流程。

---

## 1. Last Frame Extraction

### 方案: 客户端 Canvas 提取 + R2 持久化

- 视频已在 `<video>` 元素中加载，用 canvas 抓取末帧最高效
- 项目已有 `resizeImageToDataUrl` canvas 操作模式（VideoGenerateForm.tsx）
- `VideoPipelineClip.lastFrameUrl` 已存在，长视频管道直接可用

### 新建: `src/lib/extract-last-frame.ts`

```typescript
export async function extractLastFrame(videoUrl: string): Promise<string>
// 返回 base64 JPEG data URL
// 内部: 创建隐藏 <video> → crossOrigin='anonymous' → seek 到 duration-0.01 → canvas.toDataURL('image/jpeg', 0.92)
// 超时: 10s
// CORS: R2 已配置正确 headers
```

### 存储

提取的帧在客户端是临时的。提交下次生成时，由现有的 `submitVideoGeneration` 上传到 R2（key: `IMAGE/{userId}/{date}/{random}`）。无需额外存储基础设施。

---

## 2. 续拍按钮 UI

### 放置位置

**A) VideoGenerateForm 结果区域** — 视频生成成功后，在 badges 行添加 "Continue" 按钮

**B) HistoryPanel** — 每个历史视频卡片显示 "Continue" 图标按钮

### 点击流程

1. 调用 `extractLastFrame(videoUrl)` 提取末帧
2. 调用 `addReferenceImage(lastFrameDataUrl)` 设为 I2V 参考图
3. 可选预填原始 prompt
4. 模型不支持 I2V 时禁用按钮 + tooltip 说明

### I2V 兼容性检查

支持 I2V 的模型（有 `i2vModelId`）: Kling V3 Pro, Veo3.1, Seedance Pro, Hailuo 2.3, Pika 2.5, Kling V2.1, Wan, HunyuanVideo

不支持时: 按钮可见但 disabled，tooltip: "This model does not support image-to-video continuation"

### i18n 新增键

```json
"VideoGenerate": {
  "continueButton": "Continue / 续拍 / 続行",
  "continueTooltip": "Use the last frame as reference / 使用末帧作为参考 / 最後のフレームを参照に",
  "continueModelUnsupported": "This model does not support I2V continuation",
  "continueExtracting": "Extracting last frame..."
}
```

---

## 3. Project 级风格锚定

### DB 变更

`Project` 模型新增两列:

```prisma
model Project {
  // existing...
  styleAnchorUrl        String?
  styleAnchorStorageKey String?
}
```

### 自动应用逻辑

1. 用户在 Project 内触发生成时，检查 `activeProject.styleAnchorUrl`
2. 如有设置且用户未手动上传参考图 → 自动注入为 referenceImage
3. 用户手动上传的参考图优先级更高

### API

**新建: `POST /api/projects/[id]/style-anchor`**

```typescript
const SetStyleAnchorSchema = z.object({
  action: z.enum(['set', 'clear']),
  imageData: z.string().optional(), // action='set' 时必填
})
// Response: { success: true, data: { styleAnchorUrl: string | null } }
```

### Service

在 `project.service.ts` 新增:

```typescript
export async function setProjectStyleAnchor(clerkId, projectId, imageData): Promise<ProjectRecord>
export async function clearProjectStyleAnchor(clerkId, projectId): Promise<ProjectRecord>
```

### UI

- **设置入口 1**: 历史卡片下拉菜单添加 "Pin as Style" 操作
- **设置入口 2**: ProjectSelector 组件内显示锚定指示器 + 上传/清除控件
- **视觉指示**: 有锚定时 ProjectSelector 旁显示小缩略图 badge
- **参考图区域**: 显示 "Style Anchored" badge + "Project style reference auto-applied"

---

## 4. 文件清单

### 新建文件 (2)

| 文件 | 用途 |
|------|------|
| `src/lib/extract-last-frame.ts` | 客户端末帧提取工具 |
| `src/app/api/projects/[id]/style-anchor/route.ts` | 风格锚定 API |

### 修改文件 (15)

| 文件 | 变更 |
|------|------|
| `prisma/schema.prisma` | Project 加 styleAnchorUrl/styleAnchorStorageKey |
| `src/types/index.ts` | 加 SetStyleAnchorSchema, 更新 ProjectRecord |
| `src/services/project.service.ts` | 加 set/clearProjectStyleAnchor, 更新 toProjectRecord |
| `src/constants/config.ts` | 加 PROJECT_STYLE_ANCHOR 到 API_ENDPOINTS |
| `src/lib/api-client/` | 加 setStyleAnchorAPI / clearStyleAnchorAPI |
| `src/components/business/VideoPlayer.tsx` | 加 onContinue 回调 prop |
| `src/components/business/VideoGenerateForm.tsx` | 接入续拍 + 自动注入 styleAnchor |
| `src/components/business/GalleryDetailVideoPlayer.tsx` | 透传 onContinue |
| `src/components/business/ProjectSelector.tsx` | 显示锚定缩略图 + 清除按钮 |
| `src/components/business/HistoryPanel.tsx` | 加 "Continue" + "Pin as Style" 操作 |
| `src/hooks/use-projects.ts` | 加 setStyleAnchor/clearStyleAnchor 方法 |
| `src/messages/en.json` | 加 i18n 键 |
| `src/messages/ja.json` | 加 i18n 键 |
| `src/messages/zh.json` | 加 i18n 键 |

### 实施顺序

1. **Day 1-2**: `extract-last-frame.ts` + VideoPlayer `onContinue` + VideoGenerateForm 接入
2. **Day 3-4**: Prisma migration + project.service + API route + API client + types
3. **Day 5**: ProjectSelector UI + HistoryPanel 操作 + 自动注入逻辑
4. **Day 6-7**: 边缘情况 + 移动端 + i18n 完善

---

## 5. 边缘情况

- **模型不支持 I2V**: 按钮 disabled + tooltip
- **视频仍在生成中**: 结果区域未渲染，按钮自然隐藏
- **长视频管道**: 优先用已有的 `lastFrameUrl`，回退到 canvas 提取
- **CORS 失败**: catch 错误 → toast 提示用户手动下载上传
- **风格锚定 + 手动参考图冲突**: 手动优先，显示 info banner
- **移动端**: Continue 按钮 full-width，提取时显示 loading spinner，锚定缩略图 24x24
