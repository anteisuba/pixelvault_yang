# UI 方向 — 主基调（v1 已确认）

日期：2026-06-11
状态：**v1 已确认**（所有者 2026-06-11 确认三项决议：双面模式 ✓ 无彩反相 CTA ✓ 落地顺序 ✓）。与 `reviews/2026-06-11-ui-audit-pass1-code.md` 配套阅读。
依据：所有者 2026-06-11 给出的参考集选择 + Pass 1 代码层审查。

## 一句话主基调

**"暗房工坊，白厅画廊。"** 创作面是深色的专业工作台，陈列面是米白的内容展厅；UI 全程无彩中性，让用户的作品成为界面上唯一的色彩来源。

## 五条原则

1. **内容发色** — UI 只用中性灰阶。主 CTA 用反相按钮（浅面黑丸 / 深面白丸，参照 MeiGen 的"使用 Prompt"与 Krea 的白色按钮），不引入品牌彩色 accent；彩色只保留给状态语义（错误/警告/成功）和用户作品本身。来源：Recraft + MeiGen 的共同气质。
2. **双面模式** — 工作面（Studio / 画布 / Assets / LoRA / 编辑工具）= 深色工作台（参照 Krea / Eagle / 即梦）；陈列面（Home / Gallery / Prompts / 各类详情页）= 米白浅灰展厅（参照 MeiGen / Recraft）。这正式化了产品现状（暗色 app 壳 + 浅色 editorial 首页），是演进不是推翻。
3. **手感即品质** — 全站对标 Figma 级交互细节：焦点环、键盘可达、44px 触达区、吸附与惯性、光标语义。画布尤甚。
4. **动效三用途** — 只为状态澄清、空间连续性、操作反馈而动；绝不装饰（CLAUDE.md anti-slop 红线的执行细则见下方动效 canon）。来源：Linear。
5. **移动端一等公民** — 所有披露走 ResponsiveOverlay（桌面 Popover/Dialog ↔ 手机底部 Drawer）；dock 感知 visualViewport；批量操作有手势方案（参照 Google Photos / 即梦）。

## 质感 canon（草案，落地时进 token）

- **灰阶**：参照 Vercel Geist 的灰阶纪律，深浅两面各一套语义 token；清除 `bg-white`/`bg-zinc-*` 等硬编码（审查 B4）。
- **CTA**：反相按钮 = 唯一的"最高优先级"控件；次级控件用描边/填充灰。
- **圆角阶梯**（修 B5）：面板/弹层 `rounded-2xl` · 卡片 `rounded-xl` · 输入与控件 `rounded-lg` · chip/pill `rounded-full`。同层级不混用。
- **层级表达**（修 B6）：三档 elevation（rest / raised / overlay）。深面用亮度抬升 + 描边表达层级（弱化阴影）；浅面用柔和阴影。
- **字体**：保持 Satoshi + ja/zh 语言栈；衬线退出产品 UI（只允许陈列面标题装饰性使用，且需单独确认）。

## 动效 canon（草案，落地为 `src/constants/motion.ts`）

- **缓动**：全站统一 `cubic-bezier(0.22, 1, 0.36, 1)`（现有 CSS 多数派，审查 B1 的胜者）；退出动画允许缩短时长替代换曲线。
- **时长刻度**（修 B2）：`fast 120ms`（hover/按压/chip 切换）· `base 200ms`（popover/menu 出现）· `slow 320ms`（drawer/dialog/面板）· `reveal 500ms`（页面级首次进场，仅陈列面）。
- **stagger**：50ms 步进，总时长封顶 300ms。
- **可达性**（修 B3）：全部 framer-motion 组件接 `useReducedMotion`；CSS 侧保持全局媒体查询。
- 横切参照系：Emil Kowalski（vaul/sonner/animations.dev，方法论与移动抽屉/toast 实现）· Linear（克制的度）· Family（移动端手感上限）。

## 确认的参考集（按面，含本项目化注记）

### Home / Landing

- Luma：能力分段叙事，一屏一个论点。
- Krea：landing 即产品演示，hero 放真实可动的生成画面，不放插画与大词。
- Recraft：作品网格自证质量；全站无彩让内容发色。
- 注记：home 属陈列面（米白），hero 可内嵌深色 Studio 实录画面形成"展厅里的暗房窗口"对比。

### Studio（生成工作区）

- Krea：底部 dock 输入范式、参数 chip 化、模型切换器、实时反馈感。
- 即梦：移动端全流程、底部抽屉参数、任务队列页（审查 D1 的"去处"）。
- Photoshop Web：上下文任务栏 → 生成完成后浮出统一 ResultActions（修 D1/D2/D3）。
- **工具栏规则**（定稿见 reviews 跟进）：chip = 状态展示器 + 统一披露（点击 → 桌面 Popover / 手机 Drawer）；chip 三态 = 空 / 已设值（显示缩略图或值）/ 不支持（不渲染，不留死按钮）；主行最多 6 个 chip，溢出收进"更多"；"浏览库"型选择（资产、LoRA 全库）从面板内二跳进全屏 overlay。

