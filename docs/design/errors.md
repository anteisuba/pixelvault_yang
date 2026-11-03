# 错误显示（`o-errors`）

2026-11-01 定稿（owner 授权 Claude 自定）。目标：任何失败在界面上都是**当前语言的一句人话**，说清是什么、能不能重试；原话只进详情 / 日志，不进主句。

## 1. 分层（谁负责什么）

| 层          | 负责                                                                                              | 入口                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 服务端      | 抛带 `errorCode` + `i18nKey` 的错误（`GenerationError` 家族 / `ApiRequestError`），工厂统一序列化 | `src/lib/errors.ts`、`api-route-factory.ts`                                         |
| 分类        | 错误码 / 服务商原话 → 生成错误码；哪些重试无效                                                    | `src/constants/generation-errors.ts`（`ERROR_PATTERNS`、`isGenerationRetryFutile`） |
| 文案        | 码 → 三语句子                                                                                     | `src/messages/common/{en,ja,zh}.json` 的 `Errors.*`                                 |
| 解析        | 失败结果 → 一句话                                                                                 | `src/lib/api-error-message.ts`（纯函数，可测）                                      |
| 组件 / hook | **只**调 `useErrorText()`                                                                         | `src/hooks/use-error-text.ts`                                                       |

## 2. 三种失败，三个函数

- `errText.api(result, t('xxxFailed'))` —— 一般接口（增删改、上传、下载）。后端 / api-client 有 `i18nKey` 用它；否则调用方那句。原话不进主句（第二轮，见 §6）。
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

## 6. 第二轮（11-02，线程「重做错误显示」）

owner 11-02 两类症状：①线上仍弹英文原话 ②报错内容和真实原因不符。第一轮修出口；这一轮改**根子**。

### 6.1 根子：先猜原话，再贴「服务商」标签

一条错误到显示要经过三次「猜」：

1. **api-client 兜底**：响应没有 JSON 体时（Clerk / Vercel 网关的 404 / 413 / 502 / 504、HTML 错页），130 多处写死 `Xxx failed with status N`，100 多处 `An unexpected error occurred`。原因在这一步就丢了，只剩一句英文。
2. **按原话关键词分类**（`ERROR_PATTERNS`）：`\b401\b` → 「API Key 无效」（会话过期也是 401）；`not found` / `\b502\b` → 「模型不可用」（路由 404、网关 502 也中）；`timeout` → 「服务商超时」（前台自己的 `AbortSignal.timeout` 也中）。
3. **认不出就说「服务商返回：{原话}」**（`generation.unknownWithDetail`）：原话可能是我们自己的兜底句、网关或浏览器。10-29「服务商返回：Failed with status 404」就是 1 + 3 叠出来的（#486 修了那一例的源头，机制还在）。

### 6.2 改法：按「错在哪一层」打标，结构化字段优先，不猜原话

| 层       | 谁打标                 | 判据                                                           | 码 → 文案（`Errors.transport.*` 三语）                                                         | 重试                      |
| -------- | ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| 断网     | `getThrownErrorFields` | `fetch` 抛 `Failed to fetch` 等                                | `TRANSPORT_NETWORK` 网络连不上                                                                 | 是                        |
| 前台超时 | 同上                   | `TimeoutError`（`AbortSignal.timeout`）                        | `TRANSPORT_TIMEOUT`                                                                            | 是                        |
| 登录过期 | `getErrorPayload`      | 401 无 JSON（门口 401 有 JSON，走 `errors.auth.unauthorized`） | `TRANSPORT_SESSION_EXPIRED`                                                                    | 否                        |
| 网关     | `getErrorPayload`      | 无 JSON：403 / 404·405 / 413 / 429 / 5xx·504                   | `TRANSPORT_FORBIDDEN` / `NOT_FOUND` / `TOO_LARGE` / `RATE_LIMITED` / `UNAVAILABLE` / `TIMEOUT` | 413、403 否               |
| 信封不对 | `parseApiResult`       | 2xx 但不是 `{ success, data }`                                 | `TRANSPORT_BAD_RESPONSE`                                                                       | 是                        |
| 我们自己 | 路由工厂               | JSON 带 `errorCode` + `i18nKey`                                | 按 `i18nKey`                                                                                   | 按码                      |
| 服务商   | 服务端分类             | 服务端拿到对方响应                                             | `GENERATION_ERROR_CODES`                                                                       | `isGenerationRetryFutile` |

- 码与 i18nKey 在 `src/constants/transport-errors.ts`；api-client 只用 `getErrorPayload(response)`、`getThrownErrorFields(err)`、`parseApiResult(response)`、`toApiFailure(err)`、`ApiClientError`（`src/lib/api-client/shared.ts`），⛔ 不再写英文兜底句。
- `getGenerationErrorMessage`：`TRANSPORT_*` / `CLIENT_ERROR` / `ABORTED` / `UNAUTHORIZED` 不跑关键词分类、不贴「服务商返回：」。
- **原话只进详情，不进主句**（owner 11-02 定）：`getApiErrorMessage` 只认 `i18nKey`，否则调用方那句；第一轮的「主句（原话）」括号写法删掉。生成失败认不出原因时仍是「服务商返回：{原话}」——那一层的原话确实来自服务商。
- react-query 的 queryFn 失败抛 `new ApiClientError(result)`，显示处 `errText.thrown(error, t('…'))` 能读到 i18nKey。

