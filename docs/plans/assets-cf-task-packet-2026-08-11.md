# Task Packet: Assets C+F 施工（`/assets` + 素材选择器改版）

> 状态：**已获施工授权范围内的方向确认**（owner 2026-08-11 选定方向 B 并逐条确认细节）。
> 页面契约唯一依据：[`../references/pages/assets.md`](../references/pages/assets.md)。**本包不扩张 page 文档的范围**；page 文档没写的造型/动效/文案不得自行补造，遇到就停下来问。
> ⭐ **开工前先读交接**：[`assets-cf-session-handoff-2026-08-11.md`](assets-cf-session-handoff-2026-08-11.md) —— 判断的来历、设计会话踩过的坑、owner 偏好、五条未决事项、验证时的三个陷阱。
> 分工：UI 切片走 Claude（Sonnet 落地）；`services/` 与派生管线切片走 Codex（见 §切片表标注）。

## Goal

把 `/assets` 与 `AssetSelectorDialog` 从「方形缩略图 + 常驻文件夹树」改造成 page 文档 §3–§9 定义的统一私有资产中心：真实比例网格、文件夹门牌体系、可叠加筛选、真实的上传/错误状态、任务型 picker。

## Non-goals

- 不改生成、provider、credit、auth、公共 Gallery 语义。
- 不重设计 `AssetDetailSheet`（只保入口与 focus return）。
- 不做全屏灯箱（方向 A 的深检视层）—— **未拍板**。
- 不做虚拟化 / blur-up（D3 的事）。
- 不碰画布并行任务的在飞文件。
- 不做 Saved Search / 标签系统。

## Task Scene / Type

UI（切片 1–6） + provider/派生管线（切片 0） + 数据契约（切片 7）+ 一次性脚本（切片 8）。

## Read First

- `CLAUDE.md` Engineering Principles + Hard Rules
- [`../references/pages/assets.md`](../references/pages/assets.md) ⭐ 唯一页面契约
- [`../references/domains/assets.md`](../references/domains/assets.md)
- [`assets-claude-directions-2026-08-11.md`](assets-claude-directions-2026-08-11.md) §3b/§3c/§3d（三条路径、四层治理、留白三成因）
- 原型：`prototypes/assets-claude-b-atrium-2026-08-11.html`（含 dev 状态切换器）、`prototypes/assets-claude-b-responsive-2026-08-11.html`
- `docs/checklists/ui.md`

## Source of Truth（现状行为定义处）

`src/components/business/KreaAssetBrowser.tsx`（2198 行单体）· `AssetSelectorDialog.tsx`(137) · `AssetFolderTree.tsx`(663) · `AssetDetailSheet.tsx` · `src/hooks/use-gallery.ts`(500) · `src/lib/api-client/gallery.ts` · `src/app/api/images/route.ts` · `src/services/generation.service.ts`（`getAssetSectionCounts`、`LIST_GENERATION_SELECT`）· `src/services/image/derivatives.ts` 一带的派生管线 · `scripts/backfill-generation-previews.ts`

---

## 切片表（按依赖顺序；每片可真机验证后独立提交）

