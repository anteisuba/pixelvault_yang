# 3 · UI 总纲

> 由 `gen/build-digest.mjs` 生成，与线上画布同一份内容；改内容改脚本，不要手改本文件。

## 视觉语言：一张表定全站

_PixelVault · 3 UI 总纲 · 1 / 3_

D1 已通过。数值都在 `globals.css` 的 token 里，这里只写规则；细则见仓库 `docs/references/ui-defaults.md`。Apple HIG 通则作底色（材质 · 动效），颜色走脊柱。

| 项       | 规则                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 字体三槽 | 正文 Geist + Noto Sans SC · 等宽 Geist Mono 只给数值 / 型号 id / 快捷键 / 计数 · 展示 Fraunces 只给应用内空态大标题                                                                                                     |
| 字号     | 标题 16 / 600 · 正文 14 / 400（行高 1.5）· 次级 13 · 说明 12 · 等宽 11；不许 arbitrary 字号                                                                                                                             |
| 颜色     | 中性黑白脊柱，`--primary` 纯黑；**模态不靠颜色区分**（`--modality-*` 只留给画布端口连线）；状态三档 applied / warning / risk 各带 `-surface` 淡版；文字对比 ≥ 4.5                                                       |
| 材质四层 | 底（`--surface-sunken` / `--surface-workbench`）· 卡（白 + border + shadow-card）· 浮层（磨砂 + shadow-float）· 弹层（实底 + shadow-overlay，不磨砂）；阴影收成 card / float / overlay / pressed 四个；同屏最多两层带影 |
| 两种面   | 去处页（画廊 · 素材 · 卡片 · 提示词）纯白浏览面；工具页灰底白卡工作面                                                                                                                                                   |
| 圆角     | `--radius` 0.625rem 派生七档 6 · 8 · 10 · 14 · 18 · 22 · 26；节点卡 18；chip 999                                                                                                                                        |
| 图标     | Phosphor（bold 档），统一走桶 `@/components/icons`，lucide 已全删；业务对象图标抽象几何（E1-c 待讨论）；品牌标 ANTI 另开 chat 设计，留 favicon · 胶囊 · 助手头像三个插槽                                                |
| 空态 C   | 图标位 → 展示槽标题 → 一句话 → 一枚主动作 → 可选次动作；不放插画；EmptyState 原语已收 11 处                                                                                                                             |
| 动效     | 时长 token 120 · 200 · 320 · 500；只动 transform / opacity；全部 motion-reduce；app 只用 `motion/react`（framer-motion 被 lint 拦）；GSAP 只许首页；每张画板配一张动效表                                                |

## 交互原则与共享组件

_PixelVault · 3 UI 总纲 · 2 / 3_

同一件事在全站只长一种样子。

### 交互原则

- **缺 key 不禁用**：灰显可点 → QuickSetupDialog 就地配置。
- **切模型直接切**：不提示、不撤销，不兼容的值静默回默认。
- **不挂红点、不挂额度**：失效只在 /settings/keys 标红；助手角标只数「等你的事」。
- **改动落在看得见的对象上**：字段闪一次 + 一行回执 + 可撤销；花钱才确认。
- **反问对标 Claude Code 提问框**：一次一题、竖排选项、推荐排第一、「其他，自己写」。
- **右键 = ⋯ 同一份动作注册表**（D4 定细节）；⌘K 只给键盘用户。
- **少文字**：只放用户此刻需要的（选择器一行只三件）。
- **工程底线**：浮层一律 portal 到 body；弹层不用磨砂；手机命中区 44px，同一弹层 inline 进底部 Sheet。

### 共享组件

