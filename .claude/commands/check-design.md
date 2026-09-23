对 Landing Page 做设计规范合规检查。$ARGUMENTS

如果 $ARGUMENTS 为空，则做完整检查；否则只检查指定页面或组件。

请按以下步骤执行：

1. 范围：`src/app/[locale]/page.tsx` 及其引用的 `src/components/business/home-v4/**`、`src/app/home-v4.css`。

2. 依据 `docs/references/pages/home.md`、`docs/scenes/ui-marketing.md`、`docs/references/ui-defaults.md`（营销域例外以 home 页文档为准）与 `docs/forbidden.md` UI 节，按与本次检查相关的维度检查：色彩、字体、间距、动效、信息层级、移动端。

3. 输出结构化报告，格式：

   ```
   ## [维度名]
   [PASS] 描述
   [WARN] 文件:行号 — 问题描述 → 建议
   [FAIL] 文件:行号 — 问题描述 → 必须修复
   ```

4. 报告末尾按影响排序。
