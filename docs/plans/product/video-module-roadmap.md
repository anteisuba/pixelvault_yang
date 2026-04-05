# PixelVault 视频生成模块 — 全面评估与优先级路线图

## Context

PixelVault 已有完整的单视频生成（3-10s）和长视频管道（10-120s clip 拼接），支持 12+ 视频模型。但 docs 中规划的高级视频功能（Storyboard、组装、风格一致性等）均未实现。本评估旨在梳理所有未实现功能的依赖关系、投入产出比，制定最优开发路线。

---

## 1. 未实现功能清单

| ID | 功能 | 来源 | 影响力 | 工作量 | 风险 | ROI |
|----|------|------|:------:|:------:|:----:|:---:|
| **C** | 风格一致性 + 续拍按钮 | roadmap W3 | 4 | 2 | 1 | ★★★★★ |
| **E** | Seedance 2.0 集成 | jimeng-google-video | 2 | 1 | 1 | ★★★★ |
| **D** | Veo 3.1 原生 Google Adapter | jimeng-google-video | 2 | 2 | 2 | ★★★ |
| **A** | Storyboard 4-Shot Coverage | video-storyboard-design | 5 | 5 | 3 | ★★★ |
| **B** | 视频组装 + 音频 | roadmap W4 | 4 | 4 | 4 | ★★ |
| **F** | Series Mode 连续生成 | unified-dev-plan C2 | 3 | 4 | 3 | ★★ |
| **G** | 高级漫画功能 | unified-dev-plan C4 | 3 | 5 | 4 | ★ |

---

## 2. 依赖关系图

```
独立集群:
  D (Veo Native) ─── 无依赖
  E (Seedance 2.0) ── 外部依赖（API 开放时间）

主链路:
  C (风格一致性)
    └─→ A (Storyboard 4-Shot) ←── 核心差异化功能
          ├─→ B (视频组装 + 音频)
          └─→ F (Series Mode) ←── 依赖 Studio 重构 B3
                └─→ G (高级漫画)
```

---

## 3. 差异化分析

PixelVault 的护城河 = **Cards + Coverage + Consistency**。
竞品（Runway、Pika、Kling）都没有卡片系统驱动多机位视频生成。

**最短差异化路径**: C (1周) → A (4周) = 5 周达到差异化产品。

---

## 4. 推荐开发路线

### Phase 1: Quick Win — 续拍 + 风格锚定（~1 周）
**功能 C**: 风格一致性 + Continuation

- `lastFrameUrl` 字段已存在于 `VideoPipelineClip`，几乎免费
- 在 VideoPlayer 下方加 "续拍" 按钮，提取末帧作为下一次 I2V 参考
- Project 级风格参考锚定（复用已有 Project 系统）
- **关键文件**: `VideoPlayer.tsx`, `use-generate-video.ts`, `video-pipeline.service.ts`

### Phase 2: 核心差异化 — Storyboard（~4 周）
**功能 A**: 4-Shot Coverage System

建议分 4 步推进：

**2a. Prompt Compiler（第 1 周）**
- 先建 `prompt-compiler.service.ts`，零 DB 依赖
- 编译逻辑: CharacterCard + BackgroundCard + StyleCard + action + camera + shotType → final prompt + reference image
- 22 个测试路径，先验证核心逻辑

**2b. DB Migration + Service（第 2 周）**
- Prisma 新增: `VideoStoryboard`, `SceneBeat`, `CoverageShot` 模型
- `storyboard.service.ts` — CRUD + prompt compilation
- `coverage-orchestrator.service.ts` — 多 beat 多 shot 编排
- 7+ API routes

**2c. Hooks + UI（第 3-4 周）**
- `useStoryboard`, `useCoverageGeneration` hooks
- `StudioStoryboardMode`, `SceneBeatCard`, `CoverageGrid`, `SequentialPreview` 组件
- i18n 三语言同步

### Phase 3: 模型扩展（~1 周，可与 Phase 2 并行）
**功能 D + E**: Veo Native + Seedance 2.0

- D: `gemini.adapter.ts` 增加 `submitVideoToQueue` + `checkVideoQueueStatus`
- E: Volcengine adapter 加新模型 endpoint（等 API 开放）

### Phase 4: 精简版组装（~2 周）
**功能 B**: 视频组装（降级范围）

