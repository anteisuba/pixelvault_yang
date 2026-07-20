# Scene · 营销页（ui-marketing.md）

> 覆盖：首页、Landing 和营销 section。产品内页走 `ui-page.md`；对应验收为 `checklists/ui.md`。

## 专属 5 问（开工硬门）

1. **页面要证明什么？** 只展示已经可用的真实能力，不用营销包装替代产品成熟度。
2. **目标受众与主动作是什么？** 新访客、回访创作者或已登录用户的首要路径必须明确。
3. **这是增量维护还是完整改版？** 增量维护控制范围；完整改版重新走域定义、三个方向和关键切片，不继承旧首页皮肤。
4. **需要哪些真实媒体证据？** 明确作品来源、授权、体积、裁切、LCP 和多语言文案。
5. **成功与禁改范围是什么？** 包括转化动作、SEO、性能、响应式、可访问性和不触碰的产品内页/认证边界。

## 本场景工作流

1. 对齐 `references/product.md` 与已落地能力，先确定首页当前能承诺什么。
2. 读取 `brand-dna.md`、`forbidden.md`、`references/frontend.md` 和 active plan；旧首页、archive 与 UI inspiration 只作证据。
3. 完整改版先提出三个结构方向，并与真实产品页和能力截图并排核对；owner 选择后只做 hero 或一个核心 capability 切片。
4. 关键切片确认后写页级文档，再实现页面局部 token/组件；不得把 homepage 皮肤扩散为全站默认。
5. 验证内容真实性、SEO、LCP、CLS、reduced-motion、键盘、移动端和 CTA 路径。
6. 逐项通过 `checklists/ui.md`，交付截图对比、性能证据和手动验证步骤。

## 禁改范围默认值

- 不因营销页重做修改产品内页皮肤、共享业务组件、API、数据库、provider、Clerk 登录流程或计费。
- 首页可以拥有独立的 page token 和组件语言，但共享导航行为、品牌身份、反馈语义与可访问性底线。

## 验证

- `npm run lint`、`npm run typecheck`，按风险运行 build。
- `npx playwright test e2e/landing.spec.ts e2e/visual.spec.ts`。
- 涉及移动端时运行 `e2e/mobile.spec.ts --project=mobile`。
- 浏览器实跑 reveal、CTA、锚点、键盘、reduced-motion、LCP/CLS。

## Last Verified

- 2026-07-19 · 移除白厅/暗 hero/房间隐喻等旧首页造型约束，改为能力真实性与独立域级设计流程。