| #      | 切片                                           | 归属                             | 依赖 | 关键点                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------- | -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0**  | **视频 poster 派生**                           | Codex                            | —    | ⚠ **硬前置**：实测 7/7 视频 `thumbnailUrl`/`previewUrl` **全空**，网格里只能画黑块。需在视频完成入库时派生一帧 poster（尺寸对齐切片 1 定下的行高上界）。没有它，切片 1 的视频表达不成立                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **1**  | justified 真实比例网格                         | Claude                           | 0    | page §5 全部 8 条。⛔ 三个已知坑：不给超宽图开独占行、末行默认铺满、容器宽用 `clientWidth` + `scrollbar-gutter:stable`。密度改为「目标行高」三断点刻度，保留 `pv:assets:density` 持久化                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **2**  | 媒体表达（音频封面卡 / 视频角标 / 3D 角标）    | Claude                           | 0,1  | 音频恒 1:1 + 四级回退链；⛔ 无真实波形数据不画伪波形                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **3**  | 分面筛选栏 + 搜索露出                          | Claude                           | —    | ⭐ page **§3.1**（取代原「两组图标 segmented」的写法）。五个文字下拉：类型/状态/模型/时间｜排序，**默认全部未选 = 全部素材不限类型**；生效项渲染成可删 chip 行 + 清除全部。`use-gallery` 的 `search/model/sort/timeRange` 引擎**已存在只是没露出**，接线不重造。搜索下拉的「文件夹结果组」跨层级扁平搜。⛔ 别做 `characterCardId`/`runGroupId` 轴（实测 0/0/1 条，无数据）                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **4**  | 文件夹门牌行 + 总览页 + 夹内页                 | Claude                           | 1    | page §4 三路径 + 治理 1/2/4（治理 3 pin 见 4c）。门牌行按容器宽自适应张数；复用 `AssetFolderTree` 已有的 `filterFolderNodes` 与 `sortFolderNodes` 的 `name`/`count` 两档，**不重造**。⚠ 夹内页/总览页做成**路由**（`/assets?folder=<id>`）不是 overlay，**全局左侧导航必须始终可见**（page §3 末）—— 原型第一版做成了全屏覆盖把应用壳盖住，别照抄                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **4b** | 修「最近使用」排序                             | Codex（service）+ Claude（接线） | 4    | ⚠ page **§4.1**。现有 `recent` 档排 `Project.updatedAt`，而**加素材不碰 Project 行** —— 实测 7 个夹里 4 个 `updatedAt` 全等于 `createdAt`，`dainia` 24 张素材加进去时间也没动。改法：`getAssetSectionCounts` 现有的 `groupBy({by:['projectId']})` **加一个 `_max:{createdAt:true}`**（同一次查询，近乎免费）→ 透传成「夹内最新素材时间」，档位改名**「最近更新」**。另：`sortMode` 改持久化（`pv:assets:folder-sort`，与 `pv:assets:density` 对齐）。⛔ 别把「夹内最近更新」和「我最近用过」（picker 那个，走 localStorage）合成一个字段——现有 bug 就是这么来的                                                                                                                                                                                                                            |
| **4c** | 文件夹置顶（pin）+ 总览页拖拽定序              | Codex（schema）+ Claude（UI）    | 4,4b | ⭐ page **§4.2**。`Project.pinnedOrder Int?`（可空列，无回填）。置顶层**与三档排序正交**，⛔ 别加「自定义」第四档排序。门牌行 = 置顶 + 排序补齐；总览页分「置顶（可拖定序）/ 全部」两段                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **5**  | 上传队列 + **网格占位瓦片** + 拖入 + 错误/空态 | Claude                           | —    | page §7 / **§7.3**。⭐ 现状 `prependGeneration` **只在成功后**才调 → 上传中网格毫无反应；改乐观占位瓦片（进度→原地换真图→失败变错误瓦片可重试）。多文件当前串行 + 单个 `isUploading` + toast → 改队列。`useGallery` 已返回 `error` 但页面没消费 → 接成可恢复错误态；**分页失败只挡这一段**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **5b** | 选择模式补缺 + 「移动到…」目标选择器           | Claude                           | 5    | page **§7.1/§7.2**。①批量条改成**进入选择模式即出现**（零选中禁用+提示），现状 `size > 0` 才渲染 ②补 **Shift 范围选**（全仓零 `shiftKey`）③「移动到文件夹」扁平下拉 → 可搜索目标选择器（复用 picker 导航栏结构）+ 新建并移入 ④**撤销按每项原 `projectId` 分别回写**，⛔ 不许写成统一丢回未分类                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **6**  | picker 任务型 shell                            | Claude                           | 1,3  | page §8。三契约不破；**mediaType 锁 = 不渲染候选**；达 `maxSelection` 拒绝并红字提示；首格内联上传即选中。⚠ 16 个调用文件 / 19 个挂载点，改前先 grep 全部调用方**在同一改动里改完**（Engineering Principle 1，不留垫片）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **6c** | 单选/多选判据纠偏（**仅非画布 8 个**）         | Claude                           | 6    | page **§8.3**。判据 = 消费端**替换**还是**追加**；追加的改多选并把**剩余容量**传 `maxSelection`。⚠ 已确认错挂：**`ReferenceImageChip`**（`addFromUrl` 追加 + `useImageUpload.maxImagesRef` 容量 → 放 4 张要开 4 次弹窗）。其余 7 个非画布挂载点逐个核。顺带把 `AssetSelectorDialog` 的两棵 `<KreaAssetBrowser>` 分支合成一次渲染 + `mode` prop。⛔ **不动 `node/**` 那 8 个**（见下行）                                                                                                                                                                                                                                                                                                                                                                                                    |
| **6d** | 画布域挂载点：只出清单不动手                   | —                                | 6c   | ⛔ 本包 Non-goals 明写「不接管画布并行任务」，而 17 个调用文件里 **8 个在 `node/**`**：`GenerateComposer`(`addReferenceFromAsset` 追加，疑似同样错挂) · `VideoComposer` · `ReferenceLandingTabs`(已多选) · `CanvasAppearancePanel` · `CanvasImageSelectionToolbar` · `CharacterDetailBody` · `ImageFamilyBody` · `VoiceDetailBody`。**产出一份「文件 → 消费端替换/追加 → 建议模式」清单交画布会话**，本包不改这些文件。<br>✅ **`VideoComposer` owner 2026-08-11 已拍板：改多选，但必须避免刷屏。** 落位约束（成批落位 / 一批一个撤销步 / 视口跟整簇 / `maxSelection` 上限）与 **一条高置信预测（朴素 `for` 循环会让 N 个节点精确重叠，`ReferenceLandingTabs` 可能已中招）+ 一分钟证伪法** 全部写在交接 **[§六](assets-cf-session-handoff-2026-08-11.md)** —— **画布会话开工前必读那一节** |
| **6b** | picker 文件夹导航栏                            | Claude                           | 6    | ⭐ page **§8.1**。⛔ **两个已被否的形态别再实现**：280px 竖树（吃 40% 宽）、横向 chips rail（= 原始需求 F1 的病本身，且不支持嵌套）。定案 = 176px 可折叠导航栏（智能视图 / 最近用过 3 个 / 全部文件夹树 / 栏内跨层级搜索），只装导航不装 CRUD；`未分类` 不重复列；`▸` 只展开不切范围；<768 塌成范围 sheet。现状代码里的 `MobileSectionRail` 横向 chips 分支**同批退役**，不留开关                                                                                                                                                                                                                                                                                                                                                                                                          |
| **7**  | `sourceSurface` 数据契约（可选）               | Codex                            | —    | 现枚举仅 `IMAGE_STUDIO/LORA_WORKBENCH/CANVAS/EDIT`，未覆盖 Video/Audio/3D/Upload，且不在 `LIST_GENERATION_SELECT` 里。**「来源筛选」不在本轮 UI 契约内** —— 除非补齐，否则别在 UI 上做半个                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **8**  | C4 尾项：存量 384px 缩略图回填                 | Codex                            | 1    | ⛔ **不能原样跑现有 `--force`**：它覆写同名 immutable key（`CacheControl: max-age=31536000`），回填了也被缓存挡最长一年。要么写新 key + 更新 DB，要么走缓存清除。目标尺寸 = 切片 1 定下的 L 档行高 × DPR2 上界，**不要再拍一个数**（384 就是这么来的）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Allowed File Scope

