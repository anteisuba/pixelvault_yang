# /assets 细节设计规范 — UI 样式 · 风格 · 去 AI 味

日期：2026-07-05
上游：[`2026-07-05-assets-optimization-directions.md`](2026-07-05-assets-optimization-directions.md)（方向已确认）· [`../direction.md`](../direction.md)（主基调 v1）
范围：P0 两件事（检索露出 + picker 重设计）的视觉与交互细则，P1 项的样式预埋
性质：细节设计规范，施工前仍有 4 个开放决策点（§9）需拍板

配图（本目录 `svg/`）：

- `svg/assets-detail-page-annotated.svg` — 页面标注稿
- `svg/assets-detail-picker-annotated.svg` — picker 标注稿（v2，修正确认按钮层级）

---

## 0. 定位一句话

**图书管理员的桌台，不是美术馆。** /assets 是工作面（暗房），要的是工具密度、精确、快；陈列感留给 Gallery。同一批缩略图，在 Gallery 里是展品，在这里是待取用的物料——UI 的一切样式决定都从这个差别推导。

## 1. 风格基调：暗面工作台怎么做才不像 AI 出品

先说"AI 味"在这类页面上的具体来源（不是抽象骂街，是逐条可检查的病灶）：

| #   | AI 味病灶                  | 在本页的具体表现风险                             | 反制（本规范的对应条款）                                                                       |
| --- | -------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | shadcn 默认样式直出        | 所有控件同一圆角同一灰、无密度对比，像脚手架没拆 | 圆角阶梯严格执行（§3）；工具行压缩到 28–32px（§4）                                             |
| 2   | 渐变遮罩 / 玻璃拟态 / 光晕 | tile hover 渐变黑罩、面板 backdrop-blur 滥用     | 纯色 scrim；blur 只允许 overlay 遮罩语义（HIG blur-purpose）                                   |
| 3   | 均质密度                   | 网格、侧栏、工具条全部 16px padding 一个节奏     | 非对称密度：网格疏、工具密（§2/§4）                                                            |
| 4   | hover 缩放动画             | 缩略图 hover scale-105、卡片浮起                 | **禁止 hover 缩放**。hover = 1px 白描边 + 信息渐显（§5）                                       |
| 5   | 装饰性进场动效             | 网格 stagger 进场、skeleton 大幅 shimmer         | 工具页即开即用：**首屏不做进场动画**；reveal 只属于陈列面（direction 动效 canon）              |
| 6   | 空话文案 + 插画空态        | "管理你的创意宇宙"、emoji 大图空态               | 精确文案：数字+单位+动词（"321 项 · 12 个文件夹"）；空态=一句话+起手动作（工具面板统一契约§5） |
| 7   | 彩色 accent 泛滥           | 选中态用品牌蓝/紫、徽标五颜六色                  | 无彩到底：选中=白环，唯一彩色=destructive 红（删除）与用户缩略图本身                           |
| 8   | 卡片套卡片                 | tile 外再包 border+bg 的卡壳                     | 缩略图裸贴：tile 就是图，无外壳；层级用亮度不用嵌套                                            |
| 9   | 圆角混用                   | pill、xl、md 随手混                              | 阶梯：弹层 2xl · tile xl · 控件 lg · chip full，同层不混                                       |
| 10  | 阴影表达层级               | 深底上叠 shadow-lg（看不见还糊）                 | 深面层级=亮度抬升+1px 描边（direction 原则：弱化阴影）                                         |

一句话总纲：**内容发色，UI 让位**。这一页的"颜色预算"全部花在用户的缩略图上；界面自身只有灰阶、1px 线、亮度差和一处 destructive 红。做到这一点，AI 味就先去了一半——因为 AI slop 的本质是界面在跟内容抢戏。

## 2. 页面布局细则

### 2.1 顶栏（owner 2026-07-05：**撤销搜索框**）

owner 明确：搜索框不需要。P0-1 的"检索露出"降级为仅保留**排序**（搜索整条撤掉，不做防抖/清除/`/` 聚焦那套）。顶栏维持现状结构，仅补一个排序控件：

| 元素     | 规格                                                 | 说明                                                                                      |
| -------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 标题计数 | `素材` + `当前 section 名 · N` **tabular-nums**      | 现状已如此（截图顶部"素材 收藏 3"）；N 受计数 bug 影响，见 §11                            |
| 类型分段 | 现有 ToggleGroup（图/视/音/3D）                      | 现状保留（owner 认可图一）                                                                |
| 排序     | `最新 ▾` 幽灵文字 + DropdownMenu（最新/最旧/最多赞） | 唯一新增；选非默认值时文字转 text-foreground 示状态。裸文字无按钮 chrome（taste T2 语法） |
| 密度     | 现有 4/6/8                                           | 数字 tabular-nums                                                                         |
| 选择     | 现有；激活后变 `✕ 取消选择`                          | 现状保留                                                                                  |

搜索相关的 §7 a11y 条目（search-accessible / debounce）随之作废。

### 2.2 右栏侧边栏（**owner 最关心 · 本轮设计焦点**）

现状结构（`KreaAssetBrowser.tsx:1546-1710`）：`aside w-72` 里裹一个 `border border-border/70 bg-card/60 shadow-sm rounded-xl` 卡片盒，内含两个 `SidebarSection`——「视图」（全部/收藏/已发布到画廊/本地素材，语义图标 + `Badge` 灰 pill 计数）与「文件夹」（`TreeView showLines`，`+` 建项目，项目行 hover 浮出 `+/✎/🗑`）。保留右栏、不采 direction.md 左树建议（app 壳已有全局左 nav rail，避免双左列，决策①已定）。

以下 S1–S11 把亮度阶梯 + taste 语言落到侧边栏：

**S1 拆掉"面板里套卡片"外壳** — 现在整个侧栏外面包了 `border + bg-card/60 + shadow-sm` 卡盒，这正是 shadcn 默认脸的通病（panel 里再浮一张 card）。删掉：侧栏直接坐在 rail 面（`--assets-raised`），与网格靠现有那道 hairline 分隔，无边框无阴影无 bg-card。亮度自己完成分区。

