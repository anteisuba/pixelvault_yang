# Home 页面优化 — 工作任务包

状态：进行中 · 起始 2026-06-03

> 活跃任务包（按 `docs/README.md`：`plans/` 只放活跃任务，完成后删除 / 归档 / 沉淀）。
> 现状事实见 `docs/design/pages/home.md`；本文件记录优化的流程、调研与决策。

## 目标

把公开首页 `/[locale]`（`HomepageShell`）做成第一个能立住 PixelVault 视觉调性的"标杆页"：

- 作为逐页优化的起点，为后续页面沉淀方向与可复用 token。
- 风险隔离：`homepage.css` 是 page-local，改动不波及 app 内部。

## 工作流（每步之间停下确认）

1. **调研 + 现状诊断**（联网，可并行）
   - 落地页 / AI 创作工具站设计最佳实践
   - 对标产品 Home 拆解
   - 当前 Home 逐 section 问题清单
   - → 产出"可优化点"（写入本文件 §调研结论 / §可优化点）
   - ⏸ **确认点 1**：你确认优化点 + 优先级
2. **方向 / 设计稿**（design-first）
   - 基于确认的优化点定方向；非琐碎改动先出设计稿
   - ⏸ **确认点 2**：你确认设计方向
3. **实现**（一次一个 section）
   - 改 `HomepageShell` + `homepage.css`，一节一 commit
   - 不动 `app/api`、`services`、Clerk、credit
4. **验证**
   - lint + build + 移动端 e2e + en/ja/zh 文本 fit + 前后截图对比
5. **沉淀**
   - 被证明复用的值才提炼为共享 token；更新 `home.md` / `status.md`

## 约束（anti-slop 红线，来自 CLAUDE.md）

禁止：紫蓝渐变、霓虹光晕、玻璃形态滥用、过度 hero 空白、深色科技蓝光风、随意装饰动效。Motion 只服务澄清状态 / 连续性 / 反馈。en/ja/zh 文本 fit 必须保，homepage 本地 CSS 作用域不外溢。

## 现状快照

结构（见 `home.md`）：sticky header（brand + LocaleSwitcher + auth CTA）→ `HomepageHero` → `HomepageFeatureSection`×N → `HomepageShowcaseRail` → `HomepageCapabilityMatrix` → `HomepageModelLineup` → `HomepageBottomCta` → `HomepageFooter`。

CSS：`homepage.css` 1302 行，page-local，含一处 light feature-band theme island（深色页面里的白色对比带）。

## 调研结论

Step 1 产出（落地页 / AI 工具站最佳实践 + 竞品 Home 拆解 + 当前页逐 section 诊断的综合）。

### 核心诊断

**Home 在卖一个生成工具，却从不展示生成。** 首屏用品类标签当标题、只有一个 outline 次级按钮、6 列裁切条不展示产品；showcase 把同样 6 张 hero 图复制后无限滚动却号称 "live keepers"；4 个 feature section 全是抽象渐变 mockup；中途还有全宽 dark→白→dark 主题硬翻转。另有品牌硬伤：首屏 eyebrow 写 `ANTEI`，但产品 / metadata 是 `PixelVault`。

### 最佳实践要点（2025–2026，联网）

- 首屏 3–5 秒说清价值：结果导向 H1（≤8 词）+ 展示真实生成产物，而非渐变上的口号。
- 一个主 CTA（首屏必有），次级仅用于真正不同的意图。
- 对生成工具，gallery 本身就是证明和 demo——精选质量、覆盖风格，别全展示。
- social proof 分层下沉（logo → 引用 → 数据 / UGC），真实创作者作品最可信。
- feature 用叙事（problem → capability → proof），一节一概念、用真实产物演示。
- motion 只服务状态 / 连续性 / 反馈，只动 transform / opacity，`prefers-reduced-motion` 门控。
- 性能（Core Web Vitals）是所有媒体改动的隐性约束。

### 竞品要点

- Krea：首屏交互式 Try-this 预设。
- Midjourney：直接进可排序 / remix 的 Explore。
- Ideogram / Recraft：真实产物即 hero（质量打法）。
- Freepik / Higgsfield：model-count badge + provider logo + flagship（"最多模型"故事）。

## 可优化点

已对齐 anti-slop 红线，按优先级排列。证据为当前代码的文件:行号。

### P0 — 首屏阻断，最先做

**1. Hero 重建**

