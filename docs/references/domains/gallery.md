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

| 组件                                       | 职责                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GalleryFeed`                              | filter 状态接线 · URL query 替换 · 加载/错误 · load-more · 空态回 Studio                  |
| `GalleryHeader` / `GalleryAdvancedFilters` | 排序/媒体类型/时间 pill 组 + 搜索；高级 = 模型 + liked                                    |
| `GalleryGrid`                              | 瀑布流分批渐进渲染 · 近视口预量图 · 键盘空间导航 · 空态                                   |
| `ImageCard`                                | 单卡：媒体/点赞/下载/作者/公开 prompt 覆层/复制/「用这条 prompt」进 Studio/可选可见性控制 |

filter 维度：search / model / sort / outputType / timeRange / liked / published / projectId。

## 已拍板方向（未实施，2026-07-19）

- Gallery 成为**公开作品与公开配方的唯一发现入口**；不再由 Prompts 维护第二套共享 feed。
- 公开单位仍是 Generation/作品或图集，不是脱离作品的 Prompt 卡。配方是作品的可展开、可比较、可复用层。
- 仅在 `isPublic=true` 且对应内容得到公开授权时展示；继续允许“作品公开、Prompt/配方保密”。
- 可公开配方目标包含 Prompt、Negative Prompt、模型、允许公开的生成参数、seed、LoRA 依赖与来源；必须通过专用 public projection 清洗，禁止直接返回完整 `snapshot` / `recipeSnapshot` / 私有引用。
- Gallery 负责浏览、搜索、比较和“使用这套配方”；执行后保存到用户自己的 Prompts 工作区，私有编辑/版本管理仍不属于 Gallery。
- 旧 MeiGen 造型、展厅/画册跨页/藏书票隐喻随视觉规则重建废止；route-backed 详情只作为可分享 URL 与交互连续性的候选行为重新评估。

## Source of Truth

`src/app/[locale]/(main)/gallery/**` · `src/services/generation.service.ts`（getPublicGenerationPage / getPublicGenerationById）· `GalleryFeed/GalleryGrid/ImageCard` 组件族；历史详版 `git show cddc4384:docs/domains/gallery.md`。

## Last Verified

2026-07-19 · 当前代码仍是公开 Generation feed/详情；owner 已拍板公共配方发现从 Prompts 合并到 Gallery，尚未实施。Prompt redaction 与公开路由边界仍是安全红线。