**S2 两组靠留白与组标题分层** — 「视图」（系统固定视图）+「文件夹」（用户项目树）。组标题 `text-3xs tracking-nav text-muted-foreground`，与行距拉开 8px；两组间 16px 间隙，**不画分隔线**（留白即分层）。「文件夹」组标题右侧内联 `+`（根级建项目）。

**S3 行 anatomy（视图行与文件夹叶子统一）** — 行高 32px（`pointer:fine`）/ 44px（`pointer:coarse` 触屏）；结构 = 16px 前导图标 · 8px gap · label（truncate）· 尾部计数。视图图标保留语义（全部=layers·收藏=heart·已发布=globe·本地素材=upload）；文件夹图标 = 可展开 folder / 叶子 file，展开 chevron 在 folder 图标左侧，展开旋转 120ms。

**S4 计数去掉灰 pill 徽标，改右对齐等宽数字** — 现状是 `Badge secondary` 灰底 pill（N 个灰块=噪音）。改为**右对齐 `tabular` 等宽数字**（`--assets-count` muted，无背景），贴右缘成一列——像账本/库存清单的数字列，强化"工作台仪表读数"气质（taste T3）。激活行数字略提亮到 `foreground/80`。

**S5 激活态 = 下沉井 + 左白条** — `bg-[--assets-well]`（比 rail 更暗，压进去）+ 行左缘 2px `bg-foreground` 短条。**不用彩色填充**（现状浅 pill，改）。与全页"激活=压入"的亮度语言一致（截图里"收藏""全部"的激活现状是浅 pill，统一改成下沉井）。hover = `bg-muted/40` 120ms。

**S6 树线：仅嵌套层 · 发丝级** — 现状 `showLines` 全层画线。折中：**顶层文件夹不画线**（缩进 + folder 图标已足够），**仅嵌套子项（depth≥1）画发丝级树线**（`--border` 低透明），因深层（鸣潮 › suisui/弗洛洛/爱弥丝/达妮娅/三视图）有线更好扫读。介于第一轮"全不画"与现状"全画"之间。

**S7 文件夹行 hover 动作** — 保留现状 hover 浮出 `+（建子）/✎（重命名）/🗑（删）`。细则：hover 时尾部计数淡出、动作组滑入（不挤在一起）；动作按钮 24px 命中区仅限 `pointer:fine`；**触屏另给入口**（触屏无 hover，走长按/detail，记为 P1 触屏补齐）。删除 hover 变 destructive 红。

**S8 创建项目 = 仅项目名（owner：描述用不到）** — `ProjectCreateDialog.tsx` 现有「项目名」+「可选描述」。**删掉描述 textarea**（连带 `description` state、`projectDescriptionPlaceholder`；副标题保留或缩短）。留：标题 + 单个项目名 input（autoFocus 非触屏）+ 取消/创建；Enter 提交。本轮唯一明确的代码改动，低风险。

**S9 计数按当前类型 tab 求交** — 侧栏所有计数必须与顶栏类型 tab 求交，使徽标 = 网格实际显示数。详见 §11（bug 根因 + 修法）。

**S10 行 = drop target（P1 拖拽预埋）** — P1 拖拽整理落地时，文件夹行成放置目标：drag-over 行内嵌 `ring-1 ring-foreground/40` + 轻微下沉。现在先预留 affordance，别等 P1 再补形态。

**S11 边角** — 无项目时「文件夹」组显示一句提示 + `+` 即 CTA；长名 truncate 但**计数永不 truncate**；「本地素材」现状无计数，建议补上（uploads 计数）与其余视图行一致。

### 2.3 网格与 tile

| 项    | 规格                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tile  | `aspect-square rounded-lg overflow-hidden`，**无边框无底色**——图即卡（圆角 lg，owner 2026-07-05 拍板：compact 密度吃图更稳）                            |
| gap   | 密度联动：comfortable 12px / normal 8px / compact 4px（密度切换不只是列数，gap 同步收紧，compact 下 hover 信息条不渲染）                                |
| hover | `ring-1 ring-foreground/25`（1px 白描边）+ 底部信息条渐显（纯色 `bg-background/85` 非渐变；内容=模型名 text-3xs + 类型时长）；120ms；**无缩放无位移**   |
| 选中  | `ring-2 ring-foreground` + 右上角勾徽标（`bg-foreground text-background` 的圆点勾，尺寸 20px，触屏下 44px 命中区外扩）；tile 内容 `opacity-90` 轻微退后 |
| 焦点  | `ring-2 ring-ring/60 ring-offset-2 ring-offset-background`（键盘可见，绝不移除）                                                                        |
| 图片  | `loading="lazy"` + 显式 aspect 占位防 CLS（skill §3 image-dimension）；skeleton 为静态 `bg-muted/30` 方块，shimmer 弱化或不用                           |

### 2.4 批量操作条（对齐实际功能 — 2026-07-05 校准）

**实际现状**（`KreaAssetBrowser.tsx:1780-1886`，见截图图二）是 rounded-full 胶囊浮条，`overflow-x-auto` 可横滚，动作集从左到右**共 7 个**，全部带 lucide 图标：

| 段   | 动作           | i18n key        | 实际视觉                                                      | 语义   |
| ---- | -------------- | --------------- | ------------------------------------------------------------- | ------ |
| 计数 | `已选 N`       | `selectedCount` | tabular-nums                                                  | —      |
| 选择 | 全选           | `selectAll`     | 幽灵文字（muted→foreground）                                  | —      |
| 选择 | 清除           | `selectClear`   | 幽灵文字                                                      | —      |
| 整理 | 移动到文件夹 ▾ | `bulkMove`      | `FolderInput` 图标 + DropdownMenu（未分类/各项目），描边 pill | 中性   |
| 强调 | 收藏           | `bulkFavorite`  | `Heart` 图标，**rose-500 描边 + rose 字 + hover rose/10**     | 喜欢   |
| 强调 | 发布到画廊     | `bulkPublish`   | `Globe` 图标，**`bg-foreground text-background` 反相白丸**    | 主动作 |
| 强调 | 删除           | `bulkDelete`    | `Trash2` 图标，**destructive 描边 + destructive 字**          | 危险   |