- 问题：H1 是品类标签不是结果（"ANTEI image, video, and voice creation platform"）；首屏无主 CTA，只有 outline 的 Browse gallery（`HomepageHero.tsx:30-39`）；hero 是 6×1 裁切条（`homepage.css:523-533`），不展示产品。品牌 **ANTEI 已确认为产品名，保留不动**（调研误把统一方向写反）。
- 建议：H1 改 ≤8 词结果导向（品牌 ANTEI 保留）；加一个高对比主 CTA（如 Start creating），Browse gallery 降次级；裁切条换成真实作品网格 / prompt→结果对照（competitor: Krea / Ideogram output-as-hero）。
- anti-slop：用真实产物替代装饰，主 CTA 靠实色 + 字重而非光晕；不加新动效。

**2. Showcase 改成真画廊**

- 问题：rail 把同样 6 张 hero 图复制一遍（`HomepageShowcaseRail.tsx:6`）无限 56s 自动滚动（`homepage.css:1113-1167`），却号称 "live rail of recent keepers，每个 prompt/model 一键 remix"——自相矛盾、无卡片信息、靠装饰动效。
- 建议：改成登出态真实精选画廊（不同作品、覆盖风格、每卡 prompt + model + remix/open）；去掉复制和自动滚动；预设尺寸防 CLS。
- anti-slop：删除装饰动效（满足红线），用真产物替代填充。

### P1

**3. Feature section 上真实产品媒体**

- 问题：4 个 section 全 `media:undefined`（`homepage.ts:141/154/167/180`），回落抽象渐变 + SVG mockup；2 个有 eyebrow + CTA、2 个没有，节奏像没做完。
- 建议：每节填真实视觉 / 静音短循环（upscale / LoRA 前后对照、editing 重渲染、video 分镜）；统一 eyebrow / CTA；未上线能力用 comingSoon 标记。
- anti-slop：把抽象渐变 mockup（擦边 slop）换成真产物；循环静音 + poster + in-view 播放。

**4. 解决主题翻转 + 删 glow**

- 问题：全宽 dark→白→dark 硬翻转无过渡（`homepage.css:636-645` 强改 `--background` 等为白），读起来像坏了；bottom CTA 一次性 radial glow（blur 60px，`homepage.css:1200-1211`）。
- 建议：要么全页 dark-first 用 surface token 分区，要么让 light band 读成刻意分区（统一 inset/seam/padding）；删 glow。dark-first 系统下强制白带若冲突，先 surface 给你决定。
- anti-slop：删 blur 光晕正中红线；token 分区而非硬翻转。

**5. 删两个装饰动效**

- 问题：hero 永久 28s Ken-Burns 缩放（`homepage.css:606-613`）+ rail 自动滚动，都是装饰非功能（reveal-on-scroll 已正确门控，保留）。
- 建议：删除这两个；保留 in-view reveal；继续 `prefers-reduced-motion` 门控、只动 transform / opacity。
- anti-slop：本点就是红线执行（删装饰）。

### P2

**6. Model lineup 立差异点 + type 层级**

- 问题：扁平网格、无 flagship、无 provider logo；type scale 扁（hero 4.75rem vs feature/model/cta 共用 3.75rem 同一 class），无第二层级。
- 建议：加 model-count badge（`HOMEPAGE_MODEL_COUNTS.total` 已算未用）；建立 H1 > H2 > card 层级；突出少数 flagship + provider logo。
- anti-slop：层级靠 type / 字重 / 间距，非颜色 / 渐变 / 光晕；badge 是高可读数字。

**7. 统一 CTA 与 IA + 移动 header**

- 问题：CTA 意图全页发散（hero→gallery、feature→studio、bottom→signup、matrix 无 CTA）；移动 header 在 390px 挤了 locale + brand + 两个 auth 按钮。
- 建议：定一个主转化动作，hero/bottom 重复它、其余降次级；统一 IA 顺序；移动端收起 locale、单一 auth 动作。
- anti-slop：纯 IA + 对比 / 层级，无装饰；移动 header 更简非更花；短动词标签适配 en/ja/zh。

## Step 2 — 设计方向（P0：Hero + Showcase）

design-first：以下是方向，不是最终实现。确认后再出视觉稿 / 落代码。

### Hero 重建