- **不做**: WebCodecs 拼接、ElevenLabs TTS（Kling V3/Veo3 已自带音频）
- **做**: Sequential Player（CSS 过渡的连续播放器）+ 导出为播放列表
- 60s Vercel timeout 约束下的最佳方案

### Phase 5: 验证后扩展（Phase 2 验证后再启动）
**功能 F + G**: Series Mode + 高级漫画

- 仅在 Storyboard 用户验证后开始
- F 依赖 Studio 重构 B3 完成

---

## 5. 实施前的架构准备

在启动 Phase 2 前需完成 3 个预备工作：

### 5a. 提取 `useVideoJobTracker` 共享 hook
- 当前 `useGenerateVideo` 和 `useGenerateLongVideo` 有大量重复的轮询/计时逻辑
- Storyboard 的 `useCoverageGeneration` 会第三次重复
- 提取共享 hook 避免三倍代码

### 5b. 为 `video-pipeline.service.ts` 添加 `independent` 扩展方式
- 现有: `native_extend` + `last_frame_chain`（线性拼接）
- Storyboard shots 是并行独立生成，非线性续接
- 在 `submitNextClip()` 增加 `independent` 分支

### 5c. 先测试 Prompt Compiler 核心逻辑
- 零 DB 依赖的纯函数，可独立测试
- 覆盖: I2V 兼容性矩阵（哪些模型支持参考图，哪些 fallback T2V）
- 覆盖: 不同 shotType 的 framing 描述生成

---

## 6. 技术调研结论

### 6a. 客户端视频拼接 — WebCodecs + MediaBunny

**结论: 2026 年首次全浏览器可用，推荐作为 Phase 4 方案。**

| 方案 | 性能 | 包体积 | GPU加速 | 推荐度 |
|------|------|--------|---------|--------|
| **WebCodecs + MediaBunny** | ~200fps (1080p) | ~5KB | 是 | ★★★★★ 首选 |
| **WebCodecs + mp4box.js** | ~200fps | ~50KB | 是 | ★★★★ 成熟稳定 |
| **ffmpeg.wasm** | ~25-40fps | ~30MB | 否 | ★★ 仅做降级兜底 |

- **Safari 26 (2025秋)** 补齐了 AudioEncoder/AudioDecoder，全平台首次完整支持
- **MediaBunny** 是 2026 新方案：纯 TS 零依赖、流式处理、比 ffmpeg.wasm 快 8x，Remotion 团队已采用
- **编解码器**: H.264 是最安全选择（全平台硬件加速）
- **风险**: iOS Safari 内存限制严格、合并不同参数视频需重编码
- **CapCut Web** 已验证 WebCodecs 生产可用性

### 6b. 服务端视频合并 — fal.ai FFmpeg API

**结论: fal.ai 已有 merge-videos 端点，零基础设施，~$6/月。**

| 平台 | 月费(100次/天) | 运维 | 适合度 |
|------|:-------------:|------|--------|
| **fal.ai merge-videos** | ~$6 | 无 | ★★★★★ 已在技术栈中 |
| Modal | ~$2 (免费额度内) | 低(需Python) | ★★★ |
| Railway | ~$10-15 | 中 | ★★★ |
| Cloudflare Workers | N/A | — | ❌ 不支持拼接 |

- PixelVault 已用 fal.ai，直接调 `fal-ai/ffmpeg-api/merge-videos`
- 架构: Vercel API → fal.ai queue → poll → R2 存储
- 如需复杂 filter（转场特效、字幕烧录），再迁移到 Railway ffmpeg worker

### 6c. 时间轴 UI — 自建 dnd-kit 方案

**结论: AI 视频不需要传统 NLE 时间轴，自建 5-7 天 MVP。**

| 库 | Stars | 适合度 | 说明 |
|---|---|---|---|
| **dnd-kit (自建)** | 13k+ | ★★★★★ | Headless、触摸友好、完全控制设计系统 |
| @cloudgpt/timeline-editor | fork | ★★★★ | 有视频帧缩略图，2-3 天 MVP，但 fork 维护风险 |
| dnd-timeline | 225 | ★★★ | Headless 时间轴，无视频特定功能 |
| React Video Editor | 商业 | ★★★ | $149/年，最精致 UX，依赖 Remotion |

