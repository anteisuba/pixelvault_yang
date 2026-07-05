# Studio 空态重构 — 起手势替代教程轮播（2026-07-05）

状态：**已落地**（方案 A，所有者 2026-07-05 拍板）。
范围：`/studio/{image,video,audio}` 共享画布的空态与垂直布局；dock 未动。
审计工具：taste skill（redesign-existing-projects，audit-first）。

## 审计结论（问题清单）

| #   | 严重度 | 问题                                                                                                                                        | 处置                                                                        |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | P0     | 空态教程轮播（XiaoheiGuideCarousel，max-w-7xl + 16:9）一张图吃掉整个首屏，prompt dock 被挤出视口；同文件生成中占位符有 height cap，空态没有 | ✅ 空态换起手势组件，canvas+dock 锁单屏                                     |
| 2   | P0     | 巨白插画卡打破暗房基调（direction.md 双面模式；bg-white 硬编码）                                                                            | ✅ 教程移出常驻位；轮播内 bg-white 保留（教程素材本身白底，framing 需匹配） |
| 3   | P1     | 教程对老用户是永久噪音：无 dismiss、无记忆                                                                                                  | ✅ 首访自动弹一次（关闭时写 localStorage 标记）+「?」常驻入口               |
| 4   | P1     | 空态零起手势（违反工具面板契约第 5 条）                                                                                                     | ✅ 示例 prompt chips + 最近作品行                                           |
| 5   | P2     | 垂直间距分散三层（FlowLayout/空态 wrapper/轮播自带）                                                                                        | ✅ 收敛到 StudioFlowLayout 单层                                             |
| 6   | P2     | 轮播圆点 6px 触达区                                                                                                                         | ✅ 扩为 32px 热区（size-8 按钮包 6px 圆点）                                 |
| 7   | P2     | 空态画布无身份锚点                                                                                                                          | ✅ 加模式 eyebrow（图片/视频/音频工作台）                                   |

## 方案 A 的实现形态

- **StudioEmptyState**（`src/components/business/studio/StudioEmptyState.tsx`）：
  模式 eyebrow → 一句说明 → 3 个示例 prompt chips（点击 `SET_PROMPT` + 聚焦输入框）
  →「继续创作」最近生成 ≤6 张缩略图（数据走 `useStudioData().projects.history`
  客户端按模态过滤，点击复用 GenerationPreview 的 `onRemix` 路径）
  →「查看操作教程」入口（ResponsiveDialog 内复用 XiaoheiGuideCarousel）。
- **首访自动弹教程**：标记 `pixelvault:studio-guide-seen` 在**关闭时**写入
  （打开即写会被 dev StrictMode 的双挂载吞掉，且"弹过没看"的用户会永远错过）。
- **单屏锁定**：globals.css 里 `.studio-canvas-slot:has(.studio-empty-state)`
  链式 flex 规则，**有意放在 `@layer` 之外**——槽位上的 `lg:flex-none` 在
  utilities layer，layered 规则无论 specificity 都压不过；flex-basis 用
  auto（0% 会在移动端内容高度容器里把链条坍缩成 0）。结果态不受影响，
  lg 下 dock 依旧跟随图片。
- **i18n**：新命名空间 `StudioEmptyState`，en/ja/zh 三语同步（28 键位一致）。
- **常量**：`STUDIO_GUIDE_SEEN_STORAGE_KEY` / `STUDIO_EMPTY_RECENT_COUNT` /
  `STUDIO_EMPTY_EXAMPLE_KEYS`（`src/constants/studio.ts`）。

## 改动文件

- `src/components/business/studio/StudioEmptyState.tsx`（新）+ 同名 test
- `src/components/business/studio/GenerationPreview.tsx`（空态分支）
- `src/components/business/studio-shared/chrome/StudioResizableLayout.tsx`（间距单层 + slot 类）
- `src/components/business/studio-shared/XiaoheiGuideCarousel.tsx`（圆点热区）
- `src/app/globals.css`（未分层空态高度链）
- `src/constants/studio.ts`、`src/messages/{en,ja,zh}.json`

## 未尽事项

- 视觉基线（e2e/visual.spec.ts 若含 studio 空态截图）需要 `--update-snapshots`。
- 轮播圆点 32px 仍未到 44px；圆点在白底对比度（black/25）未动。
- docs/design/pages/studio.md 的空态矩阵段落已过时（仍写 XiaoheiGuideCarousel 常驻）。
