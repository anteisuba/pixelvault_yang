// Screen-flow data: pages (cards), columns, edges. Facts from src/app/[locale] routes,
// src/constants/{routes,navigation}.ts and the page components (2026-09-14 读码).

export const COLUMNS = [
  { id: 'entry', label: '入口', w: 300, gapAfter: 150 },
  { id: 'tools', label: '工具 · 侧栏「工具」组 6', w: 330, gapAfter: 230 },
  { id: 'go', label: '去处 · 侧栏「去处」组 5（含故事板）', w: 330, gapAfter: 190 },
  { id: 'hidden', label: '遗留 / 边缘（「敬请期待」组已删 · 633ada4a）', w: 290 },
]

// 应用壳 → 三列（侧栏三组 = 三列）
export const SHELL_EDGES = [
  { col: 'tools', label: '侧栏「工具」组 · 6 项 · ⌘⇧1/2/3' },
  { col: 'go', label: '侧栏「去处」组 · 5 项' },
  { col: 'hidden', label: '无侧栏入口 · 只靠深链 / 重定向' },
]

export const PAGES = [
  // ── 入口 ──
  {
    id: 'home', col: 'entry', title: '首页', route: '/',
    role: '营销首页，13 页横向 deck：开场作品墙 → 6 个功能页 → 5 个模型站 → 终页。',
    comps: ['HomeV4Shell', 'HomeV4Topbar', 'HomeV4Opening', 'HomeV4Fn*（×6）', 'HomeV4ModelPage', 'HomeV4Finale', 'AuthDialog'],
    feats: ['滚动 / 键盘翻页，右侧目录跳页', '开场墙拉公开画廊最新作品', '功能页与模型站只演示，卡片本身不可点', '顶栏「进入」→ 已登录去图片工作台，未登录弹登录', '页脚 → 条款 / 隐私 · 语言 zh / en / ja 切换'],
  },
  {
    id: 'auth', col: 'entry', title: '登录 / 注册', route: '/sign-in · /sign-up',
    role: 'Clerk catch-all 登录注册页；locale 级 catch-all 复用同一套。',
    comps: ['AuthCard', 'Clerk <SignIn> / <SignUp>'],
    feats: ['登录成功落图片工作台', '底部返回首页'],
  },
  // ── 应用壳 ──
  {
    id: 'shell', col: 'shell', w: 1330, title: '应用壳 · 侧栏与顶栏', route: '(main)/layout · 所有应用页共用 · 侧栏三组就是下面三列',
    role: '「分段浮岛」侧栏：去处 5 · 工具 6（2026-09-17 删去「敬请期待」组 · 633ada4a）。<1024 收成 44px 顶栏 + 抽屉。',
    comps: ['AppSidebar', 'MobileShell', 'SidebarTrigger', 'ApiKeyManager 抽屉', 'QuickSetupDialog', 'LocaleSwitcher', 'UsageBadge'],
    feats: ['默认收起为窄图标栏，切页保留、刷新回收起', '额度徽章 + 用户菜单（查看主页 → /u/[username] · 登出 → 首页）', 'API key 没有独立页：抽屉通盘管理，缺 key 处 QuickSetupDialog 内联配置', '⌘K 两处实现：工作台 StudioCommandPalette、画布 ShellCommandPalette', '⌘⇧1 / 2 / 3 切 图片 / 视频 / 音频'],
  },
  // ── 工具 ──
  {
    id: 'image', col: 'tools', title: '图片工作台', route: '/studio/image（/studio 直接转到这里）',
    role: '横向工作台：左参数栏 · 中舞台 · 右助手。生成后就地进编辑态，不再跳页。',
    comps: ['StudioWorkbenchLayout', 'StudioPromptArea', 'MainModelPicker', 'StudioReferenceRail', 'StudioCanvas / CompareGrid', 'StudioOperatorDock', 'StudioCommandPalette', 'StudioKeepChangePanel'],
    feats: ['写 prompt · 选模型 · 挂参考图（@ 引用）· 规格三档', '多模型对照矩阵一次出图', '结果就地编辑：重绘 / 替换 / 提取 / 去背景 / 超分', '「保留与改变」再生成 · 草稿自动恢复 · ?remix= 回灌', '助手改旋钮，扳机在用户'],
  },
  {
    id: 'video', col: 'tools', title: '视频工作台', route: '/studio/video',
    role: '与图片同一套外壳；轻量短片入口，复杂分镜归画布。',
    comps: ['StudioWorkspaceUI', 'StudioVideoSpecFields', 'StudioVideoReferenceSlots', 'StudioVideoQueueStrip', 'StudioDockPanelArea', 'StudioOperatorDock'],
    feats: ['文 / 图生视频 · 首尾帧与参考视频槽', '分辩率 × 时长 × 通道比价', '生成队列条：逐条预览 / 重试 / 定为最佳', '剧本 / 转脚本面板'],
  },
  {
    id: 'audio', col: 'tools', title: '配音间', route: '/studio/audio',
    role: '对话式配音间，不套 StudioProvider：房间 → 演员表 → 逐句台词。',
    comps: ['VoiceRoomPage', 'VoiceRoomRail', 'VoiceRoomStage', 'VoiceRoomCasting', 'VoiceRoomComposer', 'VoiceRoomModelChip', 'VoiceRoomVault'],
    feats: ['新建 / 重命名 / 删除房间', '配演员（音色卡）· 输入台词说一句 · 单句重录', '朗读参数 · 切 TTS 模型与渠道', '台词库回看', '页内零跨页跳转，只能靠侧栏离开；不挂助手'],
  },
  {
    id: 'threed', col: 'tools', title: '3D 生成台', route: '/studio/3d',
    role: '左设置 / 右预览：单图或文本 → GLB，五个模型。',
    comps: ['Studio3DWorkspace', 'MainModelPicker', 'AssetSelectorDialog', 'StageStepperBar', 'ModelViewer', 'QuickSetupDialog'],
    feats: ['图生 / 文生切换并保留草稿', '来源图：素材选择器或本地上传 · 多视角生成', '质量 / 格式 / 几何材质参数，高级折叠', '预览 orbit · 正面 / 侧面 / 复位', '页内无跨页跳转；「素材变 3D」深链尚未实现'],
  },
  {
    id: 'lora', col: 'tools', title: 'LoRA 工作台', route: '/studio/lora?section=generate | community | mine | train',
    role: '一页四段平级 tab（代码事实，不是文档写的三层）：出图 · 社区库 · 我的 · 训练。',
    comps: ['LoraWorkbench', 'CivitaiLibraryPane', 'HuggingFaceLoraLibrary', 'LoraAssetCard', 'LoraCollocationStatusBar', 'LoraAssistantDock', 'PresetGrid / TrainingStatusCard', 'LoraSourceRecipeModal'],
    feats: ['叠 LoRA 栈出图：触发词高亮 · 权重 · 兼容底模自动选', '社区库 Civitai / HF 双源 →「用这个」回 generate', '来源图配方「做同款」回灌', '训练：预设网格 → 状态卡 → 完成庆祝', '?style= 深链自动入栈'],
  },
  {
    id: 'canvas', col: 'tools', title: '画布 · 导演台', route: '/studio/node（文档里的 /canvas、/workbench 都不存在）',
    role: '节点图 + 项目制导演台：四类节点连线跑生成，内嵌剪辑台与助手 dock。旗舰间。',
    comps: ['NodeWorkbenchV4', 'CanvasV4 / CanvasSurface', 'ShellTopBar / BottomBar', 'ShellProjectPill', 'ShellSidePanels（节点一览 / 卡片 / 素材库 / 历史）', 'WorkbenchAssistantDockV4', 'ShellCommandPalette', 'EditDesk'],
    feats: ['双击 / 右键 / ⌘K 新增 文本 / 图片 / 声音 / 视频 节点，上传落卡', '连边跑生成，下游可重跑；镜头失败原文持久化', '项目胶囊：切换 / 新建 / 重命名 / 复制 / 删除', '左侧四面板拖卡入画布', '?canvasTool=image-edit 深链承接全站「编辑」', '画布内没有跨页跳转'],
  },
  {
    id: 'editdesk', col: 'tools', title: '剪辑台', route: '/studio/node?mode=edit',
    role: '画布的全屏模式，不是新页：V / A / M / T 四轨时间线 + 一句话排片 + 导出回画布。',
    comps: ['EditDesk', '时间线 / 预览 / 属性栏'],
    feats: ['多选视频卡「进剪辑台」', '片段记来源节点，上游更新可一键换新', '导出成片落成一张视频卡'],
  },
  // ── 去处 ──
  {
    id: 'assets', col: 'go', title: '素材库', route: '/assets?view=folders|library&generationId=…',
    role: 'Krea 式私有素材库 + 文件夹 + 详情抽屉；没有独立详情路由。',
    comps: ['KreaAssetBrowser', 'AssetFacetBar', 'AssetTile / AssetUploadTile', 'AssetFolderRail / Overview / Breadcrumb', 'AssetDetailSheet', 'AssetUploadQueuePanel', 'ProjectCreateDialog'],
    feats: ['类型 / 模型 / 时间 / 收藏 / 已发布 分面 + 搜索', '上传队列（图 / 视频 / 音频）· 拖放', '多选批量 移动 / 收藏 / 发布 / 删除', '文件夹总览、面包屑内新建子夹', '详情抽屉：参数 · 下载 · Remix 回工作台'],
  },
  {
    id: 'prompts', col: 'go', title: '提示词库', route: '/prompts?tab=inspiration · ?create=1&prompt=…',
    role: '我的模板 + 灵感广场两个 tab；深链可预填新建面板。',
    comps: ['PromptLibraryTabs', 'PromptTemplateList', 'PromptTemplateCreatePanel', 'PromptTemplateDetailDialog', 'InspirationGrid / Filters', 'PlaceholderFillDialog', 'PromptAssistantPanel'],
    feats: ['新建 / 编辑 / 删除模板（可由深链预填）', '灵感筛选与占位填充 · 复制提示词', '模板详情看来源，按类型回对应工作台', '收敛方向（公共配方并入画廊）尚未实施'],
  },
  {
    id: 'cards', col: 'go', title: '卡片', route: '/cards?tab=characters | styles | backgrounds',
    role: '角色卡 / 风格卡 / 背景卡管理台；语音卡不在这里（在配音间与画布）。',
    comps: ['CardsPageContent', 'CharacterCardManager', 'StyleCardManager / StyleCardEditor', 'SimpleCardManager', 'CardManagerToolbar', 'CardifyPreview'],
    feats: ['三 tab 切换', '新建 / 编辑 / 删除卡 · 上传参考图做角色卡', '风格卡编辑 · 背景卡管理', '除登录 CTA 外无跨页链接'],
  },
  {
    id: 'gallery', col: 'go', title: '画廊 + 作品详情', route: '/gallery · /gallery/[id]',
    role: '公开作品流；详情页展示参数与操作，是「公共配方发现」的唯一入口。',
    comps: ['GalleryFeed', 'GalleryFilterBar', 'GalleryGrid / ImageCard', 'ImageDetailModal', 'GalleryDetailVideoPlayer', 'UseLoraButton'],
    feats: ['筛选 / 搜索 / 无限流', '点卡开详情：复制链接 · 下载原图 · 看模型与消耗', '「在工作室编辑」→ 画布编辑深链', '「存为模板」→ 提示词库 · 点作者去主页'],
  },
  {
    id: 'profile', col: 'go', title: '创作者主页', route: '/u/[username]（没有 /profile）',
    role: '公开主页；私密账号或访客看受限视图。',
    comps: ['CreatorProfileView', 'ProfileHeader', 'PolaroidGrid / PolaroidCard', 'PrivateProfileView', 'ProfileEditModal'],
    feats: ['头像 / 简介 / 统计 · 公开作品栅格', '本人可编辑资料', '私密时显示锁态'],
  },
  // ── 隐藏 / 遗留 ──
  {
    id: 'oldedit', col: 'hidden', title: '旧图片编辑器', route: '/studio/edit/[[...task]]', status: 'legacy',
    role: '已退役成 307 垫片：全部转到画布 ?canvasTool=image-edit。',
    feats: ['studioImageEditPath() 标 @deprecated'],
  },
  {
    id: 'storyboard', col: 'go', title: '故事板', route: '/storyboard · /storyboard/[id]',
    role: '完整实现的真实页面；2026-09-17 随「敬请期待」组删除并入「去处」组（633ada4a）。',
    comps: ['StoryboardPage', 'StoryCard', 'StoryScrollRenderer / ComicRenderer', 'StoryExportButton', 'AssetSelectorDialog'],
    feats: ['从素材多选建故事 · 滚动 / 漫画两种渲染 · 导出'],
  },
  {
    id: 'share', col: 'hidden', title: '助手会话分享页', route: '/assistant/share/[token]',
    role: '(main) 之外、无侧栏的只读分享页。',
    feats: ['按 token 拉取会话只读展示'],
  },
  {
    id: 'legal', col: 'hidden', title: '法务页', route: '/terms · /privacy',
    role: 'LegalPage 静态页；PrivacyConsentBanner 全局横幅指向这里。',
  },
  {
    id: 'dev', col: 'hidden', title: '状态样板间', route: '/dev/ui-states',
    role: '结果区状态样板；非 dev 环境 404。',
  },
  {
    id: 'dead', col: 'hidden', title: '还没有的页', route: '/settings（进度表 13 新增）', status: 'dead',
    role: 'ROUTES.COLLECTIONS 死常量已删（4c73bf4d）。项目只活在画布胶囊与素材筛选；设置 / 用量 / key 目前全是浮层与徽章，/settings 页在共享组件段落地。',
  },
]

