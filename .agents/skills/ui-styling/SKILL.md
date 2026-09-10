---
name: ui-styling
description: 在现有 PixelVault shadcn/Radix 与 Tailwind 体系内实现样式、交互状态和响应式布局。
argument-hint: '[component or layout]'
license: MIT
metadata:
  author: claudekit
  version: '1.0.0'
---

# UI 样式实现

用于已明确目标的 shadcn/Radix、Tailwind 样式与响应式组件实现。先读 `docs/references/ui-defaults.md` 和目标组件；改版按 UI scene 确认，局部修复不重建设计系统。

- 复用仓库现有 primitive、overlay、表单与 token；不运行初始化命令覆盖已有组件或技术栈。
- 使用语义 token 和域/page 作用域；不要从通用示例复制硬编码配色或 Tailwind 旧版本配置。
- 保留受控状态、键盘交互、焦点返回、错误恢复与三语文案；不能假设使用 Radix 就无需验证可访问性。
- 用真实内容检查窄屏、长文本、缩放、触摸与 reduced-motion；根据改动运行相关测试和浏览器验证。

仅在现有代码无法回答 API 用法时查 [shadcn](https://ui.shadcn.com/docs)、[Tailwind](https://tailwindcss.com/docs) 或 [Radix](https://www.radix-ui.com/primitives/docs/overview/introduction) 官方文档。按需搜索本技能 `references/` 的具体主题；不加载海报、Canvas 或初始化教程来完成普通组件修复。
