# 禁忌清单 — forbidden.md

AVOID / PREFER 成对出现。P0 级违反（★）= checklist 直接打回，无讨论空间。

## UI

> 过渡期注记：代码现状仍是 v1 体系。未按房间文档改版的页面，日常改动匹配现状约定；已改版页面以 `references/pages/<页>.md` 为准。方向层规则见 `brand-dna.md`。

| AVOID                                                          | PREFER                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ★ 紫蓝渐变、霓虹光晕、玻璃形态滥用、AI 光效、渐变文字          | 克制材质、内容优先（按 brand-dna 世界层）                                               |
| ★ 深色科技蓝光风、过度 hero 空白                               | 有隐喻的房间设计；过渡期 = 现状 v1 双面模式                                             |
| ★ 违反颜料纪律的彩色（大面积彩底 / 一屏多支颜料 / 档案间执彩） | 彩色只做房间工具痕迹（brand-dna 颜料纪律三条）                                          |
| ★ 无意义装饰动效                                               | 动效只服务状态/连续性/反馈；性格按 brand-dna（手作动作）                                |
| ★ Tailwind 任意值（`text-[10px]` 等）                          | 扩展 `globals.css` @theme inline（Tailwind 4 无 config 文件）；用 `text-2xs`/`text-3xs` |
| ★ 硬编码 `bg-white`/`bg-zinc-*`                                | 语义 token（`bg-background`/`bg-card`/`border-border`）                                 |
| 字体自由发挥、标题用系统字兜底                                 | 按 brand-dna 字体方向；选型未拍板前维持现状字体栈                                       |
| 死按钮 / 死空白（不支持还渲染、空态无动作）                    | 不支持不渲染；空态起手势                                                                |
| 桌面弹窗直接上手机                                             | ResponsiveOverlay（桌面 Popover ↔ 手机 Drawer)                                          |
| 自动聚焦弹软键盘（autofocus / 弹窗默认聚焦）                   | 触屏只在直接点输入框时弹（focusUnlessTouch 家族）                                       |
| 缺 API key 时禁用 UI                                           | 路由到 QuickSetupDialog 内联配置                                                        |
| 改版页与未改版页风格混搭（单点混入新风格）                     | 整页走改版流程（调研 → 施工图 → 概念稿 → 实施）                                         |

## 前端代码

| AVOID                           | PREFER                                            |
| ------------------------------- | ------------------------------------------------- |
| ★ `any` / 裸 JSON 类型          | Zod schema + `z.infer<typeof schema>`             |
| ★ 魔法字符串 / 数字             | `src/constants/`                                  |
| ★ 组件里 fetch                  | `src/lib/api-client.ts`                           |
| 新功能自由发挥开发顺序          | constants → types → services → hooks → components |
| 偷偷换范式（class↔hooks、换库） | 匹配代码库既有约定；要换先暴露冲突                |

## 后端与架构

| AVOID                             | PREFER                                            |
| --------------------------------- | ------------------------------------------------- |
| ★ API route 里堆业务逻辑          | 三件事：auth → Zod validate → call service        |
| ★ `.parse()`                      | `.safeParse()`                                    |
| ★ 裸调外部 API                    | `withRetry()` 包裹 + per-provider circuit breaker |
| ★ service 文件不加 server-only    | 首行 `import 'server-only'`                       |
| `console.log`                     | `src/lib/logger.ts`                               |
| 用户 prompt 直发 AI               | `prompt-guard.ts` 先校验                          |
| LLM 输出直接使用                  | `llm-output-validator.ts` 先校验                  |
| 把「属性」建模成「类型/节点种类」 | 长期建模：属性归属性，结构正确优先于局部省事      |

## 数据库

| AVOID                         | PREFER                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| ★ 不看影响面就改高引用模块    | 先 `grep -r "import.*from.*<模块>" src/`；>5 处只做向后兼容 |
| ★ credit 扣减逻辑进客户端     | 只跑服务端                                                  |
| schema 改完不管迁移与存量数据 | 迁移纪律 + 可回滚评估 + 回填路径                            |
| 信任客户端传的 ownership      | 服务端校验归属（userId）                                    |

## CI/CD 与环境

| AVOID                                  | PREFER                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| ★ dev server 跑着并行 build            | 会污染 .next/Turbopack 缓存导致嵌套路由 404；build 前停 dev   |
| ★ kill 端口 3000 的进程                | 3000 被占 = 用户开的，直接复用                                |
| ★ owner 已开 dev 时自己另起实例        | 直接访问 localhost:3000；需要 server 日志时告诉 owner         |
| ★ 测试 key/账号进生产                  | 一次性 dev 实例 + 限额                                        |
| ★ 跳过 pre-push 全量 vitest            | 全量跑完（~4.5min）才算绿                                     |
| ★ PowerShell 重写源码文件              | PS 默认编码毁 UTF-8 中文；源码只用 Edit/Write 工具            |
| `NEXT_PUBLIC_` 塞机密                  | 只准 Clerk public key、CDN domain、App URL                    |
| ★ secret / .env / 测试 key commit 入库 | key 走环境变量与加密存储；commit 前过一眼 diff                |
| 未经 owner 确认就 commit / push        | 完整切片 + checklist 过了 + owner 点头才提交（WORKFLOW 规则） |

## 测试

| AVOID                  | PREFER                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| ★ 只跑定向子集就声称绿 | 全量 vitest（定向子集抓不住跨文件漂移）                              |
| ★ 全量 tsc 因超时跳过  | 后台跑 + 显式捕获 exit code（~4 分钟能跑完，管道会吃退出码）         |
| 截图代替断言           | `toHaveCSS`/`toHaveClass`/`getByRole` 断言具体值                     |
| 只测 happy path        | API route 五段：401 → 400 → service mock → success → 500             |
| 换机不更新视觉基线     | 基线按 OS 分套（`-win32`/`-darwin`），换 Mac 先 `--update-snapshots` |

## 文档

| AVOID                     | PREFER                             |
| ------------------------- | ---------------------------------- |
| 完成的计划留在活跃路径    | plans/ 完成即删 / 归档 / 沉淀      |
| 新建重复文档              | 一个事实只有一个家；能更新就不新建 |
| 英文写设计/方案文档       | 默认中文；代码标识符和路径保留英文 |
| 沉淀类文档跳过 owner 核对 | 方向性内容逐节核对后才算拍板       |
