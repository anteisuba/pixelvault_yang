---
name: improve-pixelvault-ui
description: PixelVault 的 UI 审计、局部修复、已确认页面实现与改版路由；保留领域设计确认和三语约束。
---

# PixelVault UI 工作流

先区分事实审计、局部修复、按已确认 page 文档实现和整页改版。仅审计不自动改代码；改版按 `docs/scenes/ui-page.md` 完成方向和关键切片确认。已授权实现不重新走门。

- 读相关域/page 文档与 `docs/references/ui-defaults.md`，定位组件、hook、API client 与消息键；仅在需要特定设计方法时再加载一个相关技能。
- 复用组件行为、状态与可访问性能力，外观遵循本域已确认方向。业务逻辑不进入展示组件，视觉任务不顺手改权限、计费或 provider 契约。
- 在现有 `src/messages/` 三语文件组织内添加/复用键；先检查实际目录，不假定每种语言是独立目录。模型选择器以当前 constants 元数据为准。
- 验证目标交互、失败/空/加载状态、375px 移动端、键盘和焦点；样式局部修复不强制跑整页设计审计。验证范围与 dev 所有权遵循 WORKFLOW。

报告实际浏览器证据与未验证项，不以静态检查宣称真机通过。
