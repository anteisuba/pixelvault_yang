重构以下 section 的布局和样式：$ARGUMENTS

请按以下步骤执行：

1. 读取指定文件，定位目标 section 的代码范围
2. 分析当前问题：结构、色彩、间距、字体层级、动效等方面的偏差
3. 提出重构方案，包含：
   - 布局结构调整（如何改、为什么改）
   - 色彩替换清单（旧值 → 新 token，对应 `ui-defaults.md §2` 哪条）
   - 字体/间距调整说明
   - 动效方案（按 `ui-defaults.md §4` 配方；首页营销域按 `pages/home.md`）
   - 需要注意的边界情况（移动端响应式等）
4. 等待用户确认方案后，再输出完整替换代码

设计规范：`docs/references/ui-defaults.md`、`docs/forbidden.md` UI 节；目标页有 `docs/references/pages/<页>.md` 的以页文档为准。
