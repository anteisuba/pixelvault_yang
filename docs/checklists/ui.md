# UI Checklist — P0 不过打回

每次 UI 改动完成后逐项过，完成报告里**逐条给结论**；跳过哪项要写明原因。机械项（可跑命令）先跑，判断项逐条核。

## P0（必须全过）

- [ ] `npm run lint && npm run build` 绿
- [ ] `npx playwright test e2e/visual.spec.ts` diff 为空；有意改动已 `--update-snapshots` 并在报告里点名改了哪些快照
- [ ] 对照 `forbidden.md` UI 节逐条无违反（无渐变/霓虹/任意值/硬编码色/死按钮/装饰动效）
- [ ] 符合该页现行体系：未改版页 = v1 现状约定（双面模式归属正确，暗面有 `color-scheme: dark`）；已按房间文档改版页 = 符合该页施工图；**不许混搭**
- [ ] 触达区 ≥ 44px；键盘可达 + 焦点环完整
- [ ] i18n 三语同步（en/ja/zh messages 全改，跑 i18n-check）
- [ ] 涉及间距/颜色/断点/role 时用 `toHaveCSS`/`toHaveClass`/`getByRole` 断言具体值
- [ ] `prefers-reduced-motion` 生效（framer-motion 接 useReducedMotion）

## P1（应过）

- [ ] 空态有起手势（一句说明 + 可点动作）
- [ ] hover / focus / loading / error / 空态实跑验证过（claude-in-chrome，静态截图看不出）
- [ ] 移动端 375 无横向溢出；披露走 ResponsiveOverlay
- [ ] 圆角阶梯正确（面板 2xl / 卡片 xl / 控件 lg / chip full，同层不混）
- [ ] chip 三态正确（空 / 已设值 / 不支持不渲染）
- [ ] AI 产出遵守「填入 / 追加 / 复制」三动作语法
- [ ] 动效走时长刻度（120/200/320/500）与统一缓动

## P2（加分）

- [ ] 入场 stagger（50ms 步进，封顶 300ms）
- [ ] 有设计稿时与 Figma 并排核对过（`get_design_context` / `get_screenshot`）
- [ ] 交付报告附截图 / 图示对比