### 画布（节点工作流）

- ComfyUI：能力图谱——什么值得成为节点、端口类型颜色语义。
- Figma/FigJam：交互金标准——缩放平移、框选、吸附、选中浮动工具条（A3 浮层收编的目标形态）、空画布引导、光标细节。
- Flora：节点卡片化（大缩略图）、连线极简、生成进度呈现在节点上。

### Gallery

- Midjourney Explore：瀑布流 hover 微交互、详情 prompt+参数展示、一键"用这张的 prompt"。
- Civitai：作品↔模型↔LoRA↔prompt 关联结构、hover 信息分层（学 IA，不学视觉噪音）。
- MeiGen（实测 2026-06-11，详见下节）：详情 overlay 的排布与动作。

### Assets（资产库）

- Eagle：左侧文件夹树、智能归集、多选批量、右侧详情板、密度切换。
- Frame.io：详情侧板元数据组织、视频 hover 预览。
- Raindrop：卡片/列表/标题三档视图密度、轻量标签。
- Google Photos：移动端长按多选+拖动连选、时间轴导航、搜索即筛选。
- **产品事实**：本项目 assets 是双维组织——①全局分类（上传/生成/已发布等系统维度）②私人文件夹（用户自建）。设计须同时承载：建议全局分类做顶部 tab/智能分区，私人文件夹做左树；不照抄 Eagle 单树。

### Prompts（提示词/配方库）

- MeiGen：列表排布 + 点击后的 route-backed overlay（所有者点名要学）。
- PromptBase：prompt 卡用结果图当封面、按模型分区。
- Civitai：详情字段结构化（正/负/参数分区 + 逐字段复制）。

### LoRA 工作台

- **产品事实**：定位是 LoRA 库 + 收藏 + 训练，不承担生成；生成发生在 Studio（LoRA 以 chip 进 dock）。
- Civitai：模型库浏览/筛选/收藏 + 训练向导（上传→打标→参数→队列）。
- Eagle：收藏管理手感。
- 衔接：训完/收藏的 LoRA 一键带入 Studio dock（参照 Scenario 的"训完即用"零距离）。

## MeiGen 详情页拆解（实测）

点击卡片 → 全屏 lightbox，URL 变为 `/prompt/:id`（**route-backed overlay**：overlay 的体验 + 可分享的真实地址——正面解决审查里 gallery 弹窗/整页双轨问题）。排布：左 60% 大图居中（圆角、留白），右 40% 白面板 = 标题/作者 + 模型徽章 → 可滚动 prompt 全文 → "翻译/复制"行；图区右上 = 赞数/下载/`esc ×` 键盘提示 chip；右下两颗黑色大按钮 = **"使用 Prompt" + "用作参考图"**。hover 态：图底浮出标题/作者/赞数 + "使用创意"。
→ 直接采纳为 Prompts 详情与 Gallery 详情的共同模板；两颗大按钮即 ResultActions 在浏览场景的形态。

## 落地顺序（第一波）

0. **地基**（不可见但必须先做）：ResponsiveOverlay 披露收编 + `motion.ts`/token 清理 —— 否则每页要做两遍。
1. **Studio（样板间）**：工具栏新规则 + 结果动作组 + 移动端（C1/C2/C4）。在这里定死视觉语言。
2. **Gallery**：卡片 hover + MeiGen 式详情 overlay + 一键复用（产出的卡片与详情组件供后续页复用）。
3. **Home**：Luma 叙事 + Krea hero + Recraft 网格（复用 gallery 卡片）。
4. **Assets**：双维组织 + 详情板 + 移动多选。
5. **Prompts**：MeiGen 排布 + 图驱动卡片 + 详情 overlay 复用。
6. **画布**：Figma 手感 + Flora 节点卡 + ComfyUI 能力映射（工程量最大，依赖地基与动效系统）。
7. **LoRA**：库/收藏/训练三区（复用 assets 与 gallery 的全部模式）。

第二波（第一波完成后再动）：Cards / Arena / Storyboard / Profile / Edit 工具页 / 设置与 API Key / Auth。

## 决议记录

所有者 2026-06-11 确认：

1. **双面模式** ✓ —— 创作面深色 + 陈列面米白。
2. **无彩到底** ✓ —— 主 CTA 黑/白反相按钮，不引入品牌彩色；彩色只留给状态语义与用户内容。
3. **落地顺序** ✓ —— 按"地基 → Studio 样板间 → Gallery → Home → Assets → Prompts → 画布 → LoRA"执行，第二波再动其余页面。
4. **B4 输入条 = 方案 B「象牙工作台」** ✓（2026-06-11，对照板见 `reviews/assets/2026-06-11-b4-composer/`）—— 暗房工作台上唯一的"亮纸"：`--surface-composer` 米白（oklch 96% 0.008 95）+ 黑丸 CTA；composer 视为光面物体，其上的 CTA 按浅面规则用黑。chips/托盘的暖色对齐待 LoRA 会话收尾后补。
