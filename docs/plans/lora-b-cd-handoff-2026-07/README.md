# Handoff：LoRA 装配台（方向 B）冷瓷灰白高保真视觉

## 概述

`/studio/lora` 的视觉重构交付。owner 已锁定四轴（**冷瓷灰白浅色 UI / 浮起纸面 / 石墨中性 / 柔顺连续**），结构层已 owner 逐项确认。本包是**高保真皮肤 + 精确 token 值 + 状态矩阵**的落地依据。

> **核心红线：只改皮不改骨。** 结构 / 内容 / 交互一个像素不动，只换视觉。域级 token 严格作用域在 `.domain-lora`，落 `src/app/lora.css`，**不提升为全站默认、不改全局 `@theme` / 脊柱、不外溢其它域**。

## 关于本包的文件

本包里的 `.dc.html` 是**用 HTML 做的设计参考**——展示目标外观与交互的高保真原型，**不是要直接搬进生产的代码**。工程任务是**在现有 Next.js + React + Tailwind v4 代码库里，用既有组件与模式复刻这套视觉**：

- **不重写已实现的功能结构**。页面功能骨架已真机运行（多 LoRA 混挂、配方面板、双源库、danbooru 引擎、runner 等）。落地 = 把这些**已有件重宿主进装配台 + 换冷瓷皮**（见下方「托管的已有件」表），不是从零造功能。
- 落地路径：改 `src/app/lora.css` 的 `.domain-lora` 作用域块（域/页 token）+ 组件 className；再过 `docs/checklists/ui.md` + 真机验。

## 保真度

**高保真（hifi）**。颜色、投影、圆角、间距、字号、mono 数值排版、交互态都是最终值（精确 oklch 见 `lora-cold-porcelain-tokens.md` 与 `LoRA 域 Token 规格.dc.html`）。请按 token 值像素级复刻，控件用 DS 既有组件。

字体沿用全站：正文 `--font-app-sans`（Geist），数值 `--font-geist-mono`（Geist Mono）。中文界面 + 英文数据（模型名 / 触发词保持英文）。

## 屏 / 视图

### 1. 装配台主屏（`LoRA 装配台.dc.html`） — 三栏常驻

进域第一屏 = Generate。整页锁一屏高（`height:100vh` flex 列，三栏各自内部滚动，出图键始终可达）。

**布局**：顶部模式导航（生成/库/训练，属应用壳内）+ 助手开关 → 三栏 grid `300px minmax(0,3fr) minmax(0,2fr)`，gap 14，列宽切换 280ms 缓动。助手关闭时左输入 60% / 右结果 40%（此比例不外推到助手展开态/移动端）。

- **左·装配栏（常驻）**：区块标签「装配栏」→ 底模卡（点击唤起换底模 modal，含图标 + 名 + 版本·家族·通道 mono 摘要 + 换向图标）→「LoRA 栈」标题 + 「已挂 N」计数（**上限待后端调查，暂不写死 5**）→ 竖向 LoRA 栈（每项：拖拽柄 + 封面按钮[点击聚焦其来源图，聚焦时石墨描边] + 兼容点[绿=兼容/琥珀=不符，配 title] + 名 + ×权重[点开 popover 滑杆] + 启停开关 + 移除× + 权重条 + 不兼容时琥珀警示行）→「＋添加 LoRA」虚线入口（唤起库 modal）→ 触发词 chips（mono，可单独停用=虚线删除线）→ 参考图虚线入口 → 参数 disclosure（收起显 mono 摘要 `1024×1360 · Steps · CFG · 采样器`，展开为凹槽 well 内滑杆）。可整栏收起为 60px 图标轨（切换只变宽、不变高）。
- **中·创作面**：来源图带（「正在看「X」的来源图 (N) 源角标」+ 横排缩略 + 「单击查看大图与完整配方」，随聚焦 LoRA 切换）→ 不兼容警示条（琥珀，含「切到建议底模」）→ 搭配提醒条（单行「搭配 · …」，点「查看」原位展开变更审阅卡：将变更 diff + 触发词 chips + 保留项 + 应用[石墨]/撤销）→ Prompt 主编辑面（15px/1.75，inline 高亮词 + mono 补全 chips + danbooru）→ Negative（默认折叠）→ **出图键**（石墨中性，46px/radius 11/600/字距 .12em，全页唯一大石墨块，只此一处）。
- **右·结果监视**：区块标签 → 大结果图（`aspect-ratio 1024/1360`，`flex:1` 填充列高、随页面高度伸缩，不随列宽变高）→ mono 元信息（尺寸·Steps·CFG·采样器 / Seed / 装配谱系）→ 本次会话缩略历史（>1 张才出现）。
- **助手** = 可收起右 dock（380px）。展开时若视口扣除 380 后主台仍 ≥900px 则挤压（`padding-right` 过渡），否则覆盖（不继续挤）。含上下文 chips + 变更卡（「加入搭配提醒」，不直接出图）+ 底部输入。