pending 态每个按钮图标换 `Loader2` 自旋；删除/发布/收藏走 `AlertDialog` 二次确认。

**优化方向**（保功能不减，只改观感）：

1. **容器改矩形**（决策③已批）：`rounded-xl h-12 bg-background/95 border border-border/60`，浮层档圆角按阶梯（pill 是 chip 语法不是容器语法）。仍是全页唯一"漂浮物"（T4），允许 shadow-lg。
2. **保留 7 动作全集**——不做我上一轮臆想的精简。功能对齐截图图二。
3. **三语义强调是现状事实，予以保留**（修正上一轮"唯一非中性=红"的错误）：收藏 rose = 喜欢语义、发布反相白丸 = 本 surface 主动作、删除红 = 危险。三者都是**语义不是装饰**，符合 direction.md 原则1"彩色只留给状态语义与用户内容"。
4. **发布反相白丸 vs studio 契约 §3**：studio 工具面板契约说"反相丸只属生成"，但那是 studio surface；assets 批量条是浏览/管理 surface，"发布到画廊"是此处最高优先级主动作，反相白丸合理。**记为 surface 差异，非破例**——两个 surface 各有其"最高优先级动作"，反相丸表达的是"本 surface 的主操作"而非特指生成。
5. **分组分隔**：计数 · | · 全选/清除 · | · 移动 · 收藏 · 发布 · 删除。删除仍靠最右，与前组留 12–16px + 一道竖分隔（destructive-nav-separation）。
6. 进出动画：translateY(8px)+fade，200ms，退出 140ms。移动端 `overflow-x-auto` 横滚保留（7 动作在窄屏放不下）。

### 2.5 空态 / 加载 / 错误

- 空态 = 一行说明 + 两个起手动作（`去生成` muted pill + `上传` muted pill），无插画无 emoji。分区空态文案要具体：收藏空 → "还没有收藏。在任意素材上按 ♥ 收进这里。"
- 加载 = 网格骨架按当前密度渲染固定格数（防 CLS），静态灰块。
- 错误 = 行内一句话 + `重试` 动作（skill §8 error-recovery），不用全屏错误页。

## 3. 圆角与层级 canon（本页执行表）

| 层                            | 圆角         | 层级表达（深面）                                                 |
| ----------------------------- | ------------ | ---------------------------------------------------------------- |
| Dialog / Drawer（picker）     | rounded-2xl  | 亮度 +1 档（`bg-sidebar`）+ `ring-1 ring-border/40`              |
| 批量浮条                      | rounded-xl   | +1 档亮度（`bg-background/95`）+ 1px 边（唯一允许 shadow-lg 处） |
| tile                          | rounded-lg   | 无壳，图即卡（owner 拍板从 xl 降 lg）                            |
| 输入框 / 按钮 / 树行 hover 块 | rounded-lg   | rest 档，无边或 `border-border/60`                               |
| chip / pill / 徽标            | rounded-full | —                                                                |

阴影：本页深面一律不加投影（浮条允许 `shadow-lg` 一处，因为它悬浮于内容之上有真实遮挡关系——这是"阴影表达真实层级"而非装饰）。

## 4. 排印细则

- **数字全部 tabular-nums**：计数徽标、"已选 N"、密度档、结果数。数字跳动时布局零位移——这是工具感的最小构成。
- 小标签统一走 `text-2xs`（11px）/`text-3xs`（10px）现有 token，**不再新增 `text-[10px]` 任意值**（css-and-tokens.md 已点名 60 处待收敛，本页新代码不添新债）。
- 树行/正文 12px（text-xs）起，10px 只用于计数与分组标题这类辅助信息。
- 字体维持 Satoshi + zh/ja 栈；不引入等宽字体，tabular-nums 足够。
- 文案语法：名词+数字+动词，禁止形容词堆砌。（"上传 · 支持 PNG/WebP ≤ 20MB" 而非 "轻松上传你的创意素材"）

## 5. 动效表（全表遵守 motion canon：曲线 `cubic-bezier(0.22,1,0.36,1)`）

| 场景                   | 时长               | 属性                                       | 备注                                             |
| ---------------------- | ------------------ | ------------------------------------------ | ------------------------------------------------ |
| tile hover 描边/信息条 | 120ms              | opacity                                    | 无 transform                                     |
| 选中勾出现             | 120ms              | scale 0.9→1 + opacity                      | 操作反馈用途                                     |
| 树行 hover/active      | 120ms              | background                                 | —                                                |
| 排序/密度切换重排      | 0                  | —                                          | **不做 FLIP 重排动画**，即时切换；工具页速度优先 |
| 批量条进出             | 200ms / 退出 140ms | translateY+opacity                         | 退出快于进入                                     |
| picker 打开            | 320ms              | 桌面 scale 0.98→1 + fade；移动 drawer 上滑 | 从触发源方向进入                                 |
| 骨架 → 内容            | 200ms              | crossfade                                  | 同容器内容替换                                   |
| 全部                   | —                  | —                                          | `prefers-reduced-motion` 时仅保留 opacity 类过渡 |

首屏网格**没有进场动画**——打开即在。这是与 Gallery（陈列面允许 reveal 500ms）最刻意的一处分野。

## 6. picker 细节（v2 标注稿）