// kind: nav（侧栏 / 首页入口，虚线）· flow（创作主流程，紫实线）· deep（带参深链，绿实线）
export const EDGES = [
  // 入口
  { from: 'home', to: 'image', kind: 'nav', label: '顶栏「进入」' },
  { from: 'home', to: 'canvas', kind: 'nav', label: '终页 CTA' },
  { from: 'home', to: 'auth', kind: 'nav', label: '未登录' },
  { from: 'auth', to: 'image', kind: 'nav', label: '登录成功' },
  // 创作主流程
  { from: 'image', to: 'canvas', kind: 'flow', label: '附加到节点' },
  { from: 'video', to: 'canvas', kind: 'flow', label: '附加到节点' },
  { from: 'canvas', to: 'editdesk', kind: 'flow', label: '?mode=edit' },
  { from: 'image', to: 'prompts', kind: 'flow', label: '存为配方' },
  { from: 'video', to: 'prompts', kind: 'flow' },
  { from: 'image', to: 'cards', kind: 'flow', label: '卡片选择器 → 管理' },
  // 去处 → 工具（回流）
  { from: 'assets', to: 'image', kind: 'deep', label: 'Remix ?remix=' },
  { from: 'assets', to: 'video', kind: 'deep' },
  { from: 'assets', to: 'audio', kind: 'deep' },
  { from: 'assets', to: 'threed', kind: 'deep', label: '?gen=' },
  { from: 'gallery', to: 'canvas', kind: 'deep', label: '在工作室编辑 ?canvasTool=image-edit' },
  { from: 'gallery', to: 'lora', kind: 'deep', label: '用这个 LoRA' },
  { from: 'gallery', to: 'prompts', kind: 'deep', label: '存为模板 ?create=1' },
  { from: 'gallery', to: 'profile', kind: 'deep', label: '作者' },
  { from: 'prompts', to: 'image', kind: 'deep', label: '去工作台' },
  { from: 'prompts', to: 'assets', kind: 'deep' },
  { from: 'prompts', to: 'profile', kind: 'deep' },
  // 遗留 → 现役
  { from: 'oldedit', to: 'canvas', kind: 'deep', label: '307' },
]
