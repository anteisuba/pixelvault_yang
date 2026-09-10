---
name: design-system
description: 调整 PixelVault 的设计 token 分层、组件状态与 variant；不用于幻灯片生成或自动重建全站主题。
argument-hint: '[component or token]'
license: MIT
metadata:
  author: claudekit
  version: '1.0.0'
---

# Token 与组件规范

适用于现有设计 token、组件状态/variant 与样式作用域调整。PixelVault 使用 primitive → semantic → domain/component/page 分层，保持业务域外观自主；页面方向以确认文档为准。

先检查 `src/app/globals.css`、现有组件与 `docs/references/frontend.md`，复用已有语义。修改共享 token 前搜索消费者；只为当前真实重复或语义差异增加 token，不启动全站主题重建。

按需读取：

- [token 架构](references/token-architecture.md)：定义或调整分层。
- [primitive](references/primitive-tokens.md) / [semantic](references/semantic-tokens.md) / [component](references/component-tokens.md)：对应层的详细方法。
- [组件规范](references/component-specs.md) / [状态与 variant](references/states-and-variants.md)：组件契约变化。

项目是 Tailwind 4，先核现有 `@theme inline`，不套用旧版 config 教程。若确需生成/检查 token，可检查本技能 `scripts/generate-tokens.cjs` / `validate-tokens.cjs` 的帮助和实现后使用；通用扫描不能替代浏览器中的作用域、主题和对比度验证。

演示文稿不属于本技能的默认范围，不把 slide 品牌或生成模板引入产品 UI。
