# UI Checklist — 8 项，缺一打回

> 2026-09-03 owner 拍板：从 16 项 P0 压成 8 项，每项必须附证据，不接受"已确认"三个字。默认值与配方在 `references/ui-defaults.md`；日常任务的输入是 `templates/ui-request.md` 需求卡。改版级任务在这 8 项之外还要过 `scenes/ui-page.md` 的确认门（域定义 → 方向 → 关键切片 → owner 选向）。

## 8 项

| #   | 项                                                       | 证据                                                                     |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | lint + typecheck 绿                                      | `npm run lint && npm run typecheck` 输出                                  |
| 2   | 颜色对比度过：文字 4.5:1、大字与图标 3:1                 | `contrast-check` 输出贴进报告；无新颜色写"无新颜色"                        |
| 3   | 移动端 e2e 过                                            | `npx playwright test e2e/mobile.spec.ts --project=mobile`                |
| 4   | 真机三张截图：桌面 1440 · 平板 820 · 手机 375            | `verify-real`；375 图能看出该路由的移动端等级已达成                        |
| 5   | reduced-motion 目检：开启后无位移动画                    | DevTools 渲染面板模拟一张截图                                              |
| 6   | i18n en/ja/zh 三语同步；zh/ja 长文本不破版               | `src/messages/` 三文件 diff + zh 截图                                     |
| 7   | 需求卡状态矩阵每格实跑                                   | 报告逐格勾：空 / 加载 / 有内容 / 错误 / 禁用 / 选中（只列真实存在的）      |
| 8   | 需求卡交互动作表每行实跑，每行有可见反馈与动效           | 报告逐行勾，动效引用 `ui-defaults.md §4` 配方名                            |

## 机器门（提交前 grep，任何命中即打回）

```bash
grep -rn "font-family" src --include=*.tsx --include=*.ts
grep -rn "font-serif" src --include=*.tsx
grep -rnE "(text|bg|border)-(amber|emerald|red|blue|green|yellow|purple|pink|rose|sky|violet|indigo|orange|teal|cyan|lime|fuchsia|slate|gray|zinc|stone)-[0-9]{2,3}" src/components src/app --include=*.tsx
grep -rn "^:root" src/app --include=*.css | grep -v globals.css
```

（第 1 条允许 `src/app/*.css`；第 4 条域 token 只写域根。规则化进 eslint 是独立任务。）

## 跳过

任何一项跳过都要写原因和替代证据。docs-only 改动只跑 `git diff --check` + 失效引用搜索。

## Last Verified

- 2026-09-03 · 16 项 P0 + P1/P2 整体退役，改为 8 项 + 机器门。退役项里"域级确认 / 三方向 / 关键切片 / 局部确认图作用范围 / 不继承旧皮肤"移入 `scenes/ui-page.md` 改版流程本身；"命中区 / 键盘 / ARIA / 状态不靠颜色"由 `ui-defaults.md §5` 作为实现默认承担，第 4、7、8 项截图与实跑即为证据。
- 2026-07-19 · 删除统一圆角、pill、双面模式、固定配色与固定动效等造型验收。
