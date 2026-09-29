# Gallery 域 — 公开展示层（现状事实）

> 职责：公开作品 feed + 详情页，只展示用户**主动公开**的作品。**不负责**：私有素材管理、项目文件夹、provider 执行、credit/quota、社交扩张主线。

## 路由面

- `/gallery` 公开 feed（locale 前缀，`revalidate = 60`）；`/gallery/[id]` 公开详情——只解析已公开的 generation，未公开或不存在 → `notFound()`。
- 两者都是**公开路由**（middleware 白名单，见 `../backend.md` 认证节）。

## 数据路径（页面不碰 Prisma）

- feed：`GallerySearchSchema` 校验 searchParams → `getPublicGenerationPage`（generation.service）SSR 首页 → `GalleryFeed` 接管。
- 详情：`getPublicGenerationById` **slim 查询**（跳过重 JSON 列）；`isPromptPublic=false` 时 **redact prompt/negativePrompt**（隐私红线，不能破坏）。
- 媒体经 `getGenerationPreviewUrl` 渲染（R2 事实源，provider URL 不做展示源）。

## 组件分工

| 组件            | 职责                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| `GalleryFeed`   | filter 状态接线 · URL query 替换 · 加载/错误 · load-more · 空态回 Studio                |
| `GalleryHeader` | 一条顶栏：画廊 N · 类型 / 模型 / 时间 / 最新下拉（复用素材页分面下拉）· 搜索 · 我赞过的 |
| `GalleryGrid`   | 瀑布流分批渐进渲染 · 近视口预量图 · 键盘空间导航 · 空态                                 |
| `ImageCard`     | 单卡：媒体 + 悬停的作者小签与 ♥ · 下载；点开交给查看器（<1024 开 `ImageDetailModal`）   |
| `GalleryViewer` | 就地查看器：大图 + 缩略轨 + 作者与配方栏（与素材页共用查看器外壳）                      |

filter 维度：search / model / sort / outputType / timeRange / liked / published / projectId。

## 已拍板方向（未实施，2026-07-19）

- Gallery 成为**公开作品与公开配方的唯一发现入口**；不再由 Prompts 维护第二套共享 feed。
- 公开单位仍是 Generation/作品或图集，不是脱离作品的 Prompt 卡。配方是作品的可展开、可比较、可复用层。
- 仅在 `isPublic=true` 且对应内容得到公开授权时展示；继续允许“作品公开、Prompt/配方保密”。
- 可公开配方目标包含 Prompt、Negative Prompt、模型、允许公开的生成参数、seed、LoRA 依赖与来源；必须通过专用 public projection 清洗，禁止直接返回完整 `snapshot` / `recipeSnapshot` / 私有引用。
- Gallery 负责浏览、搜索、比较和“使用这套配方”；执行后保存到用户自己的 Prompts 工作区，私有编辑/版本管理仍不属于 Gallery。
- 旧 MeiGen 造型、展厅/画册跨页/藏书票隐喻随视觉规则重建废止；route-backed 详情只作为可分享 URL 与交互连续性的候选行为重新评估。

## 卡片、顶栏与详情 — 卡片与详情 A（owner 2026-09-29）

设计载体：设计画布「画廊 · 卡片与详情 · 三个方向（照素材页 A）」A 列 +「A / B 点开 = 就地查看器」+「作者没公开提示词」+ 动效表。与素材页 A 同一套皮、同一种查看器（`../pages/assets.md` §3「详情」）。

**顶栏收成一条**（与素材页同一颗）：「画廊 N」+ 类型 / 模型 / 时间 / 最新四个下拉（素材页的分面下拉，画廊没有「状态」那一格；模型选项来自模型目录）+ 搜索框 + 「我赞过的」。替掉原来的大标题、「已显示 20 / 26」胶囊、三组分段与高级筛选面板。

- 吸顶：桌面贴页顶 12；平板吸在紧凑外壳那条 44 的固定栏下面；手机（顶栏折成三行）不吸。吸住的是外面一层方角页底色，头顶的缝与圆角外面都盖住，滚过去的图不从缝里露出来。

**卡片**（排法不动：瀑布流 2 / 3 / 4 列）：

- 皮照 LoRA 库：`rounded-xl`、没有描边与首张的高亮框；一上来就占位、铺中性浅灰，真图解码好后 200 由糊变清（服务端渲染出来就看得见，⛔ 再等水合才淡入）。
- 静态卡面只有媒体本体与贴在媒体上的角标（参考图 · 图层拆分 · 视频播放圆点与时长）。
- 悬停 / 键盘进到这一格：投影浮起 120；左下作者小签（头像 + 名字，点它去主页）；右上白底 ♥（带数）· 下载。⛔ 底部那条压着提示词、模型与按钮的大黑条 —— 提示词、复制、进 Studio 全部挪进查看器。
- 触屏：悬停那一层不渲染，点图进详情。

