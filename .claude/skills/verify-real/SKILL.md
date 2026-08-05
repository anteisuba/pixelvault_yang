---
name: verify-real
description: Verify a UI change on the real running app via claude-in-chrome — programmatic value reads plus a screenshot — instead of inferring from code. Use after any change that renders, and whenever about to claim something "doesn't work".
---

# 真机验证

**这类问题真机点两下比读代码快，而且不容易看漏。**

## 环境

- 用 **claude-in-chrome**（有登录态）。本机 `preview_*` 连不上 localhost。
- 3000 被占 = owner 自己开的 dev server，**直接复用别另起**（双实例毁 `.next`）。
- dev 跑着时**别并行 build**。

## 铁律：不用单点观察推全局

这是项目里最常犯的错。一个域曾在同一件事上连错三次，根因都是「拿一个项目/一次观察推全局结论」。

落笔任何「某某不工作」之前，两条都要满足：

1. **多样本**：换项目、换节点、换状态各验一次。数量为 0 常常只是这个样本恰好没有。
2. **程序化读值**，不看截图猜：
   - `getComputedStyle(el).<prop>` 读真实生效值
   - `document.querySelectorAll(sel).length` 数数量
   - `localStorage` 读持久化状态（判断「是真没有」还是「有但没渲染」）
   - 查 `Object.keys(el).some(k=>k.startsWith('__react'))` 判断是活节点还是死 HTML

## 顺序

1. 开页 → 等首屏稳定（HMR 后要 reload，别信旧 DOM）
2. **程序化读值**拿证据
3. **截图**给 owner 看
4. 说明：改了哪些文件 · 画面哪里变了 · 纯 token 层画面不变也要截图并说明「不变正是验收点」

## 已知坑

- CDP 截图偶发超时，重试一次通常就好。
- `zoom` 动作会设 device metrics override 且**不会自动还原**，之后所有截图都被锁在那个尺寸 —— 开新 tab 绕过。
- HMR 会留下无 fiber 的僵尸 DOM；React 流式 SSR 也会在 `<body>` 下留 `<div hidden>` 暂存容器。两者都不跟状态，别当成重复挂载。
- 验证画布类页面**别乱点空白处**，容易误建连线/节点。改动了要说明并征得同意再删。