- **chrome**：`rounded-2xl bg-sidebar ring-1 ring-border/40`（维持现有 dark island 方案与 color-scheme 处理）；桌面 `max-w-3xl`，移动 Drawer。
- **搜索行**：h-10 输入框 + 右侧 mediaType 锁定徽标（`rounded-full text-2xs bg-muted/50`，如"仅图片"）。锁定徽标是**状态说明不是按钮**——无 hover 态，不可点。
- **chips 行**：h-8；chip 遵守统一契约 §4 pill 语法（`rounded-full px-2.5 py-1 text-2xs`）；选中态 = `bg-foreground text-background`（深面白底黑字，无彩反相的 chip 级应用）；溢出走横向滚动 + 尾部"更多 ▾"。
- **最近生成**：分区标题 text-3xs uppercase；网格固定 normal 密度，tile 规格同页面。
- **内联上传**：网格尾部一枚 dashed 占位格（`border-dashed border-border/70`，hover 亮度抬升）；文件拖入弹窗任意处 → 整窗 `ring-2 ring-foreground/40` + 中央纯色提示层"松手上传"；上传完成自动选中并置于网格首位。
- **确认条（重要修正）**：多选确认按钮 **不用黑/白反相丸**。工具面板统一契约 §3：反相丸只属于「生成」。确认按钮 = muted 家族 pill（`bg-muted/65 hover:bg-muted` + "添加 3 张" tabular-nums）。上一轮方向稿 SVG 里画成了白色大按钮，**按契约修正**（v2 图已改）。
- 键盘：Esc 关闭；Enter 在单选 hover/focus 项上等效点击；焦点圈死在弹窗内。触屏打开时搜索框**不**自动聚焦。

## 7. a11y / 触达 / 性能对标（ui-ux-pro-max §1–§3）

| 规则               | 本页落点                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| contrast ≥4.5:1    | `text-muted-foreground` 在 `bg-sidebar`/`bg-background` 深面上需实测（DevTools contrast picker）；tile 底部信息条文字在 `bg-background/85` 上同测 |
| focus-states       | 全控件 `focus-visible:ring-2`；网格 P1 做 roving tabindex + 方向键                                                                                |
| touch-target ≥44px | 桌面树行 32px 仅限 pointer:fine；`(pointer:coarse)` 下树行/勾徽标命中区 ≥44px                                                                     |
| aria               | tile 在选择模式 `aria-selected`；批量条 `role="toolbar"`；计数变化 `aria-live="polite"`；勾徽标按钮 `aria-label` 带素材描述                       |
| hover-vs-tap       | hover 信息条只是增强；所有信息在 detail sheet 都可达，触屏无损失                                                                                  |
| virtualize-lists   | >50 项虚拟化建议（P2-2 已排期，触发条件千级）                                                                                                     |
| image-optimization | 缩略图已走 `getGenerationThumbnailUrl`；新增信息条不引入新请求                                                                                    |
| debounce-throttle  | 搜索 300ms debounce；滚动哨兵已节流                                                                                                               |

## 7b. 侧栏计数 bug（根因已定位 · owner 反馈"会多一张"）

**现象**：类型 tab = 图片时，「收藏」徽标显示 3，网格只有 2 张图（截图三）。全部/已发布/各文件夹徽标同样偏大。

**根因**（`generation.service.ts:1015` `getAssetSectionCounts`）：侧栏计数算的是**跨所有类型的总数**——

```
favorites = count(userId, likes.some)          // 不带 outputType
byProject/unassigned = groupBy(projectId)      // 不带 outputType
byType = groupBy(outputType) → all/image/…
```

但网格是 `section ∩ 当前类型 tab`（`use-gallery` 的 `filters.type`）。用户在「图片」tab 看「收藏」，网格 = liked ∧ image = 2；侧栏 favorites = liked（含 1 个视频/音频/3D）= 3。差的那张就是被类型 tab 过滤掉的非图片收藏。**系统性**：全部/已发布/文件夹的徽标全是跨类型总数，与当前 tab 下的网格都对不上（连"全部 328"在图片 tab 下也大于实际图片数）。

**修法**（§2.2 S9）：`getAssetSectionCounts(userId, outputType?)` 加可选类型参，把 `outputType` 织入 favorites / published / byProject / unassigned / byType 的 where；`ASSET_SECTION_COUNTS` 路由接 `?type=`；`use-gallery` / 浏览器在类型 tab 变化时重取计数。这样徽标 = 网格。

**权衡（需 owner 确认）**：类型感知后，切换类型 tab 时侧栏数字会跟着变（"收藏 3"→图片 tab 下"收藏 2"）。这是正确行为（徽标=当前视图内的数量），但与"计数是该 section 的绝对总数"的直觉不同。备选是保持总数不变、接受徽标≠网格——不推荐（就是当前 bug 的现状）。

**范围**：这是 **service + api route + hook** 改动，**不在 UI-only 边界内**（CLAUDE.md UI 任务不动 `services/**`）。按分工应走后端侧（或单独立项），不与本文档的纯 UI 改动混提。本轮只定位 + 出修法，不动 service 代码。

## 8. 实现纪律（写代码时的边界）

- **不新建 `assets-*` token 家族**。css-and-tokens.md 的结论是"page-owned layout rules before token extraction"——本轮继续用 shadcn 语义 token 组合，重复 ≥3 次的值先收进组件内常量，等第二个页面需要同模式再谈提取。
- 小文本一律 `text-2xs`/`text-3xs`，禁增 `text-[10px]`/`text-[11px]`。
- 无 Tailwind 任意值新增（Hard Rule 5）；确需 viewport 约束类沿用现有 `h-[calc(100svh-3rem)]` 家族不扩张。
- i18n：新增文案 en/ja/zh 三语同步；搜索 placeholder、空态起手动作、批量条动作全部走 messages。
- 改 picker 时同步拆分 `KreaAssetBrowser`（picker surface 独立文件），拆分方案施工前列 diff 计划。

## 9. 决策点（owner 2026-07-05 已拍板）

1. **文件夹树保留右栏** ✓ — 不采 direction.md 左树建议（app 已有全局左 nav，避免双左列）。
2. **tile 圆角降 lg** ✓ — 全密度统一 `rounded-lg`（compact 吃图更稳）。
3. **批量条改矩形浮条** ✓ — pill → `rounded-xl`，需更新视觉回归基线。
4. **picker 确认按钮 muted pill** ✓（默认采纳）— 遵统一契约 §3，反相丸只属「生成」，不单点破例。

## 9b. Taste 重设计增补（2026-07-05 第三轮，design-taste-frontend 审）

配图：`svg/assets-full-page-taste.svg`。taste 审出 v1 规范仍有一处 AI slop 通病——**全部同一灰 + 描边分隔 = shadcn 默认暗色脸**。以下五条为 taste 级修正，覆盖前文对应条款（不冲突处保留）：