- `src/components/business/KreaAssetBrowser.tsx` 及由它拆出的新组件（**鼓励拆分**：2198 行单体，网格/门牌/上传队列/picker shell 各自成件）
- `src/components/business/AssetSelectorDialog.tsx`、`AssetFolderTree.tsx`
- `src/hooks/use-gallery.ts`（只接线已有能力，不改数据语义）
- `src/constants/`（新增网格/密度/上传常量 —— **禁硬编码数字**）
- `src/messages/{en,ja,zh}.json`（三语同步）
- 切片 0/7/8：`src/services/`、派生管线、`scripts/`、`prisma/`（仅切片 7 若确认要做）

## Forbidden File Scope

- `src/app/api/**`（切片 7 除外）· `src/services/**`（切片 0/7/8 除外）· `prisma/**`（同上）
- Clerk / credit / billing / provider 契约
- 全局应用侧栏（`layout/`）皮肤 —— **薄品牌脊柱，不属任何单域**
- 画布在飞文件（`git status` 里 canvas 相关未提交项）

## Assumptions / Open Questions

**已确认（不用再问）**：方向 B · 两段结构 · 无第二左栏 · 跟随本地 shadcn token · 回流不做独立分区 · 命名用「文件夹」· 密度=目标行高 · picker 不同构。