- 布局：保留居中叙事，但首屏主视觉从"6×1 裁切条"换成**有分量的真实作品网格**（desktop 3–4 列 × 2 行精选，mobile 2 列），首屏即真实产物。
- H1：从品类标签改为结果导向（≤8 词），突出"多模型生成 + 永久归档"。品牌 **ANTEI** 作为 wordmark 保留。确认方向后起 3 个候选。
- 主 CTA：新增高对比实色主按钮「开始创作」（登出→注册 / 登入→Studio，复用 `HomepageAuthCta` 的 auth 分支）；「浏览作品库」降为次级 outline。
- 动效：删 hero 永久缩放；作品网格只用一次 in-view fade，`prefers-reduced-motion` 门控。

### Showcase 改真画廊

- 形态：去掉"6 张复制 + 56s 自动滚动"，改为**精选网格**（规整或 masonry），或用户可拖动的 rail（非自动）。
- 卡片：每张附 prompt（截断）+ model；hover 露出 remix/open（→ Studio 复用该 prompt）。
- 内容：精选一批**互不相同**的高质量作品，覆盖风格范围，不复制、不全展示。
- 动效：删自动滚动；保留 in-view reveal。

### 现状约束（来自代码）

- Home 是静态页（`revalidate=3600`、auth-agnostic、CTA 客户端解析）。
- `HOMEPAGE_SHOWCASE` 是 6 张静态图（`public/showcase/showcase-0X.webp`），hero 与 rail 共用、rail 复制成 12。
- 改"真实作品"需要素材：一批高质量真实产物图 + 各自 prompt / model。

### 待定决策点

1. 素材 / 数据策略（见确认）
2. 视觉稿形式（见确认）
3. H1 文案候选（确认方向后起 3 个）

### 生成 spec（给 GPT，可直接复制）

共同设计系统（两张必须一致）：dark-mode-first，深 charcoal / graphite 中性背景 + 单一 warm off-white 强调；clean grotesk（Satoshi / Neue-Montreal 类）强 scale 对比、tight tracking；统一中等圆角卡片；breathable、generous whitespace。强调靠 type / 字重 / 间距 / 真实作品，**不靠颜色或光晕**。禁：紫蓝 / 彩虹渐变、霓虹光晕、玻璃态、floating blob、tech-blue 科幻、装饰动效、巨型 outline 数字、SVG filler、fake dashboard。多语言友好（en / ja / zh，别挤）。画幅横向。

用法：在 ChatGPT 用 GPT-Image，两段分别生成 landscape 图；要求两张同一 dark palette。

**Prompt 1 — Hero（21:9）**

> A high-fidelity website hero section design mockup, wide landscape web layout, for an AI image and video creation platform called ANTEI. Dark mode: deep charcoal and graphite background, calm editorial "creator workstation" aesthetic, monochrome dark palette with a single warm off-white accent. No purple or blue gradients, no neon glow, no glassmorphism, no floating blobs. Composition: a small uppercase wordmark "ANTEI" at top-left; a large bold clean grotesk headline centered reading "Generate across every model" with a lighter sub-line "keep every result"; directly below, two buttons side by side — a solid off-white pill labeled "Start creating" and a thin outlined button labeled "Browse gallery". The dominant visual is a large gallery grid (4 columns by 2 rows) of distinct real-looking generated artworks: a photoreal portrait, an anime character, a 3D render, a cinematic landscape, a product shot, and a film frame — clean even gaps, rounded corners. Generous whitespace, strong typographic hierarchy, soft neutral lighting, crisp legible text. Premium Awwwards-quality UI design reference.

**Prompt 2 — Showcase（16:9）**

> A high-fidelity website gallery showcase section mockup, wide landscape web layout, for the same AI creation platform ANTEI — identical dark design system as the hero. Deep charcoal background, calm and breathable, monochrome dark palette with one warm off-white accent. No purple/blue gradients, no neon, no glassmorphism. Composition: a section heading at top-left in clean grotesk reading "Made with ANTEI"; below it a curated grid of distinct high-quality generated artworks spanning styles (photoreal, anime, concept art, 3D render, cinematic video frame) in a masonry layout with rounded corners and generous even spacing. Each card has a small caption bar at the bottom showing a short prompt line plus a tiny model tag pill reading "Flux", "Gemini", or "SDXL". One card shows a subtle hover state with a small "Remix" button. Strong type hierarchy, gallery-like, crisp legible text, premium Awwwards-quality UI design reference.

