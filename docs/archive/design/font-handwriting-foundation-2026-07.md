# 字体地基工程 — 手写双层系统（2026-07-10 拍板）

> 状态：**已归档，不得施工（2026-07-19 owner 确认）**。全局手写字体地基随旧视觉方向一并废止；其中的字体调研仅作历史证据。任何业务域若需要特殊字体，必须在该域方向与关键切片确认后重新立项。
> 执行分工：本文档 = 施工图（Fable 出）；实施走 Sonnet，按 `docs/WORKFLOW.md` 七步。

## 拍板结论（owner 2026-07-10 晚，选择框确认）

**双层字体系统**：

| 层                                             | 角色       | 字体                                                                  |
| ---------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| **内容层**（标题、正文、说明、批注、空态文案） | 人的声音   | 手写体：zh **鸿雷行书简体** · ja **Zen Kurenaido** · latin **Caveat** |
| **控件层**（按钮、菜单、表单、导航）           | 机器的声音 | 维持现状：Geist + Noto Sans SC/JP（「稍正式」，零改动）               |
| **数据层**（参数值、seed、尺寸、credit 数字）  | 机器的声音 | 维持现状 sans/mono，**永不手写**（要对齐、要扫读）                    |

气质基准：owner 参考图 = Excalidraw 风格蓝墨手写「1 Person + AI = 1 Team」——潦草但完全可读的日常字。
被否历史（勿回头）：明朝体/宋体标题（太普通）、动画工房/昭和印刷/胶片资料馆隐喻方向（不对味）。

## 字体资产事实

| 字体          | 来源                              | font-family（css 内声明） | 授权     | 备注                                                                                                           |
| ------------- | --------------------------------- | ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 鸿雷行书简体  | npm `@chinese-fonts/hlxsjt@3.0.0` | `hongleixingshu`          | 免费商用 | 中文网字计划切片包，单字重，css=`dist/鸿雷行书简体/result.css`（相对路径引 woff2 切片，每片 20~90KB 按需加载） |
| Zen Kurenaido | Google Fonts（next/font/google）  | —                         | OFL      | 单字重 400                                                                                                     |
| Caveat        | Google Fonts（next/font/google）  | —                         | OFL      | 有 400~700 可变字重，取 500/600                                                                                |

⚠ 鸿雷包内目录名含中文（`dist/鸿雷行书简体/`）。为绕开 bundler 中文路径风险，**推荐静态方案**：把该目录整体拷贝到 `public/fonts/hongleixingshu/`（result.css 与 woff2 同目录，相对路径自解析），全局 css 里 `@import '/fonts/hongleixingshu/result.css'` 或 `<link>` 引入。如实施时验证 Turbopack 直接 import node_modules css 无碍，可改走依赖方案，二选一后在本文档回填结论。

## 施工步骤（constants → types → … 顺序照旧）

1. **资产落地**：鸿雷切片包进 `public/fonts/hongleixingshu/`（含 LICENSE 一并拷入）；确认 result.css 内已带 `font-display:swap`。
2. **fonts.ts**（`src/i18n/fonts.ts`）：
   - 新增 `Caveat`、`Zen_Kurenaido`（next/font/google），变量 `--font-handwriting-latin` / `--font-handwriting-ja`。
   - 顺带清理历史假变量：`displayFont`、`serifFont` 目前都是 Geist 的重复实例（假衬线），本工程内评估合并/删除（`--font-app-display`/`--font-app-serif` 引用处 grep 后决定，>5 处则只做向后兼容别名）。
3. **globals.css**：
   - `@theme inline` 新增 `--font-handwriting`（产出 Tailwind `font-handwriting` utility）。
   - `:root`：`--font-handwriting: var(--font-handwriting-latin), 'hongleixingshu', 'KaiTi', '楷体', cursive;`（拉丁字形让 Caveat 先吃，CJK 落鸿雷，缺字回退系统楷体）。
   - `html:lang(ja)` 覆盖：Zen Kurenaido 提到鸿雷前（沿用现有 388~408 行 locale 覆盖模式）。
   - `html:lang(zh)`：确认鸿雷在 Zen Kurenaido 前即可。
4. **字号地板**：手写正文最小 15px、行高 ≥1.8（手写字形辨识冗余低）。建 `.prose-handwriting`（或等价 token）一处定义，禁止各组件自配。
5. **试点应用（本工程只做一处）**：Studio 空态起手势文案（`StudioEmptyState` ns）换 `font-handwriting`——影响面小、正好是「人的声音」。**全站页面铺开不属于本工程**，按 brand-dna 过渡期规则逐页走改版流程。
6. **验证**：三语切换目检（en/ja/zh 标题+正文+数字混排）、生僻字回退目检（如「魑魅魍魉龘」落楷体不落黑体）、Network 面板确认只拉用到的切片、CLS 无跳动；全量 vitest + tsc。

## 禁改范围

- 不动 v1 双面色 token、不碰颜色基调（蓝墨水 × 奶油纸属风格工程，**另立项待拍板**）。
- 不动按钮/表单/参数面板字体（控件层与数据层 = 现状）。
- 不在本工程里做任何页面级重设计。

## Last Verified

- 2026-07-10 · 选型 owner 选择框拍板；npm 包结构与 family 名经 registry/unpkg 实测（jsdelivr 对中文路径 404，unpkg 可用——仅影响预览，生产走自托管）。
