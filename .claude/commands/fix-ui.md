分析以下组件的 UI 问题并提出修改方案：$ARGUMENTS

请按以下步骤执行：

1. 读取目标文件
2. 对照 `docs/references/ui-defaults.md`（字体三槽 · 颜色脊柱 · 间距/圆角/阴影 · 动效配方 · 交互状态 · 移动端配方）与 `docs/forbidden.md` UI 节检查；目标页有 `docs/references/pages/<页>.md` 的以页文档为准，首页营销域（`src/components/business/home-v4/**`）按 `docs/scenes/ui-marketing.md` 与 `pages/home.md` 判断。
3. 输出违规清单，格式如下：
   - `[FAIL]` 文件名:行号 — 违规内容 → 违背的文档与节号
   - `[WARN]` 文件名:行号 — 潜在问题 → 建议
4. 针对每条违规给出具体修改方案（Tailwind class 或 CSS 值替换）
5. 最后按影响程度排优先级（高 / 中 / 低）