### 6.3 转述出错清单（这一轮修掉的）

| 真实原因                        | 以前说成                                                | 现在                              |
| ------------------------------- | ------------------------------------------------------- | --------------------------------- |
| 会话过期（401 空体）            | 「API Key 无效」/「服务商返回：Failed with status 401」 | 登录已过期，请重新登录            |
| 路由 404（刚部署、页面旧）      | 「服务商返回：Failed with status 404」                  | 这个功能暂时访问不到，刷新再试    |
| 网关 502 / 504                  | 「模型不可用」/「服务商超时」                           | 服务暂时不可用 / 服务器太久没回应 |
| 请求体过大 413（Vercel 4.5 MB） | 英文 `… status 413`                                     | 发送的内容太大                    |
| 前台等待超时                    | 「服务商超时」                                          | 服务器太久没回应                  |
| 浏览器断网                      | 英文原话 / 「服务商返回：Failed to fetch」              | 网络连不上                        |

### 6.4 还没做的

- 服务端 `ERROR_PATTERNS` 本身（`blocked|safety` → 内容被过滤、`not found` → 模型不可用）仍然偏宽；它现在只吃服务端拿到的服务商原话，误判面小了。要收窄先看线上误判样本，不凭感觉改。
- 「查看详情」只有生成失败有；一般接口的原话现在只在网络面板 / 日志里。真要给用户看再加。
- 各家 `XxxResponse` 类型还没统一声明 `errorCode` / `i18nKey`（字段在运行时都有，靠 spread 带上）；以后统一信封类型时一起改。
- 自定义中转站（`p-custom-relay`）的报错：做中转时一并接 `errText.generation`。
- eslint 拦 `X.error ?? t(...)` 与 `toast.error(x.error)`：等下一轮把剩下几处原话展示清完再开。

## 7. 第三轮（11-03，线程「收窄错误分类并拦旧写法」）

### 7.1 eslint 守门

`eslint.config.mjs`「错误显示门」管 hooks / components / contexts / features 的组件与 hook，拦四种旧写法：`response.error ?? t('…')`（或 `?? 'English'`）、toast 里放 `result.error` / `err.message`、`err instanceof Error ? err.message : t('…')`、`setError(err.message …)`。只把原话往下传给分类器的 `payload.error ?? ''` 不拦。现存 33 处一并改走 `useErrorText`。

### 7.2 服务端关键词分类按线上样本收窄

样本：生产 `GenerationJob` 失败记录（只读，owner 11-03 点头），223 种原话。Vercel Hobby 日志只留 1 小时，`get_runtime_errors` 只收未接住的异常，当不了样本源。按样本找出约 120 次分错：

| 原话                                                                                                                                                           | 以前                           | 现在                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------- |
| 裸 `fetch failed` / `write EPIPE` / `terminated`（34）                                                                                                         | 参考图下载不到                 | 新码 `provider_unreachable` 连不上  |
| LoRA 取不到：`LoRA file URL is not accessible`、Civitai 下载、fal `loras` 下载、Replicate `URL responded with status code: 4xx` / `URL not downloadable`（44） | 参考图 / Key 无效 / 模型不可用 | 新码 `lora_unreachable`             |
| Workflow 步骤输出超 1MiB、Prisma 事务超时、火山输出 `size` 参数、Runner hires 尺寸（7）                                                                        | 参考图过大 / 超时 / 尺寸       | `unknown`（显示原话，不指错方向）   |
| 裸 404 `Not Found` / `Path … not found`（3）                                                                                                                   | 模型不可用                     | `unknown`                           |
| fal `content_policy_violation`、BytePlus `PolicyViolation`（码与原话）（12）                                                                                   | 认不出                         | 内容审核                            |
| NovelAI 订阅只支持 1 张参考图（6）、`API key/token is invalid`（6）、fal LoRA 不兼容（3）                                                                      | 认不出                         | 参考图张数 / Key 无效 / LoRA 不兼容 |

- 去掉的宽规则：参考图 `fetch.*failed`、模型不可用的裸 `not found` 与 `\b502\b`。
- 回归样本：`src/constants/generation-errors.samples.test.ts`，以后加 / 改规则先往里放真实原话。
- 只动了 app 侧（`src/constants/generation-errors.ts`）。Worker 自己的 `classifyProviderFailure`（`workers/execution/src/lib/provider-error.ts`）没动，要统一时在 Worker 线一起做。

### 7.3 样本里顺带看到的（不是分类问题）

- `Step poll-runner-image-*-1 output is too large. Maximum allowed size is 1MiB`：Runner 轮询步骤把整包结果塞进 Workflow 步骤输出，撞 Cloudflare 1MiB 上限 → Worker 线。
- `Maximum call stack size exceeded`（NovelAI / Gemini / OpenAI 共 17）与 NovelAI ZIP 解压错（`unexpected end of file` 等 15）：我们自己的代码问题，待查。