**状态矩阵**（顶部设计导航条可切，非产品 UI）：未挂载（纯底模也能出图）· 主态·已挂载 · 不兼容挂载（琥珀点 + 警示行 + 切建议底模）· 生成中（骨架 shimmer + 采样进度）· 出错（琥珀，保留装配可重试）· 空结果 · 配方·查看（来源配方 modal 开）· 配方·已还原（做同款后主态）· 助手覆盖<900。

### 2. 唤起浮层（同屏 dialog，共享键盘/Esc/遮罩/焦点/响应式行为，皮肤统一冷瓷）

- **库 modal**：顶 Civitai/HuggingFace/我的 三 tab + 搜索 → 分类横排（全部/人物/服装/表情/姿势/风格/概念/场景，即筛即挂）+ 底模家族横排 → 双源**同卡**网格（封面 + 家族角标 + 源角标 CIV/HF + 下载/喜欢 mono + 使用/已挂按钮）+ 真实分页（上一页/页码/下一页）。**NSFW 浅底 gating 两案并列对比**：A = 模糊 14px + 冷灰白 55% 覆罩 + 琥珀 eye-off + 「点击确认显示」；B = 降档灰化（well 88% 覆罩）+ 琥珀 NSFW 角标 +「详情内可开」。（选定一种后收敛。）
- **换底模 modal**：受挂载家族兼容约束（`getCompatibleBases`），默认「仅显示兼容当前挂载」开关开；两层分组 = ① 云端 API（自备 key·快）② Runner（平台免费额度·忠实，内再按架构分 SDXL 系 / DiT 系）。每卡：封面 + 名 + 家族·架构·通道 mono + 忠实/快 fidelity chip（中性信息，非状态色）+ 版本选择器 + 推荐 chip + 选中态（石墨描边 + 淡环）+ Coming Soon 降档说明。Anima DiT 只有 Runner → 显「Runner 唯一通道」静态标，不伪造 fal 下拉。
- **来源配方 modal**：左固定大图 + 样例条（×N）；右独立滚动结构化配方（「做同款将还原到装配台」摘要 + Prompt/Negative/底模/通道/Steps/CFG/采样器/Seed/触发词/权重，全 mono，**每 LoRA 读自己的配方**）。底部「做同款」= 只应用配方到主台（自动选兼容底模 + 填参数），不直接生成；已有输入进搭配提醒审阅。

### 3. 训练台（`LoRA 训练台.dc.html`）

普通滚动页（非一屏锁高），主列组建流 + 右栏训练历史。状态矩阵：空态（插画 + 选预设/上传双 CTA）→ 组建（① 6 预设卡[动漫角色/写实人像/艺术风格/物体 可用，SDXL·Illustrious Coming Soon；选中填类型+底模+触发词] ② 上传区[封面角标 + 移除 + N/50·至少5张] ③ 配置[名称/底模三选/触发词 mono]）→ 提交摘要卡（满 5 张且有名字才出：图片·底模·$1.20·~18min）+ 「开始训练」→ 排队中 → 训练中（进度条 + 步数/耗时）→ 完成（绿仪式卡 + 触发词提示 + 「挂载去生成」跳 Generate / 训练新的）→ 失败（琥珀 + 重试/回配置）。

