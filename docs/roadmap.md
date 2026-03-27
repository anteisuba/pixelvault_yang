# Roadmap — Future Features

Items ordered by execution priority. Work top-down.

---

## Phase A — Code Quality & Design Compliance (技术债清理)

> 先还债再加功能，避免问题越积越多。

### A1. 设计系统违规修复 ✅
- [x] `slider.tsx` 的 `bg-white` → `bg-background`
- [x] 7+ 文件的 `text-[10px]`/`text-[11px]` 任意值 → globals.css 定义 `text-2xs`(11px)/`text-3xs`(10px)，全局替换
- [x] ArenaForm 参考图 alt text（已有 i18n key）

### A2. 三大表单重复代码抽取 ✅
- [x] 抽取 `<ReferenceImageSection>` 到 `components/ui/`，三个表单统一引用
- [x] `<AspectRatioSelector>` 已是独立组件

### A3. Error Boundary ✅
- [x] 创建 `(main)/error.tsx` — 覆盖 Studio、Gallery、Arena、Profile、Storyboard
- [x] i18n 支持（en/ja/zh）

### A4. 动态导入 & 懒加载 ✅
- [x] PromptEnhancer → `next/dynamic`（GenerateForm, VideoGenerateForm）
- [x] ReverseEngineerPanel → `next/dynamic`（GenerateForm, ArenaForm）
- [x] AdvancedSettings → `next/dynamic`（GenerateForm, ArenaForm）
- [x] VideoGenerateForm (tab 切换后才加载) → `next/dynamic`（StudioWorkspace）

---

## Phase A+ — UX 打磨 & 可靠性加固 (CEO Review 新增)

> Cherry-picked from CEO review — 低成本高回报的改善项。

### A+1. Toast 通知补全 ✅
- [x] 删除生成、切换可见性、API Key CRUD 等操作补全成功/失败 toast
- [x] 统一 toast 风格和持续时间

### A+2. Provider 错误类型统一 ✅
- [x] 各 adapter 统一使用 `ProviderError`（带 status），不再抛裸 `Error`
- [x] Service 层 catch 保留 provider 原始状态码，避免 500 白屏

### A+3. Prisma Schema 索引优化 ✅
- [x] Generation 加 `(userId, isPublic, createdAt)` 复合索引
- [x] UserApiKey 加 `(userId, adapterType, modelId)` 唯一约束防重复
- [x] Story 加 `(userId, isPublic, createdAt)` 索引

### A+4. Prompt 可见性逻辑透明化 ✅
- [x] 公开图片加 "prompt 可见" 标签
- [x] 私密图片加 "prompt 仅自己可见" 提示
- [x] ImageCard 和 Modal 逻辑统一

### A+5. API Key 格式错误文字提示 ✅
- [x] 验证失败时显示帮助文字（如 "OpenAI key 以 sk- 开头"）
- [x] 引导用户到正确的 key 获取页面

### A+6. 移动端语言切换入口 ✅
- [x] MobileTabBar 顶部加 LocaleSwitcher

### A+7. 键盘导航 & 基础无障碍 ✅
- [x] Gallery/Arena/Studio 关键交互加 ARIA 描述
- [x] 模态框焦点管理（Radix Dialog 自带焦点捕获）
- [x] 自定义控件加 role（radiogroup/radio/tablist/tab）

### A+8. Next.js Image 格式优化 ✅
- [x] next.config.ts 加 `formats: ['image/avif', 'image/webp']`

---

## Phase B — 模型选择体验升级 (PixAI 分组学习)

> 让用户按"我想做什么"找模型，而非按 Provider 技术分组。

### B1. 模型元数据增强 ✅
- [x] ModelOption 加 `styleTag`: `'photorealistic' | 'anime' | 'design' | 'artistic' | 'general'`
- [x] 图片模型也加 `qualityTier`: `'premium' | 'standard' | 'budget'`
- [x] i18n 给每个模型加 `description` 一行描述（en/ja/zh 同步）

### B2. ModelSelector 分组重构 ✅
- [x] 默认按用途分组（写实 / 动漫 / 设计 / 通用），保留 Provider 视图作为高级切换
- [x] 分组支持折叠/展开
- [ ] Arena ELO 前 3 的模型加"推荐"标签
- [x] 加搜索/过滤框

### B3. Prompt 预设模板 ✅
- [x] 5 个内置模板（人像 / 风景 / 动漫 / Logo / 电影）
- [x] 点击自动填入 模型 + Prompt + 宽高比
- [ ] 用户可保存自定义预设

---

## Phase C — 性能优化

### C1. 渲染优化 ✅
- [x] ImageCard 加 `React.memo`
- [x] 大型表单 handler 加 `useCallback`（GenerateForm、ArenaForm）

