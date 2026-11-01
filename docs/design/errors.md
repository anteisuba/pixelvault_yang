# 错误显示（`o-errors`）

2026-11-01 定稿（owner 授权 Claude 自定）。目标：任何失败在界面上都是**当前语言的一句人话**，说清是什么、能不能重试；原话只作补充，不单独摆出来。

## 1. 分层（谁负责什么）

| 层          | 负责                                                                                              | 入口                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 服务端      | 抛带 `errorCode` + `i18nKey` 的错误（`GenerationError` 家族 / `ApiRequestError`），工厂统一序列化 | `src/lib/errors.ts`、`api-route-factory.ts`                                         |
| 分类        | 错误码 / 服务商原话 → 生成错误码；哪些重试无效                                                    | `src/constants/generation-errors.ts`（`ERROR_PATTERNS`、`isGenerationRetryFutile`） |
| 文案        | 码 → 三语句子                                                                                     | `src/messages/common/{en,ja,zh}.json` 的 `Errors.*`                                 |
| 解析        | 失败结果 → 一句话                                                                                 | `src/lib/api-error-message.ts`（纯函数，可测）                                      |
| 组件 / hook | **只**调 `useErrorText()`                                                                         | `src/hooks/use-error-text.ts`                                                       |

## 2. 三种失败，三个函数

- `errText.api(result, t('xxxFailed'))` —— 一般接口（增删改、上传、下载）。后端有 `i18nKey` 用它；否则调用方那句打头，服务端原话放括号里补充。
- `errText.generation(result, t('generateFailed'))` —— 出图 / 视频 / 音频 / 3D。再按错误码与服务商原话分类（余额、key、限流、审核、参考图……）。
- `errText.thrown(err, t('xxxFailed'))` —— `catch (err)`。浏览器断网（`Failed to fetch` 等）统一说成「网络连不上」；我们自己的程序异常（`TypeError: …`）不给人看，只用调用方那句。

⛔ 不再写 `response.error ?? t('…')`、`err instanceof Error ? err.message : …`：这两种写法把英文原话直接摆到中文 / 日文界面上，是这一类 bug 的根。

## 3. 显示方式

| 场景                                   | 方式                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| 用户刚做的动作失败（保存、删除、上传） | toast                                                                          |
| 生成失败                               | 生成卡 / 舞台上行内显示 + toast；重试按钮按 `isGenerationRetryFutile` 决定有无 |
| 整页数据读不到                         | 页内空状态 + 重试                                                              |
| 表单校验                               | 字段旁行内，不弹 toast                                                         |
| 缺 key                                 | `QuickSetupDialog` 就地弹（CLAUDE.md Hard Rule 8），不只说一句                 |

## 4. 能否重试

重试无效的码集中在 `RETRY_FUTILE_ERROR_CODES`：余额不足、key 无效、账号用量闸、模型未开通、作者关下载、Runner 月度额度、**执行 worker 拒收**。其余（超时、限流、服务商 5xx、连不上）给重试。

## 5. 本轮已做（11-01）

- Runner 400 被说成「生成服务暂时无法连接」：worker 拒收（4xx）单列 `execution_request_rejected`，把 worker 原话说出来、不给重试；连不上（网络 / 5xx / 429）照旧。
- `getApiErrorMessage` 不再单独返回服务端英文原话；新增 `getThrownErrorMessage`、`useErrorText`。
- 迁移约 30 个组件 / hook 的 `response.error ?? …` 与 `err.message` 写法（含 3D 台上传、出图失败 toast、角色卡、项目、API key、LoRA 资产等）。

## 6. 剩下的（按模块迁，碰到哪块迁哪块）

- 兜底是英文字面量的（`throw new Error(result.error ?? 'Failed to load …')`，多在 react-query 的 queryFn 里）：显示处改用 `errText.thrown`。
- hook 里把原话存进 state、组件再显示的（上传队列 `item.error`、角色库 `library.error` 等）：在 hook 写 state 时就过 `errText`，组件只显示。
- 自定义中转站（`p-custom-relay`）的报错：做中转时一并接 `errText.generation`，不单独做。
- eslint 规则：`no-restricted-syntax` 拦 `X.error ?? t(...)`，等剩下的迁完再开，免得一开一片红。
