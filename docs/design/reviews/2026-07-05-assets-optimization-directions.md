# /assets 素材页 + 素材选择器 后续优化方向调研

日期：2026-07-05
范围：`/{locale}/assets` 素材管理页（`KreaAssetBrowser`）与 `AssetSelectorDialog` 选择器弹窗
性质：方向探索文档（audit + 外部调研），**不是施工图**；施工前按条目单独拍板

配图（本目录 `svg/`）：

- `svg/assets-current-painpoints.svg` — 现状结构与四个断层
- `svg/assets-picker-redesign.svg` — 选择器场景化重设计线框（方向稿）
- `svg/assets-roadmap.svg` — P0–P2 分期路线

---

## 1. 现状盘点（代码事实）

| 项       | 现状                                                                                               | 出处                                           |
| -------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 页面入口 | `/assets` → `KreaAssetBrowser`（**2397 行单体**）                                                  | `src/components/business/KreaAssetBrowser.tsx` |
| 区块导航 | 全部 / 收藏 / 已发布 / 本地素材 / 未分类 / 项目文件夹树                                            | 右栏 `TreeView`                                |
| 过滤     | 媒体类型 toggle（图/视频/音频/3D）；**无搜索框、无排序、无时间过滤**                               | 顶栏                                           |
| 过滤引擎 | `GalleryFilters` 已支持 `search / model / sort / timeRange / provider`，**UI 未露出**              | `src/hooks/use-gallery.ts:28-45`               |
| 网格     | 密度 4/6/8（localStorage 持久化），哨兵无限滚动，**无虚拟化、无 blur-up 占位**                     | `DENSITY_GRID_CLASS`                           |
| 选择     | 工具栏进入选择模式 + 逐张点选；**无 shift 范围选、无键盘导航、无 hover checkbox**                  | tile click handler                             |
| 批量操作 | 删除/发布/收藏/移动（底部操作条 + 下拉选文件夹）                                                   | 底部 action bar                                |
| 整理     | **无拖拽入文件夹**，移动只能走批量下拉                                                             | —                                              |
| 上传     | 仅"本地素材"区块内可上传/粘贴上传                                                                  | uploads section                                |
| 详情     | `AssetDetailSheet`：remix/移动/删除/发布/收藏/下载/存提示词模板                                    | `AssetDetailSheet.tsx`                         |
| 选择器   | `AssetSelectorDialog` = 整个浏览器塞进 `lg:max-w-3xl` 弹窗；单选/多选（LoRA）/mediaType 锁三种契约 | `AssetSelectorDialog.tsx`                      |

选择器的具体问题：它是素材页的**缩小复刻**而不是场景化工具——文件夹树在 768px 宽的弹窗里占掉约 40% 横宽；没有搜索；没有"最近生成"分层（选参考图 90% 场景是拿最近的图）；不能在弹窗内上传/粘贴一张新参考图，用户得先去 /assets 传完再回来。

## 2. 外部调研

### 2.1 Midjourney Organize（生成式产品里最成熟的素材面）

