# PixelVault Node Studio 设计书

## 目标

把 `/studio/node` 从“可用的节点实验页”推进为 PixelVault 的正式创作工作台：画布优先、节点清晰、AI 助手常驻、路由和积分状态可见，并且能承接剧本、图片、视频、音频、卡片和素材的长期工作流。

本设计参考 Krea 的节点画布效率，以及 updream 的右侧 AI 助手，但不复制两者的品牌和界面。PixelVault 的差异点应放在：多模型路由、BYOK、永久归档、卡片资产复用、中文/英文/日文多语言，以及创作者从想法到生成结果的可追踪链路。

## 当前基础

已存在的实现可以保留并扩展：

- 路由入口：`src/app/[locale]/(main)/studio/node/page.tsx`
- 主画布：`src/components/business/studio/node/StudioNodeWorkbench.tsx`
- 节点：`ScriptNode.tsx`、`PlaceholderNode.tsx`
- 添加菜单：`CanvasAddMenu.tsx`
- 状态 hook：`src/hooks/use-node-workflow.ts`
- 当前节点类型：`script`、`text`、`image`、`video`、`audio`
- 技术底座：React Flow、next-intl、shadcn/ui、Tailwind、现有 API Key / model route 选择器

设计判断：不要重做画布底层。继续使用 React Flow，把重点放在信息架构、右侧助手/检查器、节点状态、工具条和生成链路。

## 设计方向

### 产品气质

`导演台式创作工作台`：黑色点阵画布作为主空间，浮动工具面板尽量克制，节点卡片像可执行的分镜/任务单。界面要专业、密集、可扫描，避免营销页式 hero、过多玻璃拟态、随机渐变和装饰光效。

### 核心原则

1. 画布是主角：默认 70% 以上视野给节点和连接线。
2. AI 助手是副驾驶，不抢占画布：右侧可折叠，支持“询问后应用”。
3. 节点即任务：每个节点必须显示输入、模型路由、状态、费用/路由健康和产物。
4. 从剧本到生成可追踪：剧本拆解出的角色、场景、段落、镜头应能转为后续节点或卡片。
5. 多模型能力要显性：API 路由、BYOK、平台 Key、失败降级和积分成本需要在合适位置露出。
6. 所有新文案走 i18n：新增 tab、按钮、空状态、错误、状态 badge 均进入 `messages/en|ja|zh.json`。

## 信息架构

### 画面分区

| 区域       | 位置                  | 责任                                                         |
| ---------- | --------------------- | ------------------------------------------------------------ |
| 左侧主导航 | 复用现有 Studio shell | 全局模块与工具入口，不在节点页内重复                         |
| 顶部项目条 | 画布左上/顶部浮动     | 项目名、保存状态、节点数、添加节点、适应屏幕、路由健康、积分 |
| 中央画布   | 主体                  | 节点、连线、拖拽、框选、右键/快捷添加                        |
| 右侧工作舱 | 画布右侧浮动/贴边     | Assistant 与 Inspector 两个主 tab                            |
| 底部工具条 | 画布底部居中          | 选择、拖动画布、连接、剪切、缩放、撤销、重做、快捷键         |
| 小地图     | 左下角                | 全局定位、缩略导航                                           |

### 右侧工作舱

右侧面板是 Krea 与 updream 的融合点：

- `Assistant`：对话式规划和批量操作入口。
- `Inspector`：选中节点的参数、模型路由、引用素材、输出历史。
- 面板底部固定输入框：支持输入意图、拖拽/粘贴图片、选择确认模式。
- 默认确认模式：`询问后应用`。删除节点、批量替换模型、消耗积分的操作必须二次确认。

不要把右侧面板做成普通聊天页。它必须能操作画布：创建节点、连接节点、解释失败、建议下一步、把剧本拆解转成角色/场景/镜头节点。

## 主画面草稿

静态画板文件：`docs/plans/frontend/studio-node-design-mockup.html`

包含三个草稿：

1. `Desktop A - Empty Canvas`：空画布、右侧 Assistant、中心起步输入、底部工具条。
2. `Desktop B - Generated Workflow`：剧本节点连接图片/视频/音频节点，右侧 Inspector 编辑视频节点。
3. `Mobile - Workflow Stack`：移动端不强行复刻大画布，默认使用节点列表/堆栈，画布作为可切换模式。

## 空画布状态

目标：用户第一次进入时能立即开始，不需要理解复杂节点系统。

画面：

- 中央只放一个紧凑 starter，不做大 hero。
- 文案：输入故事、画面、视频或角色关系。
- 主按钮：`新建剧本节点`
- 次按钮：`添加空节点`
- 示例入口：3 条短 prompt，点击后生成一个 script 节点并填入 prompt。
- 右侧 Assistant 默认打开，提示“我可以帮你拆剧本、建节点、选择模型路由”。

行为：

- 回车或点击 CTA 创建 script 节点。
- 拖入图片时创建 image/reference 类节点，后续如需新增节点类型再进入类型层扩展。
- 空画布右键仍打开 `CanvasAddMenu`。

## 生成后画布状态

当 script 节点完成拆解后，画布应自动形成第一层结构：

- Script 节点保留在中心偏左。
- 角色、场景、段落、镜头作为结构化输出，可先显示在 Script 节点内部摘要。
- 用户点击“展开为节点”后生成：
  - Character/Scene/Shot 结构节点，或先用 text 节点承载。
  - Image 节点：关键帧/角色定妆。
  - Video 节点：镜头片段。
  - Audio 节点：旁白/对白/音效。