**T1 亮度阶梯即深度（核心）** — 暗面层级不用描边、不用阴影，用亮度表达"下沉/齐平/漂浮"三态：

- 地板（页面 bg）= 最暗 `oklch(~11%)`（示意 `#0b0b0d`）。
- rail / 右栏 = 微抬一档（`#131316`），仅靠亮度差与地板分开，中缝一条 `#1c1c1f` 近乎隐形的 hairline。
- **下沉井**（搜索框、树激活行、密度轨）= **比地板更暗** `#060608` + 顶部一道内阴影线 → 物理"按进去"的语义。
- **缩略图漂浮**（比地板亮，`#1e→#2c` 竖向微渐变）→ 内容浮在工作台面之上。tile **无描边无底盒**，靠亮度自己从地板浮出来。
  这条取代 §3"深面层级=亮度抬升+1px 描边"里对描边的依赖：描边退成兜底，亮度是主力。

**T2 顶栏按材质区分，不做等宽灰 pill 排排坐** — 控件分材质制造节奏替代单调（搜索已撤，见 §2.1）：

- 类型 = **连体分段控件**（一个 `#161619` 容器内切分，激活段抬亮 `#2e2e35`），不是四个独立按钮。
- 排序 = **裸文字 + ▾**，零按钮 chrome（"最新 ▾"），降噪。
- 密度 = 迷你连体 4/6/8（激活档抬亮），与类型同语法。
- 选择 = 幽灵描边。
  控件靠材质自证功能，不靠一排等宽 pill。同一语法延伸到侧栏（§2.2 S1/S4/S5）。

**T3 计数与元数据走等宽数字体** — 所有 `321 / 57 / 已选 12 / Seedance·4s` 用 `font-family: ui-monospace`（tabular-nums 的加强版），让数字列成为工作台的"仪表读数"气质。这是 taste 对无彩约束下"唯一允许的排印个性"的用法。

**T4 唯一漂浮物 = 批量条** — 全页只有批量条真正"浮"在内容之上（`#202025` 比 tile 还亮 + 1px 边 + 真实投影关系）。其余一切齐平或下沉。"哪个元素能有阴影"成为强规则：只有它。⚠**修正**：批量条内部承载 §2.4 的三个语义强调（收藏 rose / 发布反相白丸 / 删除红），"唯一非中性色=红"的说法作废——批量条是全页语义色最密的地方，因为它全是动作。这不违背无彩原则：三色各有语义，UI 静息态仍全中性。

**T5 选中徽标实角化** — 勾徽标从圆点改 `rounded-md` 实角小块（`#f2f2f2` 底黑勾），与 tile 的 `rounded-lg` 呼应，比圆点更"工程"、更少消费级甜味。白环 ring-2 不变。

Anti-slop 自查（taste §9 对本页适用项）：无渐变文字、无霓虹辉光、无 emoji、无假截图、无装饰点、无 em-dash、无 section 编号眉标；唯一非中性色 = destructive 红（`#e0655f` 去饱和，非霓虹）+ 用户缩略图。主题锁死单一暗面不反转。

**落地成本提示**：T1 需要在 `globals.css` 补一组 assets 作用域的亮度阶梯变量（`--assets-floor / --assets-raised / --assets-well / --assets-tile-*`），这是本轮唯一建议新增的 CSS——因为"亮度阶梯"是本页 core 视觉契约，符合 css-and-tokens.md 的"稳定语义才提 token"标准；其余仍用 shadcn 语义 token 组合。

## 9c. 大胆方向探索（可选跃迁，成本更高 — owner 问"有没有更大胆的"）

前面 T1–T5 / S1–S11 是"把文件管理器做精致"。这一节问更根本的问题：**/assets 该不该从"文件管理器"变成"暗房检视台"？** 判断标尺——对本产品，合法的"大胆"只有一种：**更贴创作者真实的看图/翻阅/复盘工作流**；装饰性的大胆（花哨动效、炫布局本身）仍在 anti-slop 红线内。五个方向都踩这条线。

**B1 justified 网格（不裁剪，按比例排）· 观感改变最大**
现状 `aspect-square` 方格把所有图裁成正方形——但 AI 图比例极杂（竖构图人物 / 横构图场景 / 9:16 手机图 / 海报 / 方形头像）。方格裁剪 = 构图信息损失 + 千图一面。改 justified rows（Flickr / Google Photos / 即梦：行内等高、宽度按比例）或 masonry columns（Pinterest / Eagle：列内瀑布）。密度滑块从"列数"变"目标行高"。

- 为何对本产品：创作者靠**构图和比例**辨图，方格恰好抹掉这个维度。justified 让每张图完整呈现，扫读效率和"这是我的作品墙"的观感一起上台阶。
- 成本/风险：需要每图宽高比（`generation` 有 width/height？要核）；无限滚动 + justified 布局计算更重；CLS 靠 aspect 占位兜；与 P2-2 虚拟化耦合（justified 虚拟化更难）。**中高成本**。

**B2 密度升级为"工作模式"三档（暗房隐喻，扣主基调）**
现状密度 = 4/6/8 纯列数。改三档，借真实暗房术语：**接触印相（contact sheet，极密无间距，扫全局）→ 工作台（justified，当前）→ 检视（loupe 放大镜，大图 + 元数据并排）**。不是换列数，是换"工作意图"。

- 为何对：328 张时任务是"扫"，找特定图时是"检视"——两种任务，一个滑块。contact sheet / loupe 是摄影暗房真实概念，直接扣"暗房工坊，白厅画廊"主基调，比 4/6/8 有意义得多。
- 成本：contact sheet 是密排变体（低）；loupe = B3 的入口（见下）。**低到中**。

**B3 分栏检视器（inline inspector，替代 sheet 弹窗）· 工作流改变最大**
现状点图 → `AssetDetailSheet` 从侧边弹出、遮住网格、打断浏览。改：点图 → 网格收窄，**右侧原地展开检视器**（大图 + prompt 全文 + model/参数 chip + 动作 + ←/→ 翻上一张下一张），像 Lightroom / Finder 分栏。网格保持上下文，翻阅连续。

