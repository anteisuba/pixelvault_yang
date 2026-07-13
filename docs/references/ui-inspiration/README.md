# UI 灵感库

owner 策展的界面参考。这里保存的是**可讨论的设计证据**，不是 PixelVault 规范，也不是可直接施工的页面稿。

## 使用方式

1. 先看参考案例解决了什么问题，不先抄颜色、字体或组件外形。
2. 把喜欢的部分拆成「结构 / 层级 / 交互 / 内容表达」四类模式。
3. 每个模式都写清 PixelVault 的适用位置、需要翻译的部分和不可照搬项。
4. 真正进入页面改版时，仍按 `docs/scenes/ui-page.md` 或 `docs/scenes/ui-marketing.md` 工作流，结论写入 `docs/references/pages/<页>.md`，并经过 owner 概念稿核对。

## 案例索引

| 案例                                          | 类型               | 最值得参考的模式                             | 状态                                                                              |
| --------------------------------------------- | ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- |
| [Haivis 官网](haivis-landing-2026-07.md)      | AI 设计工具营销页  | 作品主导、登录 modal、图上动态证据           | 已拆解；owner 标喜欢 modal+四段动效语法；施工见 [pages/home.md](../pages/home.md) |
| [Haivis 画布工作区](haivis-canvas-2026-07.md) | 无限画布 + AI 助手 | 低 chrome 画布、对象上下文工具、分层生成控制 | owner 已确认对标；live CSS/交互已核验并写入画布施工图，待同屏概念稿               |

## 收录模板

新增案例时至少记录：

- 来源与截图日期；
- 一句话喜欢它的原因；
- 页面骨架与视觉层级；
- 可复用交互模式；
- PixelVault 可直接借鉴 / 需要翻译 / 不应照搬；
- 对应截图编号；
- Source of Truth 与 Last Verified。

## Source of Truth

- 策展判断：owner 提供的参考图与后续拍板意见。
- 项目设计边界：`docs/brand-dna.md`、`docs/forbidden.md`、相关 `docs/references/pages/<页>.md`。

## Last Verified

- Date: 2026-07-13 · Method: 建立 Haivis 营销页与画布工作区案例并核对当前文档路由。