### C2. 图片优化 ✅
- [x] 关键位置 `<img>` → Next.js `<Image>`（ImageCard、ArenaGrid、GenerateForm）
- [ ] Image blur placeholder (blurhash)
- [ ] Video 加 poster 图

### C3. 加载优化 ✅
- [x] Gallery skeleton loading grid（loading.tsx）
- [x] ISR for gallery pages（revalidate = 60s）
- [x] Image CDN optimization（WebP/AVIF 已在 next.config.ts 配置）

### C4. 免费额度剩余显示 ✅
- [x] Studio 页显示 "今天还能免费生成 X 次"（StudioWorkspace 已实现）
- [x] 复用已有的 `useUsageSummary()` hook

---

## Phase D — 社区 & 增长功能

### D1. Prompt 分享 & 复用 (零成本增长杠杆) ✅
- [x] Gallery/Detail 页加 "复制 Prompt" 和 "分享链接" 按钮
- [x] Gallery 图片加 "用这个 Prompt 生成" 按钮（一键跳转 Studio 并填入）
- [x] 分享链接携带 Prompt 参数（Studio 读取 URL ?prompt=&model= 预填）

### D2. Arena 升级 ✅
- [x] **个人竞技场** — 对战历史 + 个人模型统计（/arena/history 页面，含 ArenaHistory + ArenaPersonalStats 组件）
- [x] Arena 排行升级 — 领奖台卡片 Top 3 + 模型系列筛选 + modelFamily 字段
- [x] **模型系列追踪** — ModelEloRating 新增 modelFamily 字段 + MODEL_FAMILIES 常量映射
- [x] API 路由：GET /api/arena/history + GET /api/arena/personal-stats（含 8 个新测试）
- [x] i18n 三语言同步（ArenaHistory / ArenaPersonalStats / ArenaLeaderboard 增强）

### D2.5. Landing Page 叙事强化 ✅
- [x] 突出"你的 Key、你的图、零加价"核心差异化
- [x] 增加 BYOK + 永久存档 + Arena 三合一价值主张 section（HomepageComparison）
- [x] 对比竞品优势可视化（"为什么不用 Midjourney/OpenArt"）

### D3. 社交三件套
- [ ] Like / favorite 公共图片
- [ ] User profile 页（公开画廊 = 创作者 Portfolio）
- [ ] Follow 创作者
- [ ] Publish-to-earn — 公开分享返还部分积分

### D4. Collections / Albums
- [ ] 用户创建文件夹组织作品
- [ ] 公开集合分享 permalink

---

## Phase E — 商业化

### E1. Credits & Billing
- [ ] Credit purchase / top-up flow (Stripe or LemonSqueezy)
- [ ] Credit balance display in Navbar
- [ ] Usage analytics dashboard in Profile

### E2. Platform Credits Mode
- [ ] 用户直接付费给平台，平台用自己的 key 调用 Provider
- [ ] 需要成本核算 + 利润率计算

---

## Phase F — 产品深化

### F1. Storyboard Enhancement
- [ ] Character binding — 角色预设 + 跨帧一致性
- [ ] Character presets library
- [x] 视频播放器全屏支持（HTML5 requestFullscreen）

### F2. Advanced Generation ✅
- [ ] Batch generation (multiple prompts in one run)
- [ ] Generation history comparison (side-by-side)
- [x] Batch operations on profile (bulk public/private/delete)

### F3. 图片编辑工具 ✅
- [x] Upscale（fal.ai Aura SR 4x）
- [ ] Inpainting 局部重绘（fal.ai API）
- [x] Remove background 去背景（fal.ai BiRefNet V2）
- [x] 复用现有 adapter 架构（独立 image-edit.service）

### F4. Workflow/Pipeline 多步生成
- [ ] 串联多模型：生成 → 编辑 → 放大
- [ ] 可视化 pipeline 编辑器
- [ ] 保存和分享 workflow 模板

### F5. UX — Lower API Key Barrier
- [ ] OAuth provider login (Google, GitHub)
- [ ] Guided video tutorials per provider
- [ ] API key auto-import (browser extension)

---

## Phase G — 基础设施 & 长期

### Security — Production Readiness
- [ ] **Replace in-memory rate limiter with upstash/ratelimit + Redis**
- [ ] API key encryption key entropy validation
- [ ] API key decryption failure alerting
- [ ] R2 orphan cleanup job
- [ ] Database connection pooling tuning

### Observability
- [ ] Structured logging (generation success/failure rates)
- [ ] Grafana dashboard for API latency
- [ ] Alerting on AI provider errors

### Data
- [ ] Database backup automation
- [ ] R2 lifecycle policies
- [ ] GDPR data export / deletion flow

### Mobile App (PWA first)
- [ ] PWA support — manifest.json + service worker
- [ ] Push notifications for generation completion
- [ ] Offline gallery viewing