**为什么自建**:
- AI 视频的单元是"整个 shot"而非帧 — 更像故事板条，不像 Premiere 轨道
- 需要融入设计系统（#faf9f5 背景、Space Grotesk 字体）
- 竞品（Runway/Pika/Kling/Hailuo）都没解决"平台内排列片段"的问题 — **差异化机会**
- 移动端: 水平滚动 shot 卡片 + 长按拖拽排序 + 卡片间 transition 图标

---

## 7. 修订后的开发路线

基于技术调研，对原 Phase 4 做重大升级：

### Phase 4 (修订): 视频组装 — 双轨方案（~2-3 周）

**4a. 排列 UI（第 1 周）**
- 自建 dnd-kit shot 排列条
- Shot 卡片: 缩略图 + 时长 + 拖拽手柄
- 卡片间: transition 类型选择器（cut/fade/dissolve）
- 桌面 + 移动端响应式

**4b. 合并导出（第 2 周）**
- **在线预览**: WebCodecs + MediaBunny 客户端拼接（零服务端开销）
- **导出下载**: fal.ai `merge-videos` API（服务端合并，保证质量）
- 双路径让用户即时预览 + 高质量导出

**4c. 音轨（第 3 周，可选）**
- BGM 选择器（内置免费音乐库 or 上传）
- 音量调节
- 音视频同步通过 fal.ai ffmpeg 处理

### 明确暂缓
- ❌ ElevenLabs TTS（Kling V3/Veo3 自带音频已足够）
- ❌ Feature G 高级漫画（在 A 和 F 验证前不启动）
- ❌ 帧级 trim/多轨叠加（不是 AI 视频的核心需求，后续按需加）

---

## 8. 详细设计文档索引

| 文档 | 内容 | 预估工期 |
|------|------|---------|
| [video-phase1-continuation.md](./video-phase1-continuation.md) | 续拍按钮 + 风格锚定完整实施规格 | ~1 周 |
| [video-phase2-storyboard.md](./video-phase2-storyboard.md) | Storyboard 4-Shot Coverage 完整实施规格 | ~4 周 |
| [video-phase4-assembly.md](./video-phase4-assembly.md) | 视频组装双轨方案完整实施规格 | ~2-3 周 |
| [video-storyboard-design.md](./video-storyboard-design.md) | Storyboard 原始产品设计文档 | (已有) |
| [../backend/jimeng-google-video-integration.md](../backend/jimeng-google-video-integration.md) | Veo/Seedance 集成调研 | (已有) |

## 9. 关键文件索引

| 文件 | 角色 |
|------|------|
| `prisma/schema.prisma` | 新增 Storyboard + Assembly 模型 |
| `src/services/video-pipeline.service.ts` | 添加 submitIndependentVideoJob |
| `src/services/providers/types.ts` | Provider adapter 接口 |
| `src/constants/models.ts` | 模型注册表 (i2vModelId, videoExtension) |
| `src/components/business/VideoPlayer.tsx` | Phase 1 续拍按钮 |
| `src/hooks/use-generate-video.ts` | 提取共享轮询逻辑 |
| `src/lib/extract-last-frame.ts` | Phase 1 末帧提取工具 (新建) |
| `src/services/storyboard-prompt-compiler.ts` | Phase 2 核心编译器 (新建) |
| `src/lib/video-preview-engine.ts` | Phase 4 WebCodecs 预览引擎 (新建) |

---

## 10. 验证方式

- Phase 1: 手动测试续拍按钮 → 末帧提取 → I2V 生成新视频 → 风格一致性对比
- Phase 2: Prompt Compiler 单元测试 (22 cases) → Storyboard CRUD E2E → 4-shot 生成集成测试
- Phase 3: Provider adapter 单元测试 → 真实 API 调用验证
- Phase 4: WebCodecs 客户端拼接测试 → fal.ai merge 导出测试 → 多浏览器兼容性

## 11. 新建文件总览

| Phase | 新建文件数 | 修改文件数 | 新依赖 |
|-------|:---------:|:---------:|--------|
| Phase 1 | 2 | 15 | 无 |
| Phase 2 | 22 | 10 | 无 |
| Phase 3 | ~2 | ~3 | 无 |
| Phase 4 | 28 | 10 | dnd-kit, mediabunny |
| **总计** | **~54** | **~38** | 5 packages |