**详情 = 就地查看器**（桌面 ≥1024；平板与手机沿用 `ImageDetailModal`，owner 09-29 —— 平板 820 宽时右栏 340 把舞台挤到约 290 宽）：

- 从点的那一格长出来，盖住作品区：从顶栏底边铺底色、本体再让 12，到窗口底留 16，左右贴着画廊那一列（顶栏与侧栏留着）；关上缩回当前那一张、焦点回到它、滚动位置不变；开着时页面不跟着滚。
- 左：舞台上的大图（视频可播、音频是播放器），`‹ ›` / `←` `→` / 缩略轨在当前已加载的**图片**之间翻，首尾停住。
- 右栏 340：作者行当标题（头像 · 名字 · @handle，点它去主页）→ 做同款（原「在 Studio 使用」，带着提示词进对应工作台）· ♥ N · 分享（复制 `/gallery/<id>`）· 下载 · ⋯（存为提示词模板 · 打开原图）→ 提示词折 6 行 + 复制 → 负面 · 模型 · 尺寸 · 发布于 → 参考图 · 图层。
- **作者没公开提示词**（`isPromptPublic=false`，服务端已 redact）：提示词位置锁一行「作者没有公开这张的提示词」，做同款、复制提示词、负面、存为模板一起收起。
- `/gallery/<id>` 整页（可分享地址）这一轮不动。

动效表（时长只取 120 / 200 / 240 / 320）：首屏占位浅灰 → 200 由糊变清；悬停投影与小签 120；点 ♥ 数字跳一下 240；复制键换字「已复制」1.2 秒；下拉从键长出来 0.72 → 1；换筛选旧结果变淡留着、新结果 200 淡入；查看器开 320（0.3 → 1）· 关 240 缩回当前那一张 · 翻张 200；减少动态效果下位移缩放一律换 120 淡入淡出。

## Source of Truth

`src/app/[locale]/(main)/gallery/**` · `src/services/generation.service.ts`（getPublicGenerationPage / getPublicGenerationById）· `GalleryFeed/GalleryGrid/ImageCard` 组件族；历史详版 `git show cddc4384:docs/domains/gallery.md`。

## 移动端等级（owner 2026-09-03 拍板，配方见 `../ui-defaults.md §6`）

- **完整**。公开 feed 与详情页手机是首要场景。
- 375px：feed 2 列，`gap-2`；顶栏的下拉一行放不下就换行；点开沿用 `ImageDetailModal`（媒体占满宽、信息区在下方）；视频详情播放器控件命中区 44px。
- 验收：375 图能完成「浏览 → 打开详情 → 返回保持滚动位置」主路径。

## Last Verified

- 2026-09-29 · 查看器位置：顶栏以前被外壳的 `overflow-x-hidden` 废了吸顶，往下滚再点开，查看器按滚走的顶栏定位、整块被推出屏幕上方（owner 实拍「图片又溢出了」「视频打不开」）；外壳改 `overflow-x-clip` 后顶栏吸住。无头 Chrome 1470 / 820 / 375 验：滚 1500 后顶栏 top 12（820 吸在 56）、查看器 80–784、视频可加载可播；平板 / 手机改走全屏详情（owner 09-29）。
- 2026-09-29 · 卡片与详情 A（owner 选定）：顶栏收成一条、卡片换 LoRA 皮（悬停只剩作者小签 + ♥ · 下载，底部大黑条拿掉）、桌面 / 平板点开是就地查看器；09-20 进度表 34 的卡面三态被本节取代。
- 2026-09-20 · 新增「卡片信息层级」节（进度表 34 画廊卡减负：静态只剩媒体 + 时长，作者 / 操作 hover 再出，触屏走详情弹窗）。
  2026-09-03 · 新增「移动端等级」节（owner 拍板，配方见 ui-defaults.md §6）。
  2026-07-19 · 当前代码仍是公开 Generation feed/详情；owner 已拍板公共配方发现从 Prompts 合并到 Gallery，尚未实施。Prompt redaction 与公开路由边界仍是安全红线。

## 图层拆分结果面（2026-09-18，进度表 62）

- Seedream 5.0 Pro（火山 / BytePlus）开 `layer_decomposition` 的产物：结果卡右上角「底图 + N 图层」角标（`ImageCardMedia`，左上仍是参考图角标）；详情弹窗侧栏 `GenerationLayerStrip` 逐层列出 name / description，各自可下载，缩略图放在 `.studio-alpha-checkerboard` 棋盘格底上。
- 数据：底图 = `Generation` 本身；图层 = `GenerationLayer`（`zIndex` · `boundingBox` 0–1000 归一化整数 `[left, top, right, bottom]`），`LIST_GENERATION_SELECT` 带 `layers`。只做「能看、能下载 / 存素材」，不做图层编辑或叠放预览。