**需要 owner 拍板才做**：

1. **`VideoComposer` 的单选/多选** —— owner 2026-08-11 明确「我看下」。⛔ **未拍板前不得改**（切片 6d）。
2. **详情查看器补 `←→` 连续翻阅**（原「全屏灯箱」，查证后发现现状 `MediaDetailViewer` 已是全屏 `object-contain`，只缺连续翻阅与 filmstrip）。建议降级成小切片；深色场 + 元数据折叠**不做**（与「跟随本地设计」冲突）。
3. **切片 7 `sourceSurface`** 要不要做。建议**不做** —— 「来源筛选」是我从数据里看到字段才提的，owner 从未提过此需求。
4. **pin 置顶排期**（切片 4c，动 schema 加 `Project.pinnedOrder`）。建议放第二批：首批已有「门牌行只放头部 + 总览页 + 跨层级搜索」三层兜底。

**执行中必须停下来问的**：page 文档没写的造型/动效/文案；任何需要越过 Forbidden Scope 的改动。

## Acceptance Criteria

1. 网格：程序化量测 `行宽 / 容器 clientWidth ≥ 99%` 且 `scrollWidth ≤ clientWidth`；样本含 ar **0.56** 与 **2.77** 两个极端，二者均**完整显示不裁切**。
2. 三档视口（1440 / 1280 / 375）各自的默认态 + 空态 + 错误态 + 上传态 + picker 实拍。
3. picker：单选点击即返回；多选达 `maxSelection` 被拒且有可见提示；锁 `image` 时候选里 **0 个**视频/音频/3D；19 个挂载点全部可用。
4. 音频在列表中 **100%** 有可辨认封面（回退链兜底），无伪波形。
5. 上传：多文件队列逐项状态可见，部分失败可单项重试，落夹目标正确。
6. 分页失败只影响该段，已加载内容不消失。
7. 对比度：新增文案对底 ≥4.5:1（`contrast-check` 算，禁目测）。
8. 闸门三样全绿：eslint + 全量 tsc + 全量 vitest（提交前串行跑一次）。

## Validation / Evidence

- 真机走 `verify-real`（claude-in-chrome + 程序化读值 + 截图），⛔ 不用本机 `preview_*`（连不上 localhost）。
- 网格判据用 JS 量测，不看截图下结论；⚠ hidden tab 截图会把已加载的图画成空白（`img.complete && naturalWidth>0` 全绿也一样），前置标签页再截。
- 三档视口用原型同款 iframe 手法或真实窗口，**`resize_window` 在最大化窗口上不改变 `innerWidth`**，别据此判断响应式。
- 视觉基线按 OS 分套（`-win32`/`-darwin`）。
- 每片交付附：改了哪些文件 / 画面哪里变了 / 如何手动验证（点哪、看什么字段）。

## Documentation Sync

- `docs/references/pages/assets.md` —— 实现与契约出现偏差时**改这里**（它是唯一页面事实源）。
- `docs/references/domains/assets.md` —— 现状结构段在切片落地后同步（当前仍描述「右栏常驻树 + 方形裁切」）。
- `docs/plans/week-2026-08-07-backlog.md` §C/§F —— 完成后标记，并按「完成即删」规矩处理本包与设计账本（**删前 grep 全仓改掉所有指向它们的引用**）。
- `docs/plans/assets-cf-design-2026-08-09.md` / `assets-claude-directions-2026-08-11.md` —— 设计过程文档，收口后随本包一并清理，结论已沉淀进 page 文档。
