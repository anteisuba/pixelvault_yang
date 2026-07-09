# Scene · 营销页（ui-marketing.md）

> 覆盖：首页 / Landing / 未来的营销 section。产品内页走 `ui-page.md`。对应 checklist：`checklists/ui.md`。

## 专属 5 问（开工硬门）

1. **哪个 section？增量优化还是新建？**——首页「白厅画廊」结构已成型（暗 hero + 白厅正文 + 深窗 capability + 六功能段），增量优化不许推翻整页结构；要推翻先立项。
2. **需要新的 showcase 媒体资产吗？**——用现有作品还是生成新的？新生成的走谁的额度、放哪个目录？
3. **成功标准与"惊艳层"目标？**——用可描述的效果定义（如"hero 有实时显影动效"），不接受"更好看"；三语文案（en/ja/zh）齐才算完。
4. **禁改范围？**——默认：`homepage-*` / `--home-*` 页面局部类**不外溢**到全局；不动 `(main)` 应用壳与产品内页共享组件。
5. **SEO / 性能约束？**——metadata/结构化数据要求、LCP 预算、图片体积上限、reveal 动效是否豁免 reduced-motion 以外的场景。

## 本场景工作流

1. 问 5 问。
2. 读规矩：`brand-dna.md`（玄关房间草案 + 过渡期规则）→ `forbidden.md` UI 节 → `references/frontend.md`（homepage-\* 页面局部节）→ `src/app/homepage.css` 现状。
3. 定方向/实现：`design-taste-frontend` skill（营销页专用，反 AI-slop）。
4. 实现约束：页面局部系统自治（homepage-\* 命名），reveal 动效走现有 motion 体系 + reduced-motion。
5. 审计：完成后过 `redesign-existing-projects` skill（抓 AI-slop 通病，audit only）。
6. 自检：`checklists/ui.md` 逐项。
7. 交付报告：改动清单 + 审计结论 + 截图对比 + 手动验证步骤。

## 必读清单

`brand-dna.md` · `forbidden.md`（UI 节）· `references/frontend.md` · `src/app/homepage.css`（1300 行页面局部系统）· 首页施工史见 memory（白厅画廊/深窗四步）

## 禁改范围默认值

不动产品内页与共享 UI 组件 · `homepage-*` 不全局化 · 不动 `src/app/api/**` / `prisma/**` / `src/services/**` · 不改 Clerk 登录流。

## 验证命令

`npm run lint && npm run build` → `npx playwright test e2e/landing.spec.ts e2e/visual.spec.ts` → `e2e/mobile.spec.ts --project=mobile` → i18n-check 三语 → claude-in-chrome 实跑 reveal/CTA/锚点。
