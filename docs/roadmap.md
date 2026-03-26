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

## Phase B — 模型选择体验升级 (PixAI 分组学习)

> 让用户按"我想做什么"找模型，而非按 Provider 技术分组。

### B1. 模型元数据增强
- [ ] ModelOption 加 `styleTag`: `'photorealistic' | 'anime' | 'design' | 'artistic' | 'general'`
- [ ] 图片模型也加 `qualityTier`: `'premium' | 'standard' | 'budget'`
- [ ] i18n 给每个模型加 `description` 一行描述（en/ja/zh 同步）

### B2. ModelSelector 分组重构
- [ ] 默认按用途分组（写实 / 动漫 / 设计 / 通用），保留 Provider 视图作为高级切换
- [ ] 分组支持折叠/展开，budget tier 默认折叠
- [ ] Arena ELO 前 3 的模型加"推荐"标签
- [ ] 加搜索/过滤框

### B3. Prompt 预设模板
- [ ] 3-5 个内置模板（人物 / 风景 / Logo / 动漫 / 写实）
- [ ] 点击自动填入 模型 + Prompt + 参数
- [ ] 用户可保存自定义预设

---

## Phase C — 性能优化

### C1. 渲染优化
- [ ] ImageCard 加 `React.memo`
- [ ] 大型表单 handler 加 `useCallback`

### C2. 图片优化
- [ ] 关键位置 `<img>` → Next.js `<Image>`（ImageCard、ArenaGrid、GenerateForm）
- [ ] Image blur placeholder (blurhash)
- [ ] Video 加 poster 图

### C3. 加载优化
- [ ] Gallery skeleton loading grid
- [ ] ISR for gallery pages
- [ ] Image CDN optimization (WebP/AVIF auto-conversion)

---

## Phase D — 社区 & 增长功能

### D1. Prompt 分享 & 复用 (零成本增长杠杆)
- [ ] Gallery 图片加 "用这个 Prompt 生成" 按钮
- [ ] 分享链接携带 Prompt 参数

### D2. Arena 升级
- [ ] **公共竞技场 vs 个人竞技场** — 区分公共 ELO 排行和个人历史对比记录
- [ ] Arena 排行展示页 — 精美的模型对比页，适合 SEO 和社交传播

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

### F2. Advanced Generation
- [ ] Batch generation (multiple prompts in one run)
- [ ] Generation history comparison (side-by-side)
- [ ] Batch operations on profile (bulk public/private/delete)

### F3. UX — Lower API Key Barrier
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