MVP 不一定要新增所有结构节点类型；可以先用现有 `text/image/video/audio` 体系承接，但视觉上要体现来源关系。

## 节点组件规范

### 节点结构

每个节点固定为六个区域：

1. Header：类型图标、类型名、标题、状态 badge、更多操作。
2. Preview：文本摘要、图片缩略图、视频帧、音频波形或占位。
3. Prompt：可编辑 prompt 或生成后的锁定摘要。
4. Route：模型路由、BYOK/platform 标记、健康状态。
5. Footer：生成按钮、成本估算、输出数量。
6. Ports：输入/输出连接点。

### 节点状态

建议引入显式状态，放在 `types` 或常量中：

- `draft`：输入未完成。
- `ready`：可运行。
- `running`：生成中。
- `succeeded`：已有产物。
- `failed`：失败，可重试。
- `stale`：上游改变，当前结果可能过期。
- `disabled`：缺少 Key、权限或路由不可用。

### 类型色彩

延续当前色彩方向，但更克制：

- Script：amber / orange，用于故事规划。
- Text：stone，用于文本和说明。
- Image：emerald，用于图片产物。
- Video：rose，用于视频产物。
- Audio：amber-yellow，用于音频产物。
- System / route：blue 只用于状态和可点击系统信息，不作为大面积主色。

## 功能设计

### MVP

- 空画布 starter。
- 顶部项目条优化：项目名、保存状态、节点数、添加节点、适应屏幕、API 路由、积分。
- 底部工具条：选择、移动、连接、缩放、撤销、重做、快捷键。
- 右侧 Assistant / Inspector 双 tab。
- 选中节点后右侧显示 Inspector。
- Script 节点生成后打开 Inspector，而不是只打开弹窗。
- 节点状态 badge。
- 生成失败状态和重试入口。

### V1

- Assistant 能创建节点、连接节点、批量修改 prompt。
- “展开剧本”为角色/场景/镜头/关键帧节点。
- 节点输出历史。
- 卡片、素材、提示词库选择器接入 Inspector。
- 保存草稿从 toast stub 变成真实持久化。
- 快捷键面板。
- Auto layout / 整理画布。
- 路由健康抽屉。

### Later

- Turn workflow into app。
- Workflow 模板市场。
- 多人协作和分享只读画布。
- 批量执行队列与执行时间线。
- 版本历史和分支比较。
- 3D 节点作为正式节点类型。

## 关键交互

### 创建节点

- 点击顶部 `添加节点`：在视口中心打开节点菜单。
- 右键画布：在点击位置打开节点菜单。
- Assistant 输入“帮我做一个 8 秒视频工作流”：先给预览计划，再询问是否应用。

### 选中节点

- 节点出现轻量描边。
- 右侧 Inspector 自动切换到该节点。
- Inspector 顶部显示节点类型、状态、标题和更多操作。

### 运行节点

- 点击节点内生成按钮或 Inspector 内运行按钮。
- 运行中：节点显示进度、底部工具条出现执行提示。
- 成功：Preview 更新，输出历史 +1。
- 失败：节点 header 显示失败 badge，Inspector 给出安全错误文案和可行操作。

### 上游变化

如果连接的上游 prompt 或产物改变，下游节点进入 `stale`：

- badge：`需更新`
- 可操作：`沿用旧结果`、`重新生成`、`查看变化`

## 移动端设计

移动端不适合默认展示大尺寸自由画布。建议采用两种模式：

- `列表模式`：默认。节点按执行顺序堆栈展示，每个节点可展开编辑。
- `画布模式`：用户主动进入，保留缩放/拖动。

右侧 Assistant 在移动端变为底部 sheet；Inspector 使用全屏 sheet。底部导航和浏览器安全区必须避让。

## 实现分层建议

遵循项目规则的开发顺序：

1. `constants/`：新增 panel tab、tool mode、node status 常量。
2. `types/`：扩展 node workflow data/status，避免 `any`。
3. `hooks/`：拆出 selected node、tool mode、right dock state、assistant draft state。
4. `components/business/studio/node/`：补齐 top bar、bottom dock、right dock、node inspector。
5. `messages/`：补充 en/ja/zh 文案。
6. `tests / validation`：hook 测试、组件 smoke、浏览器主路径。

不要把生成业务规则塞进节点组件；节点组件只触发 hook/API client，服务端仍决定积分、权限、路由和存储。

## 验收标准

- 桌面端进入 `/zh/studio/node` 后，画布、顶部项目条、右侧面板、底部工具条不互相遮挡。
- 空画布能创建 script 节点。
- script 节点能输入 prompt、选择规划模型、触发拆解。
- 生成后可查看结构摘要，并在右侧 Inspector 编辑。
- 添加 image/video/audio 节点后，节点状态和模型路由可见。
- 小屏下右侧面板变为 bottom sheet 或全屏 sheet，不遮挡主要 CTA。
- 新增可见文案都有 en/ja/zh。
- 无组件内直接业务 fetch。

## 设计取舍

- 不采用 updream 的大右侧聊天占比作为默认，因为 PixelVault 的主任务是可编辑工作流，不是单轮对话。
- 不采用 Krea 的极简隐藏控件作为全部策略，因为 PixelVault 有路由、积分、BYOK、归档等更多业务状态，必须显性但克制。
- 不在 MVP 新增所有节点类型，避免类型系统和执行服务一起膨胀；先把现有节点做成生产级工作台，再扩展结构节点和 3D 节点。
