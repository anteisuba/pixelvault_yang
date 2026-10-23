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

| 文件                   | 管什么                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel.ts`            | 主循环：调模型 → 执行工具 → 结果接回 → 再调；软线前存状态、交接力条                                                                                                                         |
| `models.ts`            | 五家接法 + 自带联网；每家带 `fallback`（v3 那条跑通的接法），被厂商 4xx 拒掉时整轮换过去                                                                                                    |
| `tools.ts`             | 五个工具（find / look / edit / ask / generate）的入参与宽进解析；只有 OpenAI 官方 strict 用「每格必填」形状，别家给自然形状                                                                 |
| `bench.ts`             | 新工具 → v3 执行函数的入参（台上每一格怎么改是「线上协议」，借 v3 已磨过的；第 8 步把这些执行函数搬进来，⛔ 不是跟着删）                                                                    |
| `prompt.ts`            | 短系统提示（两段：不变的 + 这位创作者的）                                                                                                                                                   |
| `messages.ts`          | 图的存取（存地址、发前现下字节）、换保守接法时剥掉原接法专属的块、之前几轮的对白                                                                                                            |
| `state.ts`             | 一轮跑到一半的样子存 Redis（gzip，1 小时；没配 Redis 时进程内存）                                                                                                                           |
| `workspace.service.ts` | 工作区编号与「查 / 看」（第 3 步）：图 `图_N`（库里每人递增序号）、`角色·名/造型`、`LoRA·名`、`提示词·名`、`对话·id 前 8 位`、`设置`；只读、按 userId 收敛，设置只取渠道名（⛔ 密文、掩码） |

**接力**：面板协议不变。软线（120 秒）到了，服务端把整段消息存进 Redis，发一条 `transcript` 事件，里面只有板子那一条、只带 `turn {id, hop}`；浏览器收到 `time_budget` 就带着它接着发下一次（新内核所有台都接、不设上限）。存不下（压缩后 > 900KB）或取不回来就照常收尾 / 从这一句重新开一轮。

**编号**（第 3 步，owner 10-23）：编号只给模型用，界面换缩略图是第 9 步。板子末尾写出 `ref-N` / `result-N` 各是哪个 `图_N`；`edit add_reference` 认 `图_N`（查到 / 打开过的图记进本轮准入名单 `run.searchIndex`，旧执行器只认名单里的）。`find` 的对话覆盖所有台、每条标台与日期；隐身时对话与记忆都不翻。「套用某张图的配方」是第 4 步。

**第 4a 步**（owner 10-23：拆 4a 台 / 4b 库 / 4c 设置）：

- 接上的台：图片、LoRA、视频、角色页（`ASSISTANT_NEXT_DOMAINS`）。画布还走旧内核（落改动要「浏览器落完再接着跑」那条通道，单列一份）；配音台第 9 步。
- 每台能用哪些改法在 `bench.ts` 的 `OPS_BY_FACE`；不在单子上的改法直接退回并列出这台有的。角色页没有出图；助手自己拟的设定 / 挑的图照旧出提议卡（4b 起创作者明说要改的直接写）。
- 「只改那一处」：`edit` 模式的提示词改动随步骤带 `edits`，浏览器在台上**现在的文字**上重换一遍（`src/lib/prompt-find-replace.ts`，两边同一份），对不上才整段覆盖。
- 两道旧闸（`run.nextKernel`）：NAI 标签核对不再退回整段重写；中文 / 整句这类真写不进去的照旧报，但只要模型改那一处；视频「挂了参考图须先问分辨率」跳过。
- `add_lora`：按名字查 LoRA 库并挂上（旧执行器 `search_loras` → `mount_lora`，新内核才放行）。
- `apply_recipe`：读 `图_N` 的配方（`readPictureRecipe`），展开成本台能用的普通改动；套不上的写进结果里的 `not applied`。

**第 4b 步**（owner 10-23：明说要改的设定直接写、删除和公开不做、标签库先不接）：

- `edit` 多了一组改库的改法，**任何台上都能用**（`library.ts` 的 `LIBRARY_OPS`，`bench.ts` 先分给它）。
- 素材五种（`tag_pictures` / `favorite_pictures` / `new_folder` / `put_in_folder` / `verdict`）交给旧执行器现成的那五条；`run.nextKernel` 时任何台都放行（`NEXT_KERNEL_LIBRARY_TOOLS`）。
- 角色 / 造型 / LoRA / 提示词库走新工具 `library_write`（只由新内核发，旧 `planTool` 拒）：`services/assistant-library-write.service.ts`，每条记原值做 `inverse`（按 `kind` 区分），撤销走同一条 `asset-writes/revert`。
  - 新建角色 / 造型的撤销只在它还没被用过（没有出图、LoRA 关联）时删；LoRA 取消收藏只是移出收藏、不删行；LoRA 只认自己库里的。
  - 角色页写完刷新名册（`use-cards-operator-host` 的 `libraryChanged`）。
- 没有删除、公开的工具：提示里叫助手告诉创作者去哪里点。

**第 4c 步**（owner 10-23：浏览器里那四项偏好不做、不加「默认模型」、从来源名单拿掉一项算普通修改）：

- `edit` 再加三种改设置的改法，同样任何台都能用、带撤销，走同一条 `library_write`（`kind` = channel / assistant / source_add / source_remove）：
  - `model_channel`：渠道开关与改名。⛔ key 不读不写（查渠道的 select 从不带密文与掩码）、不删渠道。
  - `assistant_setting`：助手设置一格（`ASSISTANT_SETTINGS_WRITE_KEYS`）。读整份 → 改一格 → 走 `upsertAssistantPersona`（三档、语气、角色那几条不变量由它守）；撤销把原来整份写回。头像只在已有几种之间切。浏览器收到后重读 persona（`reloadAssistantPersonaEverywhere`），输入区模型 chip 跟上；从下一句话起生效。
  - `search_source`：搜图来源白 / 黑名单加一项（全部台）或拿掉一项；撤销删掉刚加的 / 按原样记回去。
- `look 设置` 现在列出渠道、助手设置每一格的当前值、两张来源名单。

**第 5 步**（owner 10-23）：

- 5a 按账号排队在 Worker 里（见 `backend.md`「按账号排队」）：同一账号同时几张见 `IMAGE_ACCOUNT_CONCURRENCY`，429 退回去等。
- 5b 面板开关改名「交给 AI 出图」。开着时浏览器替创作者按出图卡（一句话最多 4 张，超了照旧摆卡），关着时创作者自己按；台面末尾多一行 `LET AI GENERATE: on` 告诉模型。
  - 不管开不开，图落地后 ⛔ 不自动看图，钉一张「按这个方向继续吗？」（继续 / 换个方向，`use-assistant-operator` 的 `then: 'ask'`）。点了或直接打字，助手才看 `result-N`、接着改。
  - 「先问我」（`planMode`）新内核本来就不读，不管出图。

**过程记录**：照写 `AssistantTurnRecord`，`promptVersion = next-YYYY-MM-DD`；本轮记录投成 v3 形状（自带联网记成 `search_web`、`find` 记成 `search_library`），评测工具照用。

## 3. 没验证的（2026-10-23）

- DeepSeek Anthropic 兼容入口跑主循环、Grok Responses、Claude adaptive 思考、OpenAI `store:false` 下联网结果的回传，都只在单测里用假模型跑过；被拒会自动退回 v3 接法，但要用真 key 跑一次评测才算数。
- 评测（`ASSISTANT_EVAL_KERNEL=next`，2026-10-23 新 72% / 旧 69%）用的是假库：`find` / 按编号打开在评测里查不到东西，第 3 步的效果要在 owner 账号上实跑验证。

## Source of Truth

- `src/features/assistant/`（全部）· 路由开关 `src/app/api/studio/assistant-operator/route.ts` · 浏览器开关与接力 `src/hooks/use-assistant-operator.ts`（`readsNextKernel`）
- 接口与搜索调研：项目文件 `assistant-reliability/model-interfaces.md`

## Last Verified

- 2026-10-23 · 第 4c 步：`tsc` 0 error、相关定向 vitest 6096 条全绿（含改设置做 → 撤 → 回原状、查渠道不取密文）。未跑评测（等全部改完再统一跑）。

- 2026-10-23 · 第 4b 步：`tsc` 0 error、相关定向 vitest 4951 条全绿（含改库做 → 撤 → 回原状）。未跑评测（owner 10-23：等全部改完再统一跑）。

- 2026-10-23 · 第 4a 步：`tsc` 0 error、`src/features/assistant` + v3 内核 + operator 服务 / hook 定向全绿。

- 2026-10-23 · 第 3 步：`tsc` 0 error、eslint 0 problem、`src/features/assistant` 43 条全绿。

- 2026-10-22 · 第 2 步骨架：`tsc` 0 error、改动文件 eslint 0 problem、定向 vitest（`src/features/assistant` 21 条 + 路由 / hook / 过程记录，相关共 194 条全绿）。⚠ 没对真模型跑过。
