# UI Checklist — P0 不过打回

本清单验证品质、行为和已确认的域级方向，不规定全站视觉造型。完成报告必须逐项给结论；跳过项要写原因。

## P0（必须全过）

- [ ] 任务边界清楚：业务域、页面、核心用户任务、成功标准和禁改范围已确认。
- [ ] 改版级任务已有 owner 确认的域定义、概念方向和关键切片；没有确认时不进入完整实现。
- [ ] active plan 中逐项记录了状态矩阵、结构问题、推荐答案与 owner 结论；“确认”没有被扩张为未询问事项的批量授权。
- [ ] 三个候选方向使用同一组真实内容与状态矩阵，差异来自结构、比例、层级和交互；候选稿未越权修改 `src/**`。
- [ ] 局部确认图已标明作用范围，没有把图中未讨论的上下文布局或皮肤提升为整页规范。
- [ ] 没有把旧版 `brand-dna` 视觉内容、archive、UI inspiration、当前页面或共享组件皮肤当作新设计答案；现行 `brand-dna.md` 的治理边界已遵守。
- [ ] 页面只出现该业务域负责的对象和参数；不相关能力不以隐藏、禁用或“高级设置”混入。
- [ ] 共享组件复用行为/API/状态/可访问性；域级 variant/token 能覆盖皮肤，不向其他域泄漏页面样式。
- [ ] token 分层清楚：primitive → semantic → domain/component/page；重复视觉值不散落为无语义硬编码。
- [ ] 键盘可达、焦点可见、ARIA/label 完整；状态不只依赖颜色。
- [ ] 命中区满足 fine 32/36、coarse 44、WCAG AA 24px 底线与例外条件。
- [ ] loading、empty、error、disabled、selected、success 等状态真实且有恢复路径；不支持的能力不渲染。
- [ ] `prefers-reduced-motion` 生效；动画只服务状态、连续性或反馈。
- [ ] i18n en/ja/zh 同步；长文本和 CJK 排版没有破坏布局。
- [ ] ResponsiveOverlay、触屏软键盘、focus return 与 375px 移动端主路径验证通过。
- [ ] 相关 lint/typecheck/test/build/visual 验证通过；dev server 正在运行时不并行 build。

## P1（应过）

- [ ] 同一业务域内部连贯，与其他业务域的差异来自结构、比例、信息层级和交互，而不只是换色。
- [ ] 页面主对象比 chrome 更强；首屏能看出用户来这里完成什么。
- [ ] hover、focus、active、loading、error、empty、disabled 均已实跑，不只看静态截图。
- [ ] 桌面、平板、手机的信息优先级合理，不是简单缩放桌面布局。
- [ ] 页面文档记录：继承哪些行为、覆盖哪些默认、三个标志性组件、不能长得像哪些既有域。
- [ ] 新增 variant/token 的作用域和提升条件清楚；页面专用值没有过早全局化。

## P2（加分）

- [ ] 有不妨碍效率的品牌个性、愉悦反馈或内容驱动动效。
- [ ] 关键媒体、字体和交互资源符合性能预算，无明显布局跳变。
- [ ] 交付附关键切片对比、响应式截图和手动验证路径。

## 默认验证命令

- 代码改动：按任务风险运行 `npm run lint`、`npm run typecheck`、相关 Vitest、`npm run build`。
- 视觉改动：`npx playwright test e2e/visual.spec.ts`；移动端涉及则加 `e2e/mobile.spec.ts --project=mobile`。
- docs-only：`git diff --check` + 默认阅读链/失效引用搜索。

## Last Verified

- 2026-07-19 · 删除统一圆角、pill、双面模式、固定配色与固定动效等造型验收；保留 UX、工程、响应式和域级确认门。