### 4. 移动端（`LoRA 装配台·移动端.dc.html`）

三栏收成单列 + 底部常驻出图条（底模·LoRA 数·助手·出图）。装配栏/库/换底模/助手全部改从底部拉起的近全屏 sheet（保主台状态；软键盘遵全局 `isTouchPrimary`，不自动抢焦点）。主创作屏 = 装配摘要 chip 横排 + Prompt + 结果。桌面 60/40 与三栏不外推移动端。

## 交互与行为

- 动效：220–280ms，`cubic-bezier(.22,1,.36,1)`；库 modal 从「＋添加」方向、换底模 modal 从底模卡方向 `transform-origin` 长出；结果 280ms 淡入；栈增删 220ms 原位滑入；权重 popover / disclosure / 搭配提醒原位展开；`prefers-reduced-motion` 直切。
- 兼容点随底模动态计算（挂载家族 ≠ 底模家族 → 琥珀 + 警示行 + 建议底模动作）。兼容性不得只靠颜色，圆点必配 title/文字。
- 出图 → loading（~2.2s 骨架）→ done。结果自动持久化，不显示「入库」；普通结果不显示「做同款/重出」。会话历史刷新即清空。

## 状态管理（原型演示用，落地对接真实 hooks）

装配：`useActiveLoraStack`（栈项 · 顺序 · 启停 · 权重 · 容量）。兼容：`summarizeLoraStackCompatibility` / `getCompatibleBases` / `getDefaultBase` / `getRecommendedLoraImageModelId` / `LoraBaseModel.family` / fidelity(`loraBaseModel`)。搭配：`LoraCollocationStatusBar`。助手：`LoraAssistantDock`。库：civitai/HF hooks + `LoraLibraryCard`/`ContentTypeChipRow`/`FamilyChipRow`。训练：`useLoraTraining`（上传/提交/轮询 QUEUED→TRAINING→COMPLETED/FAILED）+ `LORA_TRAINING_PRESETS` / `LORA_TRAINING_BASE_MODELS` / `LORA_TRAINING`(MIN 5 / MAX 50 / $1.20 / 18min)。

## 设计 token

见 **`lora-cold-porcelain-tokens.md`**（完整表 + 语义脊柱映射）与可视化对照 **`LoRA 域 Token 规格.dc.html`**。摘要：

- 表面梯度：`--lora-page oklch(0.957 0.006 235)` < `--lora-well oklch(0.935 0.007 235)` < `--lora-panel #fff` < overlay(+modal 投影)。scrim `oklch(0.29 0.022 255/.38)`。
- 投影：panel `0 1px 2px rgba(30,42,66,.05),0 1px 4px rgba(30,42,66,.08)` / raise `0 1px 3px rgba(30,42,66,.09)` / modal `0 2px 8px…,0 16px 48px rgba(30,42,66,.18)`。
- 发丝线：`--lora-hairline oklch(0.915 0.008 240)` / strong `oklch(0.875 0.01 240)`。
- 文本：ink `oklch(0.29 0.022 255)` / ink-2 `oklch(0.44 0.02 252)` / muted `oklch(0.565 0.018 250)` / faint `oklch(0.70 0.012 245)`。
- 石墨主动作：`--lora-primary oklch(0.335 0.022 252)` hover `oklch(0.29 0.022 252)` fg #fff。ring `0 0 0 2px <surface>,0 0 0 4px oklch(0.565 0.04 250/.6)`。
- 功能语义色（仅两组）：ok `oklch(0.62 0.095 158)` / tint `oklch(0.965 0.02 155)`；warn `oklch(0.68 0.115 75)` / ink `oklch(0.5 0.1 70)` / tint `oklch(0.972 0.025 85)` / line `oklch(0.88 0.055 82)`。**无彩强调，效果图是唯一饱和色源。**
- radius：面板 14 / 浮层 16 / 卡 10–12 / 控件 7–8 / chip 999（全站 `--radius:10px` 基准 ±4）。

