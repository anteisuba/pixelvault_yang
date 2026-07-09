# Scene · 产品内页 UI（ui-page.md）

> 覆盖：Studio / 画布 / LoRA / Assets / Gallery / Prompts / Cards 等**应用型页面**的 UI 新建与改动。营销页走 `ui-marketing.md`。对应 checklist：`checklists/ui.md`（P0 不过打回）。

## 专属 5 问（开工硬门，与通用 5 问叠加；没有答案就停下来问 owner）

1. **哪个页面/组件？该页现行体系是什么？**——未改版页 = v1 现状约定（双面模式/反相 CTA/无彩灰阶）；已按房间文档改版页 = 该页施工图。**禁止混搭**（brand-dna 过渡期规则）。
2. **有没有施工基准或设计稿？**——先查 `archive/reviews/` 对应篇和 `references/pages/<页>.md`；有 Figma 稿用 `get_design_context` 拉。都没有且改动非琐碎 → 先出方案图给 owner 拍板，再动代码。
3. **成功标准是什么？**——可勾选的验收项 + 视觉回归基线怎么处理（diff 应为空？还是有意改动需 `--update-snapshots` 并点名哪些快照）。
4. **禁改范围？**——默认红线见下方「禁改范围默认值」，任务有额外红线在此确认。
5. **交互态覆盖要求？**——hover / focus / loading / error / 空态 / 键盘 / 移动端 375，哪些必须实跑验证（claude-in-chrome），哪些本次豁免。

## 本场景工作流（七步骨架的 UI 具体化）

1. **问 5 问**（上方）。
2. **读规矩**：`brand-dna.md`（含过渡期规则）→ `forbidden.md` UI 节 → `references/frontend.md`（覆层强约定矩阵 + token 四层治理 + 组件清单）→ `references/domains/<域>.md` → 对应 archive 施工基准。
3. **从既有起步**：先查 frontend.md 组件清单——覆层选型走强约定矩阵（ResponsiveDialog / ResponsivePopover / tool-surface / AssetSelectorDialog…），禁止重造已有组件；新组件用 `templates/component.md` 骨架并按层级判据放对目录。
4. **设计先行（非琐碎改动）**：Fable 出方案/线框图（show_widget 内联渲染）→ owner 拍板 → 落成可执行描述交 Sonnet；琐碎改动可直接做但报告里说明。
5. **实现**：匹配该页现行体系；token 走 `@theme inline` 不用任意值；i18n 三语同步；触屏键盘策略与 44px 触达区不破坏。
6. **自检**：`checklists/ui.md` 逐项过——机械项跑命令（lint/build/visual），判断项逐条给结论。
7. **交付报告**：改动清单 + checklist 逐项结论 + 截图/图示对比 + **手动验证步骤**（点哪/看什么/DevTools 看哪个请求）。

## Skill 路由（本场景专用）

定调/出设计系统 → `ui-ux-pro-max`；在系统内实现 → `frontend-design`；收尾检查 → `polish` / `audit`；存量整体升级 → `redesign-existing-projects`（audit-first）。审查类 skill 默认只出清单不改代码。

## 必读清单

`brand-dna.md` · `forbidden.md`（UI 节）· `references/frontend.md` · `references/domains/<域>.md` · 对应 `archive/reviews/` 施工基准 · 画布任务另加 `plans/canvas-baseline.md`

## 禁改范围默认值（UI-only 任务）

**不动**：`src/app/api/**` · `prisma/**` · `src/services/**` · Clerk 配线 · credit/billing。全局字体/材质切换是独立地基工程，不随单页顺带改。需要越界时停下来 surface 冲突。

## 验证命令

`npm run lint && npm run build`（dev 跑着时不 build）→ `npx playwright test e2e/visual.spec.ts` → 涉及移动端加 `e2e/mobile.spec.ts --project=mobile` → 交互态用 claude-in-chrome 实跑（本机 preview\_\* 不可用）。