- 文件夹 + **Saved Searches**（原 Smart Folders）：把搜索词固化成"自动文件夹"，新生成的图自动落入，无需手动整理；可多个重叠、随时改词、删除无副作用。
- 右侧常驻过滤工具栏：按模型版本、宽高比、图片类型等**渐进收窄**。
- 可以"在某个文件夹内直接生成"，新图自动归档。
- 来源：[Organizing Your Creations](https://docs.midjourney.com/hc/en-us/articles/33329462451469-Organizing-Your-Creations)、[Using Folders](https://docs.midjourney.com/hc/en-us/articles/34580542725645-Using-Folders)、[Smart Folders 解析](https://readmedium.com/midjourney-automatically-organize-your-images-with-smart-folders-a810310b6eff)、[2025-02 更新综述](https://www.toolify.ai/ai-news/midjourney-updates-february-2025-folders-image-editor-v7-3332022)

**启示**：我们的 filter 组合（search + model + type + 区块）已经能表达 Saved Search 的全部语义，缺的只是"把组合存下来当伪文件夹"这一层壳。

### 2.2 Eagle（AIGC 社群事实标准的本地素材库）

- 标签 / 评分 / 注释 / 规则式智能文件夹 / 自动导入 / <0.5s 检索。
- X 上高热帖（[古一 @MANISH1027512，79.2 万曝光](https://x.com/i/status/2048684086881816854)）描述的工作流：Codex 批量生图 → 自动归档进 Eagle → **prompt 一起写进注释** → "之后翻图、复盘、找提示词、做二次创作，就不用再到处翻文件夹了"。
- 来源：[eagle.cool](https://eagle.cool/)、[Eagle 2025 评测](https://smarative.com/blog/eagle-app-review-the-must-have-tool-for-organizing-web-design-assets)

**启示**：AIGC 用户找图的核心线索是 **prompt 和模型**，不是文件名。我们每条 generation 天然带 prompt/model/provider 元数据（Eagle 用户要靠 MCP 脚本才补得上），但当前 UI 完全没把它变成检索与复用入口——这是"守着金矿不开采"。

### 2.3 DAM 行业通识

- 分面过滤（faceted search）：type / 日期 / 来源 / 活动等元数据渐进收窄；常用过滤器常驻（Cloudinary 允许管理员钉住 ≤10 个）。
- "taxonomy 是骨架，metadata 是神经系统"——检索质量取决于元数据是否结构化。
- 来源：[Cloudinary DAM Advanced Search](https://cloudinary.com/documentation/dam_advanced_search)、[Dash: 12 个 DAM 特性](https://www.dash.app/blog/digital-asset-management-features)

### 2.4 Immich（10.5 万 star，大规模媒体网格的性能范本）

- time-bucket 虚拟滚动 + blur-up 缩略图占位，支撑百万级资产；时间轴 scrubber 拖动时显示日期。
- 社区正在讨论线性 scrubber 在 10 年以上库的失效问题，方向是 Apple Photos 式 Semantic Zoom（年/月/日粒度切换）。
- 来源：[Timeline and Asset Display（DeepWiki）](https://deepwiki.com/immich-app/immich/3.5-timeline-and-asset-display)、[年/月/日视图讨论](https://github.com/immich-app/immich/discussions/12022)、[缩放层级讨论](https://github.com/immich-app/immich/discussions/20091)

### 2.5 Google Photos（多选习惯用法基准）

- shift+click 范围选、`x` 键选中悬停项、shift+方向键连续选、Esc 清空。
- 来源：[Google Photos 快捷键](https://shortcutworld.com/Google-Photos/web/Google-Photos_Shortcuts)、[范围选择说明](https://sites.google.com/site/picasaresources/google-photos-1/how-do-i-select-multiple-pictures)

### 2.6 WordPress 媒体弹窗（picker 模式的行业原型）

- "媒体库 / 上传"双 tab 在同一弹窗；文件拖到弹窗任意处即上传并自动选中；这是 CMS 世界二十年打磨出的 picker 契约。
- 2026-05 的 Media Editor Modal 还在往弹窗里收编裁剪/翻转/元数据编辑。
- 来源：[Media Editor Modal: call for testing](https://make.wordpress.org/core/2026/05/21/media-editor-modal-call-for-testing/)、[wp-media-picker](https://github.com/felixarntz/wp-media-picker)

### 2.7 GitHub 现货组件结论

`gh search` 扫过 media library / picker / virtualized masonry：没有值得整体引入的现货（要么是 CMS 绑定件，要么 star 个位数）；唯一体量级参考是 immich（架构参考，非组件复用）。**结论：自研为主**；虚拟化到时候评估 `@tanstack/react-virtual` / `virtua` / `masonic` 这类布局引擎即可，不引整套 gallery 组件。

## 3. 差距分析（四个断层）

1. **检索断层** — 引擎有 search/sort/timeRange，UI 一个都没露出。321 张时靠滚，几千张时这页就废了。
2. **整理断层** — 移动资产要"进选择模式 → 逐张点 → 底部下拉选文件夹"三步；行业基线是拖拽即移动 + shift 范围选。
3. **prompt 断层** — AIGC 素材库最值钱的元数据（prompt/model）躺在 detail sheet 里，不参与检索、不能一键复用、不能"找同款"。
4. **场景断层** — picker 把"管理工具"原样塞给"挑选场景"：选择场景要的是快（搜索 + 最近 + 顺手传一张），不是完整的文件夹管理面。

## 4. 优化方向（按分期）

### P0（低成本高收益，先做）

**P0-1 检索露出**
顶栏加搜索框（按 prompt 检索）+ 排序下拉（最新/最旧/最多赞）+ 可选时间范围。纯 UI 接线：`GalleryFilters` 全部现成，`fetchGalleryImages` 已带参数。注意 URL 同步（页面已有 search params 校验管线）。
落点：`KreaAssetBrowser` 顶栏、`use-gallery.ts`（不动）、i18n 三语。

**P0-2 选择器场景化重设计**（见 `svg/assets-picker-redesign.svg`）
picker 模式不再渲染完整右栏，改为：

- 顶部：搜索框（自动聚焦遵守触屏键盘策略）+ mediaType 锁定徽标
- 首层："最近生成" 默认网格（本来就是 newest 排序，语义上点破它）
- 文件夹降维成一行横向 chips（全部 / 收藏 / 各项目），不再占竖向整栏
- 内联上传：拖文件进弹窗任意处 / 粘贴 → 上传即选中（WordPress 契约；复用 uploads 管线）
- 多选模式保留底部 "添加 N 张" 确认条（LoRA 契约不变）

落点：`AssetSelectorDialog.tsx` + `KreaAssetBrowser` 的 picker 分支。**建议借此把 picker surface 从 2397 行单体里拆出来**（拆 shell/sidebar/grid/picker 四件，符合长期建模原则），拆分范围施工前单独评审。

### P1（效率层）

**P1-1 选择习惯用法** — shift+click 范围选、Esc 退出选择模式（已有）、hover 显 checkbox、可选 `x` 键。Google Photos 基准。
**P1-2 拖拽整理** — tile 拖到右栏文件夹节点即移动；批量选中后拖 = 批量移动。落点：tile drag source + `TreeView` drop target + `batchAssignProjectAPI`（现成）。
**P1-3 prompt 即资产** — tile hover 快速"复制 prompt"；detail sheet 的模型/provider 变成可点 chip（点了即过滤同模型）；"找同款"= 以该图 prompt 预填搜索框。Eagle 工作流验证过的刚需。

### P2（规模与自动化层）

**P2-1 保存的搜索**（Midjourney Saved Searches）— 把当前 filter 组合存成伪文件夹，出现在右栏"视图"组；新资产自动匹配。需要一张小表（name + filters JSON），是本清单里唯一动 schema 的 P2 前项。
**P2-2 虚拟滚动 + blur-up** — 网格虚拟化（评估 TanStack Virtual / virtua / masonic），缩略图 blur-up 占位（Immich 范式）。触发条件：单区块资产量常态破千再做，别提前优化。
**P2-3 标签/评分系统**（Eagle）— 大件，依赖后端 schema + 打标 UI + 检索接线；在 prompt 检索（P0-1）能顶住之前不启动。与 LoRA 域的 danbooru 词库有潜在复用点，启动前先对齐。

### P3（观感层，暂缓）

- 时间分组 headers +日期 scrubber（Immich/Google Photos 式）——资产量与使用时长上来之前收益有限。

## 5. 风险与 Do-Not-Break

- picker 三契约不能破：单选 `onSelect` / 多选 `onConfirmMany + maxSelection` / `mediaType` 锁（图片引用链路依赖它兜底类型安全）。
- `generationId` deeplink、URL filter 校验管线（`AssetsPageSearchSchema`）。
- 批量操作语义（删除/发布/收藏/移动）与区块计数刷新。
- 密度偏好 localStorage key（`pv:assets:density`）。
- 触屏键盘策略：picker 搜索框自动聚焦必须走 `focusUnlessTouch`。
- 弹窗内暗面已显式处理 color-scheme 问题的先例，改 picker 壳时留意（见 memory `reference-dark-color-scheme`）。
- UI-only 改动不动 `src/app/api/**` / `prisma/**` / `src/services/**`；P2-1 需要 schema 时单独立项。

## 6. 验证要求（每期通用）

按 CLAUDE.md UI 确认阶梯：lint + build 绿 → `e2e/visual.spec.ts`（有意变更则更新 win32 基线并点名）→ 触达区/token 断言 → 交互实跑（picker 单选/多选/mediaType 锁、上传、搜索防抖）。i18n 三语同步（en/ja/zh）。

## 7. 来源清单

- Midjourney：docs.midjourney.com（Organizing Your Creations / Using Folders）、readmedium Smart Folders、toolify 2025-02 综述
- Eagle：eagle.cool、smarative 评测、X @MANISH1027512（Eagle MCP + prompt 归档工作流，2026-04）
- DAM：Cloudinary DAM Advanced Search、dash.app DAM features
- Immich：DeepWiki timeline-and-asset-display、GitHub discussions #12022 / #20091
- Google Photos：shortcutworld、picasaresources 多选说明
- WordPress：make.wordpress.org Media Editor Modal（2026-05）、felixarntz/wp-media-picker
- GitHub 扫描：`gh search repos`（media library picker / virtualized masonry / self-hosted photo），2026-07-05