- 为何对：AIGC 复盘的真实动作是"连续看很多张 + 逐张读 prompt"，sheet 每张都要开关一次；分栏让"翻阅"变连续。呼应 direction.md 的 MeiGen route-backed overlay 思路，但做成分栏而非全屏弹层。
- ⚠**空间冲突**：右栏现在是文件夹树（决策①保留）。检视器占哪？两案：(a) 检视模式下文件夹树收起、检视器接管右侧；(b) 检视器盖在网格区右半、文件夹树不动（网格挤到左半）。**待决**。
- 成本：**中高**，但复用现有 `AssetDetailSheet` 的动作逻辑，主要是容器从 Sheet 改 inline 分栏 + ←/→ 导航。

**B4 智能分段（方格海 → 有结构的时间/模型分段）**
现状一片连续方格无锚点。改：按时间（今天 / 本周 / 更早，`createdAt` 现成）或按模型智能分段，每段一个轻 header（等宽数字计数）。像 Google Photos 时间分段。

- 为何对：328 张连续滚动没有位置感；分段给锚点，也契合仪表/账本气质（T3）。
- 成本：**低**（时间分组是纯前端 groupBy createdAt）。是本节性价比最高的一个。

**B5 prompt 一等化（hover peek + 找同款）**
现状 prompt 埋在 detail sheet。改：hover 图浮出 prompt 前若干字 + 一键"复制 prompt / 找同款"（用该图 prompt 或 model 筛选）。让最值钱的元数据浮上来。

- 为何对：调研里 Eagle 工作流的核心诉求（找图靠 prompt/model），也是 §1 的"prompt 断层"。与 B3 检视器天然配套。
- 成本：**低到中**（偏 P1-3，但配 B3 更强）。

**推荐组合与顺序**：真正把 /assets 变成"暗房检视台"的核心是 **B1（justified）+ B3（分栏检视器）+ B4（智能分段）**——三者合起来把"文件管理器方格海"变成"能连续翻阅、按结构组织、完整呈现每张图的检视台"。若想低风险先见效，**B4 → B2(contact sheet 档) → B5** 是廉价三连；B1/B3 是高投入高回报的重构，且与 P2-2 虚拟化、B3 空间冲突需先拍板。全部守无彩暗房约束，无一处为装饰而大胆。

配图：`svg/assets-bold-justified.svg`（B1+B4 暗房台面）、`svg/assets-bold-inspector.svg`（B3 分栏检视器）。

## 13. 文件夹树 = MagicUI File Tree 复刻（owner 选定 · `svg/assets-folder-magicui-clone.svg`）