## 托管的已有件（拆 surface 不拆 engine · 别重造，只重宿主/换皮）

| 装配台区域               | 托管的现有件                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 左·底模卡 + 换底模 modal | 底模两层分组 Select（云端/Runner·SDXL/DiT）modal 化（`lora-workbench.md §4.4`）                                         |
| 左·LoRA 栈               | `useActiveLoraStack` · `LoraScaleChip` · `summarizeLoraStackCompatibility` · `LoraSpineBar` 逻辑                        |
| 左·＋添加 → 分类库 modal | `LoraLibraryCard`/`Inspector` · `ContentTypeChipRow` · `FamilyChipRow` · civitai + HF panes 收进 modal                  |
| 左·触发词 chips          | `TriggerChipRow`                                                                                                        |
| 左·参考图                | `LoraReferenceImageCards`                                                                                               |
| 左·参数 disclosure       | 现参数区                                                                                                                |
| 中·Prompt + 补全         | `PromptTagAutocomplete` + danbooru 引擎                                                                                 |
| 中·搭配提醒条            | `LoraCollocationStatusBar`                                                                                              |
| 右·结果监视              | 现结果列 / filmstrip                                                                                                    |
| 右·助手 dock             | `LoraAssistantDock`                                                                                                     |
| 来源配方 modal / 我的库  | `LoraSourceRecipeModal` / mine 收进库 modal 一个 tab                                                                    |
| 训练台                   | `useLoraTraining` · `PresetGrid` · `EmptyState` · `SubmitSummaryCard` · `CompletionCelebration` · `MobileTrainingSheet` |

## 语义脊柱映射（提槽不提皮）

`.domain-lora` 覆写：`--background`→page · `--card`/`--popover`→panel/overlay · `--muted`→well · `--foreground`→ink · `--muted-foreground`→muted · `--border`/`--input`→hairline · `--ring`→`oklch(0.565 0.04 250/.6)` · `--primary`/`--primary-foreground`→primary/#fff。半径沿用全站 `--radius`。**不要提取或套用全站 `ui/` 组件默认（深色）皮肤或其它域 token。**

## 资产

无位图资产。所有图标为内联 SVG（lucide 同款路径，落地用代码库既有 lucide-react）。效果图 / 封面 / 来源图 / 结果图在原型中均为中性冷灰占位（条纹/块 + 标注），落地对接真实图源。

## 文件

- `LoRA 装配台.dc.html` — 桌面主屏 + 全部浮层 + 状态矩阵（可交互）
- `LoRA 训练台.dc.html` — 训练台全状态（可交互）
- `LoRA 装配台·移动端.dc.html` — 移动端主创作屏 + 装配 sheet
- `LoRA 域 Token 规格.dc.html` — token 可视化对照页
- `lora-cold-porcelain-tokens.md` — token 建议书（工程侧直接读）

上游依据：`docs/references/domains/lora.md`（稳定业务契约）· `docs/references/pages/lora-workbench.md`（§4.4 底模分组）· `src/constants/lora.ts` / `lora-base-models.ts`（家族/兼容/训练常量）。

## 截图（`screenshots/`）

- `装配台-不兼容主态.png` — 三栏主屏 + 来源图带 + 不兼容警示
- `库-modal-NSFW两案.png` — 分类库 modal，含 NSFW 模糊+确认 / 降档灰化两案对比
- `换底模-modal.png` — 兼容约束 + 云端/Runner·SDXL/DiT 两层分组 + 选中态
- `配方-modal.png` — 来源配方（左大图/样例条 + 右结构化配方 + 做同款）
- `训练台-组建.png` — 预设 + 上传 + 配置 + 训练历史
- `训练台-完成.png` — 完成仪式卡（挂载去生成 / 训练新的）
- `移动端-主屏与装配sheet.png` — 单列主创作屏 + 底部拉起装配 sheet
- `Token规格页.png` — 冷瓷 token 可视化对照