### Multi-tenant / Team
- [ ] Shared workspaces for teams
- [ ] Role-based access (admin, editor, viewer)
- [ ] Team billing

### CI/CD (when project stabilizes)
- [ ] GitHub Actions: `tsc --noEmit` + `vitest run`

---

## Phase W — 工作台进化 (Workbench Evolution)

> 核心目标：减少随机性、增加可控性。用户从即梦迁移，痛点是"生成像抽盲盒"。

### W0. 火山引擎 Seedance 接入 ✅
- [x] 新增 `AI_ADAPTER_TYPES.VOLCENGINE` + `volcengine.adapter.ts`
- [x] Bearer Token 认证，异步轮询模式
- [x] Seedance 1.5 Pro + 1.0 Pro 两个模型
- [x] Provider registry 注册 + provider-capabilities 配置

### W1. 多参考图支持 ✅
- [x] `useImageUpload` hook 改为多图（`referenceImages[]`、逐张删除、批量清除）
- [x] `GenerateRequestSchema` 新增 `referenceImages` 字段
- [x] Gemini adapter 支持多图输入
- [x] `provider-capabilities` 新增 `maxReferenceImages`（Gemini 14 / VolcEngine 4 / 其他 1）
- [x] `ReferenceImageSection` 重写：缩略图网格 + 内联添加按钮 + 计数器
- [x] GenerateForm / ArenaForm / VideoGenerateForm 全部适配

### W2. 项目系统 ✅
- [x] Prisma: `Project` model + `Generation.projectId` nullable FK
- [x] Migration 已部署
- [x] `project.service.ts` — CRUD + 历史查询 + 软删除
- [x] Types: `CreateProjectSchema` / `UpdateProjectSchema` / `ProjectRecord`
- [x] Constants: `API_ENDPOINTS.PROJECTS` / `PROJECT` config
- [x] API route: `GET/POST /api/projects` + `PUT/DELETE /api/projects/[id]` + `GET /api/projects/[id]/history`
- [x] `api-client.ts` 客户端函数（list / create / update / delete / history）
- [x] `useProjects` hook（CRUD + 历史分页 + activeProjectId 状态）
- [x] ProjectSelector UI（Studio 顶部项目切换器，含内联新建/重命名/删除确认）
- [x] HistoryPanel（当前项目生成历史缩略图网格，支持分页加载）
- [x] i18n 三语言同步（en/ja/zh）

### W3. 视频风格统一 + 续接（未开始）
- [ ] 项目级风格参考图锚定
- [ ] 尾帧提取 + "续接"按钮
- [ ] Storyboard 自动续接模式

### W4. 成片 + 音频（未开始）
- [ ] WebCodecs + mp4box.js 视频拼接
- [ ] ElevenLabs 声音克隆（BYOK）
- [ ] 台词 TTS + BGM + 音视频合并

---

## Already Completed (moved from roadmap)

- ~~Video Generation~~ — 5 models via fal.ai (Kling, MiniMax, Luma, WAN, Hunyuan)
- ~~API Key Management~~ — Full CRUD with AES-256-GCM encryption per user per provider
- ~~Image-to-Image~~ — Reference image support in generation
- ~~Prompt Enhancement~~ — LLM-based enhancement (4 styles)
- ~~Image Reverse Engineering~~ — Upload → extract prompt → generate variations
- ~~AI Model Arena~~ — Blind comparison with ELO ranking system
- ~~Storyboard~~ — AI narrative generation, comic/scroll view, drag reorder, PNG export
- ~~Landing Page~~ — Hero redesign, metrics bar, gallery preview section
- ~~Gallery Search & Filter~~ — Keyword search, model filter, type filter, date sort
- ~~Image Detail Page~~ — `/gallery/[id]` with OG/Twitter cards, JSON-LD, video playback
- ~~SEO & Metadata~~ — Per-page generateMetadata, sitemap.xml, robots.txt, alternate languages
- ~~Deployment Hardening~~ — Security headers, remote image patterns, public route config
- ~~Landing Page Animations~~ — CSS View Transitions scroll reveal, staggered hero entrance
- ~~Image/Video Distinction~~ — Type filter, VideoPlayer in modal/detail, VideoObject JSON-LD
- ~~Profile Enhancement~~ — Infinite scroll, search/filter, hard-delete, split stats
- ~~Mobile Navigation~~ — 5-tab MobileTabBar (Gallery/Studio/Arena/Stories/Archive)
- ~~Toast Notifications~~ — Sonner integration for generation feedback
- ~~Rate Limiting~~ — Token bucket per-user on all generation/AI endpoints
- ~~Security Hardening~~ — Error sanitization, MIME validation, webhook replay protection, storage key crypto
- ~~API Tests~~ — 97 Vitest tests covering all GET/POST/PUT/DELETE endpoints
