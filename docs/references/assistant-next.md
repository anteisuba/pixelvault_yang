# 助手重设计内核（next）— 施工基准

> 状态：**第 2 步「新内核骨架」（2026-10-22）**。代码在 `src/features/assistant/`，只给 owner 开：浏览器 `localStorage['antei:assistant-kernel'] = 'next'` + 服务端 `isAdmin`，先只接图片台与 LoRA 台；别的台、别人照走 v3。第 8 步评测全面不差就一次切换、v2/v3 整块删。总设计与各步顺序见施工单 a-redesign。

## 1. 为什么另起

v3 的问题不在某一条规矩，而在外壳替模型做了太多事（审计：工具失败 20%，编造多为参数校验失败后仍声称改好）。新内核按「薄外壳、厚模型」：

- **四个通用工具**：`look`（读台子 + 把图摆到眼前）/ `edit`（一次改多格，按顺序落）/ `ask`（问题卡）/ `generate`（确认卡）。
- **入参宽进**（`tools.ts`）：给模型看的 schema 是严格形状，交给 SDK 的不校验；自己解析时可空字段缺了当 null、单个对象当数组、数字字符串也认，读不懂才回「哪一格不对」。⛔ 不按模型家族判死。
- **各家自带联网直接挂主循环**（`models.ts`）：Claude `web_search_20260209` + `web_fetch`、OpenAI / Grok Responses `web_search`、Gemini `google_search` + `url_context`、DeepSeek 走 Anthropic 兼容入口的 `web_search`。搜不搜、搜几次模型自己定。
- **思考跨步接上**：每一步把模型的完整回复（思考、签名、联网结果）原样接回去；OpenAI / Grok 带回加密思考（`store: false`）；DeepSeek 改走 Anthropic 兼容入口（OpenAI 兼容那条 SDK 不回传 `reasoning_content`）。
- **思考档整轮用创作者选的那一档**，⛔ 不按步降档。
- **看过的图一直留在眼前**，超过 16 张才把最早的换成一行字。
- ⛔ 没有步数上限、⛔ 没有「同一错 N 次就停」：停只有创作者按停（owner 2026-10-22）。

## 2. 结构

| 文件          | 管什么                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `kernel.ts`   | 主循环：调模型 → 执行工具 → 结果接回 → 再调；软线前存状态、交接力条                                                      |
| `models.ts`   | 五家接法 + 自带联网；每家带 `fallback`（v3 那条跑通的接法），被厂商 4xx 拒掉时整轮换过去                                 |
| `tools.ts`    | 四个工具的入参与宽进解析                                                                                                 |
| `bench.ts`    | 新工具 → v3 执行函数的入参（台上每一格怎么改是「线上协议」，借 v3 已磨过的；第 8 步把这些执行函数搬进来，⛔ 不是跟着删） |
| `prompt.ts`   | 短系统提示（两段：不变的 + 这位创作者的）                                                                                |
| `messages.ts` | 图的存取（存地址、发前现下字节）、换保守接法时剥掉原接法专属的块、之前几轮的对白                                         |
| `state.ts`    | 一轮跑到一半的样子存 Redis（gzip，1 小时；没配 Redis 时进程内存）                                                        |

**接力**：面板协议不变。软线（120 秒）到了，服务端把整段消息存进 Redis，发一条 `transcript` 事件，里面只有板子那一条、只带 `turn {id, hop}`；浏览器收到 `time_budget` 就带着它接着发下一次（新内核所有台都接、不设上限）。存不下（压缩后 > 900KB）或取不回来就照常收尾 / 从这一句重新开一轮。

**过程记录**：照写 `AssistantTurnRecord`，`promptVersion = next-YYYY-MM-DD`；本轮记录投成 v3 形状（自带联网记成 `search_web`），评测工具照用。

## 3. 没验证的（2026-10-22）

- DeepSeek Anthropic 兼容入口跑主循环、Grok Responses、Claude adaptive 思考、OpenAI `store:false` 下联网结果的回传，都只在单测里用假模型跑过；被拒会自动退回 v3 接法，但要用真 key 跑一次评测才算数。
- 第 2 步还不能挂新 LoRA、不能搜素材库（「查」是第 3 步）。

## Source of Truth

- `src/features/assistant/`（全部）· 路由开关 `src/app/api/studio/assistant-operator/route.ts` · 浏览器开关与接力 `src/hooks/use-assistant-operator.ts`（`readsNextKernel`）
- 接口与搜索调研：项目文件 `assistant-reliability/model-interfaces.md`

## Last Verified

- 2026-10-22 · 第 2 步骨架：`tsc` 0 error、改动文件 eslint 0 problem、定向 vitest（`src/features/assistant` 21 条 + 路由 / hook / 过程记录，相关共 194 条全绿）。⚠ 没对真模型跑过。