owner 选定 [MagicUI File Tree](https://magicui.design/docs/components/file-tree) 作为文件夹树的形态，走"1:1 复刻交互/视觉 + 套暗房无彩皮 + 接我们业务"。

**MagicUI 源码机制**（`Tree/Folder/File/CollapseButton`，实为 shadcn-extension tree-view 同源）：

- 底层 = `@radix-ui/react-accordion`（`Root type="multiple"`）+ `ScrollArea`；`TreeContext` 管 selectedId/expandedItems/indicator。
- **展开折叠动画** = `data-[state]:animate-accordion-up/down`（shadcn accordion 关键帧）。
- **缩进引导线 `TreeIndicator`**（招牌）= `absolute left-1.5 h-full w-px bg-muted`，每个展开文件夹的子组里一条竖发丝线；`indicator` prop 默认开。
- **缩进** = 子级 `ml-5`（20px）+ `py-1 gap-1`。
- **图标** = 展开 `FolderOpenIcon` / 折叠 `FolderIcon` / 叶子 `FileIcon`（lucide，size-4）。
- **选中高亮** = `bg-muted rounded-md`。
- **纯展示，无拖放**。

**复刻矩阵**：

| 项                                  | 处理                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Radix Accordion 展开折叠动画        | **1:1 复刻**（关键帧项目已有）                                                          |
| 缩进引导线 TreeIndicator            | **1:1 复刻**（MagicUI 招牌视觉）                                                        |
| FolderOpen/Folder/File 图标         | **1:1 复刻**（lucide 现成）                                                             |
| 选中 `bg-muted` 高亮                | **暗房重皮** → 下沉井 `--assets-well` + 左白条（S5）                                    |
| 引导线 `bg-muted` + hover slate-300 | **暗房重皮** → 发丝级 `--border`，无彩 hover                                            |
| 计数                                | **新增**（MagicUI 无）→ 账本 mono 右对齐（S4）                                          |
| 未分类待办                          | **新增** → 琥珀 amber 行（唯一功能性暖色）                                              |
| hover 行内 +/✎/🗑                   | **新增**（沿用现状 CRUD）                                                               |
| **拖放 drop target**                | **新增**（MagicUI 纯展示无 DnD）→ tile/批量拖到文件夹即 `batchAssignProjectAPI`（P1-2） |
| CollapseButton 全展/全收            | 复刻（可选，放头部）                                                                    |

**依赖**：**零新增**。`@radix-ui/react-accordion` + accordion 关键帧（`tw-animate-css`/globals）项目已有。拖放用原生 DnD 或已有 `use-stable-drag-state`，不引 dnd-kit（除非虚拟化 P2-2 一起上再评估）。

**落点**：新建业务组件 `src/components/business/AssetFolderTree.tsx`——复刻 MagicUI 结构 + 暗房皮 + 接 `folderTreeData`/`setSection`/重命名/删除/`ProjectCreateDialog`/`batchAssignProjectAPI`/i18n/触屏；右栏塌成 `<AssetFolderTree/>`；移动端镜像（`folderMobileSections`）一并迁入。现有 `ui/tree-view.tsx` 在 assets 右栏不再用（保留给其他调用方，先 grep 确认不误伤）。配 `AssetFolderTree.test.tsx`。

**施工前**：出拆分 diff 计划（从 `KreaAssetBrowser` 搬哪些行、新组件 props 接口、DnD 事件流），确认后落地。

**已交付**：

- **Slice 1**（复用 `TreeView` 重皮，无新依赖）：`AssetFolderTree` 抽出 + 暗房皮（选中井+左白条 / 账本 mono 计数 / 未分类 amber 待办行）；`TreeView` 加可选 `getRowClassName`；行为不变。lint/tsc/测试绿。
- **Slice 2**（拖放整理）：`TreeView` 加可选 per-node DnD props（`onNodeDragOver/Leave/Drop`）；`AssetFolderTree` 文件夹行 + 未分类行成 drop target（drag-over 高亮 = ring+well / amber-ring），drop → `onDropAssets(projectId|null, ids)`；grid tile 加 `draggable`（非 picker 模式）+ `onDragStart`（选中集或单个，写 `ASSET_DND_MIME` payload）；`KreaAssetBrowser` 抽 `moveAssets` 核心复用给 bulk-bar + drop。新增 `src/constants/asset-dnd.ts`。测试含 2 个 drop 用例。

## 12. 工程化素材中枢（**重定位 · owner：主目的是工程化管理素材**）

定位翻转：/assets 不是画廊墙，是**素材中枢**。三个一等动作——**上传 · 分类 · 使用**——加上与其他区域的联动，是这页的全部工作。前面 T/S/B 系列的观感优化服务于此、不喧宾夺主。所谓"UI 更高级"= 让这三个动作各自变成顺手的工程操作，且中枢与下游无缝。

### 12.1 联动 IA（先看清素材怎么流动）

配图 `svg/assets-hub-ia.svg`。**上游进库 → 中枢分类 → 下游消费**：

- **上游**：Studio/画布生成自动落库 + 用户上传（`ImageSourcePicker` 上传路径 / uploads section）。
- **中枢**：/assets — 分类整理（文件夹 / 收藏 / 发布）。
- **下游**：`ImageSourcePicker`「从素材库选」→ `AssetSelectorDialog`（picker）→ Studio 参考图 / LoRA 训练多选 / 画布节点 / 3D。

**关键**：`ImageSourcePicker`（`ImageSourcePicker.tsx`）是 Studio 通用"图片来源"入口，给「上传」和「从素材库选」两条路，`mediaType` 锁 image。**同一个 picker 服务所有下游**——所以 picker 场景化（P0-2）一次改善全部联动；素材页的文件夹分类**必须在 picker 里可见**，用户才能按平时的分类快速定位。

### 12.2 上传素材（现藏在 section → 全局一等动作）

现状：上传只在「本地素材」section 内可用，粘贴上传也限该 section。=断层，上传被藏起来。高级化：

- **全局拖拽上传**：拖文件到 /assets 任意处 → 整页 drop overlay「松手上传」→ 上传。不必先切 uploads section。
- **上传即分类（工程化关键，合并动作①③）**：当前在某文件夹视图时，上传**直接落该文件夹**；在「全部」时落未分类。省掉"传完再移动"两步。
- **粘贴全局可用** + **上传队列**（多文件进度条列，Eagle 自动导入手感）。
- 顶栏常驻上传入口 + 空态上传起手（不只藏 section）。

### 12.3 分类素材（批量下拉三步 → 拖拽 + 待办队列）

现状：批量选中→底部下拉选文件夹（三步）；无拖拽；「未分类 64」是积压。高级化：

- **拖拽整理（P1-2）**：tile 拖到右栏文件夹节点即移动；批量选中拖=批量移动（§2.2 S10 已预埋 drop target）。分类核心手感。
- **未分类=待办队列**：64 张未分类是需处理的积压。给「整理」入口——进未分类后一张张/批量快速分派到文件夹（照片整理流），处理完队列见底。
- **上传即落夹**（12.2）从源头减少积压。

### 12.4 使用素材（单一 remix → 多目标「使用」出口 + 场景化 picker）

现状：从素材页"使用"一张图只有 detail sheet 的 remix；反向 picker 是素材页缩小复刻。高级化：

- **detail/hover 的「使用」多目标出口**：一张图 → 展开"用到哪"：作参考图（Studio）/ 作角色脸 / 作 LoRA 训练素材 / 送画布节点 / 发布画廊。把"这张图能去哪"显性化——中枢的下游出口。
- **picker 场景化（P0-2）+ 复用中枢文件夹**：picker 里出现同样的文件夹 chips，用户按平时分类定位，不重新找。
- **（激进）跨面板拖拽**：从素材页拖图直接进 Studio dock / 画布节点。成本高、最"高级"，需跨面板 DnD 基建，列远期。

### 12.5 "UI 更高级"的落点（延续暗房检视台语言）

- 三动作全走亮度阶梯 + 等宽仪表读数（T1/T3）；拖拽/上传/分类的反馈态用**下沉井 + 白环**，不用彩色。
- 上传队列、未分类待办、使用出口都是"工程操作"气质：数字精确、状态明确、无装饰。
- 联动处（picker / 使用出口）复用同一套 tile / 选中 / 计数语法，让"中枢"与"下游"看起来是一个系统。

### 12.6 优先级建议（三动作 × 成本）

| 动作 | 高级化项              | 成本  | 建议                                                |
| ---- | --------------------- | ----- | --------------------------------------------------- |
| 上传 | 全局拖拽 + 上传即落夹 | 低-中 | **先做**：复用现有上传管线 + drop overlay，收益立现 |
| 分类 | 拖拽整理 + 未分类待办 | 中    | P1-2 已排；drop target 已预埋                       |
| 使用 | 「使用」多目标出口    | 中    | 复用 detail 现有动作 + 展开多目标                   |
| 使用 | picker 场景化         | 中-高 | P0-2；一次改善全部联动，杠杆最高                    |
| 使用 | 跨面板拖拽            | 高    | 远期，需 DnD 基建                                   |

配图：`svg/assets-hub-ia.svg`（联动 IA）、`svg/assets-three-actions.svg`（三动作高级化）。

### 12.9 IA 调整：视图组移顶栏图标化，右栏纯文件夹（owner 2026-07-05）

owner 决定重排信息架构（配图 `svg/assets-topbar-viewseg.svg` 顶栏细节、`svg/assets-whole-page-v2.svg` 整页 v2）：

- **视图组（全部/收藏/已发布到画廊/本地素材）从右栏移到顶栏**，做成**图标 segmented**（像类型分段），紧邻类型组。图标：全部=grid / 收藏=heart / 已发布=globe / 本地素材=upload。
- **激活视图的名称 + 计数显示在标题**「素材 · 收藏 3」；图标组本身不逐个显数（4 个图标带计数会太挤），靠 hover tooltip 兜底可读性（纯图标歧义的补偿）。
- **右栏彻底腾给文件夹分类**：只剩「文件夹」组——`+` 建项目、未分类琥珀待办条、项目树（账本计数、发丝树线、下沉井激活）、底部全局上传拖拽区。视图组不再占右栏顶部，文件夹树能显示更多层、更专注。
- **系统级筛选全上顶栏**：视图（横切系统分区）+ 类型（媒体类型）都在顶栏 segmented，二者可叠加（收藏 + 图片 = 图片类收藏）；右栏 = 用户私人分类。职责清晰二分：**顶栏=系统怎么切，右栏=你怎么分**。
- 与前文的衔接：§2.2 侧栏 S1–S11 里的「视图组」条目（S2/S3 的视图行）随此调整**迁移到顶栏 segmented**；S1 去卡壳、S4 账本计数、S5 下沉井激活、S6 树线、S10 drop target **仍适用于右栏文件夹树**。计数 bug（§11）修复同样适用——顶栏视图 segmented 的激活计数、右栏文件夹计数都应随类型 tab 求交。
- **本地素材的去向**：它现在是视图 segmented 的第 4 个图标（upload）。注意它与顶栏「上传」按钮、右栏底部上传拖拽区语义不同——「本地素材」是*筛选查看*已上传的素材，「上传」按钮/拖拽区是*新增*上传。三者不冲突（一个是 view 一个是 action）。

### 12.8 整页成品（`svg/assets-whole-page-hifi.svg`，早于 12.9 IA 调整；最新整页以 `assets-whole-page-v2.svg` 为准）— 工程化素材中枢的整体样子

把前面所有决策 + 大胆方向整合成一张完整整页，严守设计理念（暗房亮度阶梯 / 无彩到底 / 内容发色 / 等宽仪表读数）。整页四个大胆选择：

1. **网格 = justified 不裁剪 + 时间智能分段（B1+B4）**。取代方格海：缩略图按原比例排（竖图窄高、横图铺宽），行内等高不裁构图；「今天 8 / 本周 40」分段 header 给 299 张位置锚点。缩略图是全页唯一有色处（低饱和），UI 全中性。
2. **上传升为一等动作（12.2）**。顶栏右端「上传」反相主按钮（从藏在 uploads section 里拎出来）+ 右栏底部常驻**全局拖拽区**「拖文件到此 · 或页面任意处」。上传两个显性入口，且拖进当前文件夹即落该夹。
3. **右栏 = 中枢控制台（非纯文件夹树）**。视图 + 文件夹（账本计数列、下沉井激活、S1 去卡壳）+ **「未分类 64 · 待整理 →」琥珀待办条**——把分类动作的积压显性成待办队列（唯一允许的功能性暖色，语义=待处理，非装饰）。
4. **使用出口 + 检视走 §12.7/§9c**。选中缩略图=白环（示意点开进检视/使用出口 §12.7）。

三动作在整页都有明确落点：**上传**（顶栏按钮 + 右栏拖拽区）·**分类**（文件夹 + 未分类待办 + 拖拽 S10）·**使用**（缩略图→检视器多目标出口）。这就是"文件管理器"与"素材中枢"的整体差别。

### 12.7 两个联动出口的成品效果（高保真 mockup）

前面是线框/流程，这两张是接近真实渲染的成品（缩略图给极低饱和色调模拟真实 AI 图 = "UI 全中性、只有作品发色"）：

**`svg/assets-use-outlet-hifi.svg` — 使用多目标出口**
点开一张素材的检视面板：左大图，右侧 标题 + 模型/尺寸 chip + prompt + 等宽参数，中段「使用到」把下游目标显性列成一列——作参考图（→Studio 图像，首行 hover 态）/ 作角色脸（→角色卡·节点）/ LoRA 训练素材（→加入训练集）/ 送画布节点（→插入当前工程）；底部左侧 收藏·下载·删除幽灵图标，右侧「发布到画廊」反相主按钮（分享 ≠ 使用，独立）。取代现状 detail 里孤零零一个 remix。复用 `AssetDetailSheet` 现有动作逻辑，增量是把单一出口扩成多目标列。

**`svg/assets-picker-scene-hifi.svg` — 场景化 picker**
Studio 点「从素材库选参考图」弹出的成品：标题 + 「仅图片」锁徽标 + ×；**文件夹 chips 横向复用中枢分类**（全部[激活]/收藏/未分类/ba/鸣潮/达妮娅/更多▾）——这是"picker 里能看到平时的文件夹"的落地；「最近生成」默认网格（选参考图 90% 拿最近，等宽计数）+ 一张 hover 白环；末位 dashed 内联上传格（拖入/粘贴上传即选中）；底部提示"点击即选用 · 拖入/粘贴上传"。对比现状 picker = 把整个素材页塞进弹窗（竖树占 40% 宽、无最近分层、不能内联传）。单选态无确认条（点即选中关闭）；多选态（LoRA）底部换「添加 N 张」muted pill（§6）。

## 10. 验证清单（施工完成后逐项报告）

1. `npm run lint && npm run build` 绿。
2. `npx playwright test e2e/visual.spec.ts`——顶栏/批量条/picker 均为有意变更，更新 win32 基线并点名快照。
3. 断言具体值：搜索框 `toHaveCSS('height','36px')`；树行触屏媒体查询 44px；勾徽标命中区；`tabular-nums` class 存在。
4. 无 Figma 稿（本文档 + SVG 即设计源），跳过 Figma 对比并注明。
5. 交互实跑（claude-in-chrome）：`/` 聚焦、搜索防抖与清除、选中环、批量条进出、picker 拖拽上传高亮、Esc、触屏不弹键盘、reduced-motion。