## Step 3 — Hero 实现计划

UI-only，不碰 `app/api` / `services` / Clerk / credit。改完跑验证再 commit。

### 改动文件

- `src/components/business/HomepageHero.tsx` — 标题结构（去掉标题内的 ANTEI 段，ANTEI 只留 header wordmark）+ 主 / 次 CTA + 作品网格。
- 新增 `src/components/business/HomepageHeroCta.tsx`（client island）— 「Start creating」auth 分支：登入→Studio、登出→注册（复用 `HomepageAuthCta` 模式）。
- `src/app/homepage.css` — `.homepage-hero-mosaic` 从 letterbox 裁切条改成作品卡片网格；删 `homepage-hero-zoom` keyframes 与 animation（保留 tile-in 入场 + reduced-motion 门控）；主 CTA 实色 pill 样式。
- `src/messages/{en,ja,zh}.json` — 改 `Homepage.hero` 文案 + 新增 `Homepage.actions.startCreating`。

### 文案（三语言）

- headline：`Generate across every model`（替换现 mediums / platform 两段）
- subline：`keep every result`
- `actions.startCreating`：`Start creating`
- `gallerySecondary`：`Browse gallery`（已有，保留为次级 outline）
- ANTEI 作为 header wordmark 保留，不再重复进标题

### 落地点决定

1. 导航：保持现状（brand + 语言 + 登录），不加 Models / Pricing / Docs。
2. 素材：**待定**——现有 6 张真实作品。先用 6 张（网格 3×2 / 2×3）还是补 2 张凑参考图的 4×2？
3. 交互：Hero 作品网格纯展示；Remix / 卡片元数据留给 Showcase（②）。
4. 文案进 en / ja / zh。

### 验证

`npm run lint && npm run build && npx playwright test e2e/mobile.spec.ts --project=mobile` + en / ja / zh 文本 fit + 前后截图对比。

## 决策记录

- 2026-06-03 · 品牌名 = **ANTEI**（owner 确认，有个人特色）。Hero / Navbar / homepage 三语言已用 ANTEI，CDN 亦为 `anteisuba.com`，保留不动；调研建议的"统一为 PixelVault"作废。Metadata 等约 35 个文件仍写 PixelVault（早期代号残留），与 ANTEI 不一致——归为独立的全局命名梳理任务，不在 Home 视觉优化内。
- 2026-06-03 · 确认点 2 输入：素材走**静态精选**（现有 6 张 showcase 即之前真实生成的作品，后续可扩充更多）；设计稿先对齐视觉再落代码。先做 P0 ① Hero + ② Showcase。
- 2026-06-03 · 生成后端调整：HF Space invoke 被禁用（gradio=none），改为产出**详细 GPT 生成 spec**（见 Step 2 §生成 spec），owner 自行用 GPT-Image 生成 Hero / Showcase 参考图。拿到图后回到**确认点 2**（确认视觉方向）再进 Step 3 实现。
- 2026-06-03 · 确认点 2 通过：owner 用 GPT 生成 Hero + Showcase 参考图，视觉方向 OK——Hero（dark + ANTEI + 结果标题 + 主/次 CTA + 真实作品网格）、Showcase（精选作品 + 每卡 prompt/model + Remix hover + 视频时长），均落地 dark-first 与 anti-slop。进 Step 3，先实现 Hero。落地待定：① header 导航（参考图加了 Models/Pricing/Docs，现状仅 brand+语言+登录）② Hero 网格张数（参考图 8、现素材 6）③ 交互范围（Remix→Studio 本期；Submit/收藏/Explore 待定）④ 文案进 en/ja/zh。
- 2026-06-03 · Step 3 Hero 代码完成：`HomepageHero`（headline/subline + 主 CTA + 8 格网格）、新建 `HomepageHeroCta`（auth 分支：登入→Studio、登出→注册）、`homepage.css`（4 列卡片网格 + 删 28s 缩放动效 + 主 CTA 实色）、三语言文案、test 重写 + HeroCta test。验证通过：vitest 5/5、lint 0 error、tsc、i18n 三语言对齐。**待 owner 补素材**：`public/showcase/showcase-07.webp` + `-08.webp`（与现有 01–06 同规格 webp），并确认 2 张 model 名（暂占位 Flux / Gemini）。补后跑 playwright 移动端 + 前后截图再 commit（暂未 commit，避免提交 broken 网格）。
