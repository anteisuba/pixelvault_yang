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

## 已拍板方向（未实施）

详情页目标形态 = **MeiGen 式 route-backed overlay**（overlay 体验 + 可分享真实 URL，与 Prompts 详情共模板，两颗大按钮=「使用 Prompt / 用作参考图」）——见 `archive/design/direction.md` MeiGen 拆解节；工坊宅邸房间定位 = 展厅（画册跨页/藏书票，草案）。

## Source of Truth

`src/app/[locale]/(main)/gallery/**` · `src/services/generation.service.ts`（getPublicGenerationPage / getPublicGenerationById）· `GalleryFeed/GalleryGrid/ImageCard` 组件族；历史详版 `git show cddc4384:docs/domains/gallery.md`。

## Last Verified

2026-07-10 · 沿用 2026-06-02 口径；prompt redaction 与公开路由边界为安全相关事实，改动前先对代码。
