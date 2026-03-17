对 Landing Page 做设计规范合规检查。$ARGUMENTS

如果 $ARGUMENTS 为空，则做完整检查；否则只检查指定页面或组件。

请按以下步骤执行：

1. 扫描 Landing Page 相关文件：
   - `src/app/[locale]/(main)/` 下的 page.tsx 和 layout.tsx
   - `src/components/layout/Navbar.tsx`
   - 页面引用的所有业务组件

2. 按 6 个维度逐项检查（参考 CLAUDE.md 「设计语言」section）：
   - **色彩**：背景、文字、强调色是否符合规定色值；是否存在禁止色
   - **字体**：标题/正文是否 sans+serif 配对；是否用了通用字体
   - **间距**：Section 间距、内容最大宽度、正文列宽是否达标
   - **动效**：是否只用 fade-in+translate-up；有无禁止动效
   - **禁止风格**：蓝紫渐变、霓虹光效、重投影卡片、generic AI 美学
   - **信息层级**：大标题 → 说明文 → CTA 的节奏是否清晰

3. 输出结构化报告，格式：
   ```
   ## [维度名]
   [PASS] 描述
   [WARN] 文件:行号 — 问题描述 → 建议
   [FAIL] 文件:行号 — 问题描述 → 必须修复
   ```

4. 报告末尾输出优先级排序，对照 CLAUDE.md 「当前任务焦点」中的三个方向（Hero 重构 / Landing page 节奏 / 移动端响应式），标注每个 FAIL/WARN 属于哪个焦点方向。
