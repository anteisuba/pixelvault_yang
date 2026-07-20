# 禁忌清单 — forbidden.md

AVOID / PREFER 成对出现。P0 级违反（★）= checklist 直接打回。UI 禁忌只保护品质、行为和设计权力边界，不规定全站长相。

## UI

| AVOID                                                              | PREFER                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| ★ 未确认业务域和关键切片就直接整页实现                             | 先完成域定义 → 三个结构方向 → 一个关键切片 → owner 确认              |
| ★ 把当前页面、archive、UI inspiration 或旧品牌稿当作新 UI 的硬模板 | 把它们当证据；新方向由业务工作流决定                                 |
| ★ 共享组件强制所有业务域使用同一种 card、pill、圆角、颜色或 chrome | 共享行为/API/状态/可访问性，外观由 domain/page variant 与 token 覆盖 |
| ★ 为追求复用把不属于该域的字段藏进高级设置、disabled 或隐形状态    | 页面只呈现该域负责的能力；跨域能力通过明确入口流转                   |
| ★ 缺焦点、键盘路径、ARIA、label 或只靠颜色表达状态                 | 键盘/读屏/焦点/文本或图形冗余表达完整                                |
| ★ 桌面弹窗原样搬到手机、触屏自动聚焦弹键盘、关闭后焦点丢失         | ResponsiveOverlay、直接触发输入、focus return                        |
| ★ 死按钮、假数据、假进度、静默失败或不支持仍渲染                   | 不支持不渲染；状态真实；错误可恢复；空态有下一步                     |
| ★ 装饰循环动效、忽略 reduced-motion、动效阻断主任务                | 动效服务状态/连续性/反馈并提供降级                                   |
| ★ 重复视觉值散落为无语义硬编码或页面样式泄漏全局                   | primitive → semantic → domain/component/page token，作用域清楚       |
| ★ 用小修范围偷做未确认改版，或用“保持现状”阻止已立项改版探索       | 小修保持局部以控风险；改版按独立流程重新定方向                       |

## 前端代码

| AVOID                           | PREFER                                            |
| ------------------------------- | ------------------------------------------------- |
| ★ `any` / 裸 JSON 类型          | Zod schema + `z.infer<typeof schema>`             |
| ★ 魔法字符串 / 数字             | `src/constants/`                                  |
| ★ 组件里 fetch                  | `src/lib/api-client.ts`                           |
| 新功能自由发挥开发顺序          | constants → types → services → hooks → components |
| 偷偷换范式（class↔hooks、换库） | 匹配代码库既有约定；要换先暴露冲突                |

## 后端与架构

| AVOID                            | PREFER                                       |
| -------------------------------- | -------------------------------------------- |
| ★ API route 里堆业务逻辑         | auth → Zod validate → call service           |
| ★ `.parse()`                     | `.safeParse()`                               |
| ★ 裸调外部 API                   | `withRetry()` + per-provider circuit breaker |
| ★ service 文件不加 `server-only` | 首行 `import 'server-only'`                  |
| `console.log`                    | `src/lib/logger.ts`                          |
| 用户 prompt 直发 AI              | `prompt-guard.ts` 先校验                     |
| LLM 输出直接使用                 | `llm-output-validator.ts` 先校验             |
| 把属性建模成类型/节点种类        | 属性归属性，结构正确优先于局部省事           |

## 数据库

| AVOID                         | PREFER                                     |
| ----------------------------- | ------------------------------------------ |
| ★ 不看影响面就改高引用模块    | 先搜索 import/调用方；高引用只做兼容式演进 |
| ★ credit 扣减逻辑进客户端     | 只跑服务端                                 |
| schema 改完不管迁移与存量数据 | 迁移纪律 + 回滚评估 + 回填路径             |
| 信任客户端传的 ownership      | 服务端校验 userId/资源归属                 |

## CI/CD 与环境

| AVOID                             | PREFER                                   |
| --------------------------------- | ---------------------------------------- |
| ★ dev server 跑着并行 build       | 会污染 `.next`/Turbopack；build 前停 dev |
| ★ kill 端口 3000 的进程           | 3000 被占视为用户开的，直接复用          |
| ★ owner 已开 dev 时另起实例       | 复用现有实例；需要日志时向 owner 要      |
| ★ 跳过 pre-push 全量验证          | 完整跑完 tsc、lint、Vitest               |
| ★ PowerShell 重写源码文件         | 源码编辑使用 apply_patch，保护 UTF-8     |
| `NEXT_PUBLIC_` 塞机密             | 只放公开配置                             |
| ★ secret / `.env` / 测试 key 入库 | 环境变量与加密存储；提交前检查 diff      |
| 未经 owner 确认 commit/push       | 完整切片 + checklist + owner 点头        |

## 测试

| AVOID                    | PREFER                                           |
| ------------------------ | ------------------------------------------------ |
| ★ 只跑定向子集就声称全绿 | 明确区分定向验证与全量验证                       |
| ★ 全量 tsc 因超时跳过    | 后台运行并捕获真实 exit code                     |
| 截图代替行为断言         | `toHaveCSS`/`toHaveClass`/`getByRole` 等具体断言 |
| 只测 happy path          | 覆盖认证、校验、成功和失败路径                   |
| 换机不更新视觉基线       | 基线按 OS 管理并明确更新范围                     |

## 文档

| AVOID                                | PREFER                                 |
| ------------------------------------ | -------------------------------------- |
| 完成或废止的计划留在 active `plans/` | 归档或沉淀到 references                |
| 新建重复文档                         | 一个事实只有一个家；能更新就不新建     |
| 英文写设计/方案文档                  | 默认中文；代码标识符和路径保留英文     |
| 沉淀方向跳过 owner 核对              | 方向性内容逐节确认后才成为现行规则     |
| 用顶部声明覆盖大段冲突正文           | 真正重写或归档，默认阅读链不留双重答案 |

## Last Verified

- 2026-07-19 · UI 视觉禁令全部退役；保留设计流程、域边界、可访问性、状态真实性、token 作用域和工程安全底线。