| 组件                          | 契约                                                             | 还没并进来的                                                                                                                                                    | 状态   |
| ----------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 模型选择器                    | ModelPickerPopover：三件一行 · 右侧渠道面板 · 按型号记住         | 手机 StudioMobileModelSheet · LoRA 底模弹窗 · 助手 LLM 路由 · 画布旧 CanvasAssistantRouteSelector                                                               | 已落   |
| 能力驱动表单 · 规格 chip      | capabilities 派生；一颗合成 chip                                 | 音乐 / 音效两份 Spec 弹层                                                                                                                                       | 已落   |
| key 门 · /settings · 账号菜单 | QuickSetupDialog · 四分区 · AccountMenu                          |                                                                                                                                                                 | 已落   |
| 助手壳                        | StudioOperatorDock + Panel                                       | 旧 StudioAssistantDock / LoraAssistantDock（随 57）                                                                                                             | 已落   |
| 空态                          | EmptyState 原语                                                  | 起手屏 / 搜索无结果有意不收                                                                                                                                     | 已落   |
| 参考素材入口                  | 一个 ReferencePicker 弹层 + 一条 ReferenceRail                   | 现有 6 份：AssetSelectorDialog · AssetPickerBrowser · ImagePickerPopoverBody · AssistantReferencePicker · CanvasAssistantReferencePicker · ReferenceLandingTabs | 待设计 |
| 任务条                        | 一个 useGenerationTask 状态模型，卡上裱框显影 / 列表任务条两种皮 | 现在是五种散落表现                                                                                                                                              | 待设计 |
| 去向菜单 · 右键 · 命令        | 一份动作注册表按媒体 × 表面裁剪                                  | StudioCommandPalette · ShellCommandPalette 两份                                                                                                                 | 待设计 |
| 列表页头                      | ListPageHeader + 文件夹条                                        | 画廊仍有两套筛选头                                                                                                                                              | 待设计 |
| 卡片选择器                    | 带 role 与 @名字 进参考槽                                        |                                                                                                                                                                 | 等依赖 |
| 手机 composer                 | 一条输入条 + 一个参数抽屉                                        | 三套抽屉                                                                                                                                                        | 待设计 |

## 页面清单与仍存在的不一致

_PixelVault · 3 UI 总纲 · 3 / 3_

页面规范的全文在仓库 `docs/references/pages/` 与 `domains/`；这里是索引。不一致项 09-23 按代码复核过，已解决的不再列。

### 页面

| 路由                            | 是什么                                     | 规范                                                |
| ------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| /                               | 营销首页 v4                                | pages/home.md                                       |
| /studio/image                   | 自然语言台（图片工作台）                   | pages/studio-image-workbench.md                     |
| /studio/image/tags              | NAI 标签台                                 | pages/studio-image-workbench.md                     |
| /studio/video                   | 视频工作台（快轻短片）                     | pages/studio-video-mobile-request.md                |
| /studio/node                    | 画布导演台；`?mode=edit` = 剪辑台          | pages/node-canvas-v2.md                             |
| /studio/lora                    | LoRA 工作台（出图 · 社区库 · 我的 · 训练） | pages/lora-workbench.md                             |
| /studio/audio                   | 配音间（不挂助手）                         | domains/audio.md                                    |
| /studio/3d                      | 3D 生成台                                  | pages/studio-3d.md                                  |
| /assets · /assets/[id]          | 素材库 · 详情                              | pages/assets.md                                     |
| /gallery · /gallery/[id]        | 公开画廊                                   | domains/gallery.md                                  |
| /prompts · /cards · /storyboard | 提示词 · 卡片 · 故事板                     | pages/prompts.md · domains/cards.md                 |
| /settings/\*                    | key · 用量 · 偏好 · 助手                   | pages/settings.md                                   |
| /u/[username]                   | 个人主页                                   | —                                                   |
| 助手（非页面）                  | 三宿主同一壳                               | pages/assistant-shell-v2.md · assistant-op-table.md |

### 仍存在的不一致

_09-23 复核_

- 灯箱 5 套：StudioLightbox · StudioOperatorLightbox · QuickLook · MediaDetailViewer · LoraCoverPreviewDialog。
- 视频播放器 3 份（其中两个都叫 VideoPlayer）。
- 拖拽 4 套机制：dnd-kit（1 处）· pragmatic-drag-and-drop · 原生 HTML5 · xyflow。
- 卡片瓦片 7 套；弹层原语两套并行（ResponsiveDialog vs 裸 Dialog）；移动判据三套（useIsMobile · isTouchPrimary · 断点）。
- 素材 / 参考选择器 6 份 → D5；命令面板 2 份 → D4；模型选择器剩 4 处 → 见上页。
- `ui/` 里 5 个原语零引用（animated-collapse · aspect-ratio-selector · hyper-text · image-compare · particles）。
- 超大文件：LoraWorkbench 4625 行 · StudioOperatorPanel 2758 行 · assistant-operator.service 9927 行。
