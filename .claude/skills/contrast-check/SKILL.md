---
name: contrast-check
description: Compute WCAG contrast ratios deterministically for color pairs before landing any design token or CSS color. Use whenever picking/changing colors, writing a skin spec, or reviewing a contrast claim — never eyeball, never trust a review agent's arithmetic.
---

# 对比度确定性复核

**永远不目测，永远不信 review agent 的算术。** 项目历史上出过 review agent 系统性算反 `color-mix` 方向的事（memory `feedback-verify-css-review-math`）。

## 用法

写脚本到 scratchpad 跑，逐对输出。模板：

```js
function s(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
function hex(h) {
  h = h.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}
function lum(c) {
  return 0.2126 * s(c[0]) + 0.7152 * s(c[1]) + 0.0722 * s(c[2])
}
function ratio(a, b) {
  const x = lum(hex(a)),
    y = lum(hex(b))
  return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2)
}
// alpha 叠加：rgba(0,0,0,.08) on #fff → 先合成再算
function over(fg, alpha, bg) {
  const f = hex(fg),
    b = hex(bg)
  const m = f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)))
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('')
}
```

## 判据

| 用途                                   | 门槛                             |
| -------------------------------------- | -------------------------------- |
| 正常文本                               | ≥4.5:1                           |
| 大文本                                 | ≥3:1                             |
| UI 组件边界 / 信息性图形（含**连线**） | ≥3:1                             |
| 纯装饰（发丝线、点阵、占位斜纹）       | 不要求，但要在注释里写明「装饰」 |

## 必须做的

1. **每个色值对**两种背景都算：卡背 **和** 页面/画布底。同一个灰在两者上差得远（实例：`#8F8F8F` 对白卡 3.23、对 `#F1F1F1` 只有 2.86 → 只能用在卡上）。
2. **alpha 色先合成再算**。`rgba(0,0,0,.08)` 不是一个可直接比的颜色。
3. 算完把数字**写进 CSS 注释或规格表**，别只留在对话里 —— 下一个人会重算或乱猜。
4. 不达标的色值要么改，要么显式降级用途（「只用于非必读信息」）并写明。

## 陷阱

- **底色是用户可设的**（画布外观预设含纯白纯黑）→ 固定卡背 + 可变底色时，卡边必须按亮度差自适应，否则卡会整个消失。参考 `getCanvasCardLineColor`。
- 深色档**不是浅色反相**：卡背要比底亮，投影靠加深不靠发光。
