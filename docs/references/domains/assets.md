# Assets 域 — 私有素材库（现状事实）

> 职责：私有作品浏览 / 上传 / 文件夹归类 / 批量操作 / 单资产详情与复用入口。**不负责**：生成执行、公开展示（归 Gallery）、credit。⚠ 本域首次有独立域文档（旧体系没有）；**改素材页先读 `archive/reviews/2026-07-05-assets-optimization-directions.md`（方向调研已成文，别重调研）**。

## 现状结构（2026-07-05 调研口径）

- `/assets` → `KreaAssetBrowser`（⚠ **2397 行单体组件**，改动谨慎）。
- **双维组织**（产品事实，不能破坏）：①系统分类区块（全部/收藏/已发布/本地素材/未分类）②私人项目文件夹树（右栏 TreeView）。
- 过滤：媒体类型 toggle；**搜索/排序/时间过滤引擎已存在**（`use-gallery.ts` 的 GalleryFilters 支持 search/model/sort/timeRange/provider）**但 UI 未露出**——这是 P0 优化方向之一。
- 网格：密度 4/6/8（localStorage 持久化）+ 哨兵无限滚动；无虚拟化、无 blur-up。
- 批量：选择模式逐张点选 + 底部操作条（删除/发布/收藏/移动）；无 shift 范围选、无拖拽入文件夹。
- 详情：`AssetDetailSheet`（remix/移动/删除/发布/收藏/下载/存提示词模板）。

## 素材选择器（跨域复用件，约 39 处引用）

`AssetSelectorDialog` = 浏览器塞进 `lg:max-w-3xl` 弹窗；**三种契约不能破坏**：单选 / 多选（LoRA）/ mediaType 锁。P0 方向 = picker 场景化重设计（见调研文档）。

## 已知断层（调研拍板的四个，P0 = 前两个）

①检索能力有引擎无 UI ②选择器不区分使用场景 ③prompt 复用路径长 ④规模化性能（无虚拟化）。

## 不能破坏

双维组织 · 选择器三契约 · 密度持久化 · 上传只在「本地素材」区块（含粘贴上传）· 素材页不生成。

## Source of Truth

`src/components/business/KreaAssetBrowser.tsx` · `AssetSelectorDialog.tsx` · `AssetDetailSheet.tsx` · `AssetFolderTree.tsx` · `src/hooks/use-gallery.ts`；方向调研 `archive/reviews/2026-07-05-assets-optimization-directions.md`（含 P0–P2 路线图）。

## Last Verified

2026-07-10 · 结构事实沿用 2026-07-05 调研（当时逐行核过代码）。
