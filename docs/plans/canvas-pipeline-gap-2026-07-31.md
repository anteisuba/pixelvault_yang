# 画布管道缺口清单 —— 2026-07-31 真机实测

> **权力级别**：active plan · **本文取代 `canvas-assistant-pipeline-2026-07-26.md` §0 的断层表**，作为包 3 起所有排期的现状依据。
> **来源**：[`research-landing-plan-2026-07-30.md`](research-landing-plan-2026-07-30.md) §6【包 2 · 现状实测校准】。
> **方法**：`localhost:3000` 真机 + claude-in-chrome，程序化读值（DOM / 请求体 / 状态接口）+ 截图，**未修改任何 `src/` 代码**。
> **测试项目**：`包2-实测校准-0731（claude，可删）`（新建一次性项目，不碰既有图）。

---

## 0 · 一句话结论

**「聊 → 大纲 → 镜头 → 投影」这条链在今天是通的**（前门、两阶段、两道门、幂等投影全部成立），
断在**三处**：①剧本**改不动**（首稿之后所有修订请求必 500）②**镜头阶段没有出图落点**（投影不造静帧）③**助手拿到的不是名字**。

---

## 1 · 六条实测（包 2 的交付判据）

| #   | 实测动作                          | 今天的现状                                                                                                                                                        | 缺口                                                                 |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ①   | 大纲阶段能否产出 ScriptDoc        | ✅ **能**。空画布前门即「跟助手聊大纲」→ 助手 dock **默认两栏展开**（左对话 / 右 ScriptDoc 工作区），顶部已是「1 大纲 › 2 镜头 › 3 节点」+ 精简/标准/完整三档深度 | 无。⚠ 前置：**必须先在对话里说过话**，否则 toast `scriptDocNeedChat` |
| ②   | 能否切镜头阶段并补 camera/emotion | ⚠ **一半**。切阶段 ✅（「确认大纲」是纯前端 `setScriptDocStage`，不调 LLM）；**手动补 ✅**；**AI「拆镜头」❌ 500**                                                | **P0-1**                                                             |
| ③   | 投影后画布真实出现哪几类节点      | ✅ 0 → **12**：`image(role=character)`×2 · `shotText`×3 · `seedance`×3 · `voice`×3 · `videoMerge`×1。**幂等成立**（重投 12→12）                                   | **无 `role=shot` / `role=background`** → 包 3 的正当性               |
| ④   | 镜头阶段有没有任何地方能出图      | ❌ **没有**。`shotText` 的产出是文字（卡面写「把场景、动作、镜头和构图整理成可执行镜头文本。」）；唯一能出图的是 2 个角色图节点                                   | **每镜静帧无承接节点** → 包 3 的硬前提                               |
| ⑤   | 助手回复里节点名是否用户命名      | ❌ **不是**，且症状已变（见 P0-2）                                                                                                                                | **P0-2** → 阻塞包 5                                                  |
| ⑥   | 自由对话是否仍只出散文            | ✅ **是**。助手回 Markdown 散文，右栏仍显示「还没有大纲」                                                                                                         | 与 07-26 一致，未变                                                  |

### 1.1 · 与 07-26 断层表的差异（**排期只认本表**）

| 07-26 的说法                      | 2026-07-31 真机                                                            |
| --------------------------------- | -------------------------------------------------------------------------- |
| ③ 剧本没落成结构化数据            | **大幅收窄**：结构化路径完整可用；缺的只是「自由对话那条路不落 ScriptDoc」 |
| ③ 投影只投 `role=character`       | ✅ **仍然准确**，逐字成立                                                  |
| ② 助手拿不到名字，回复出现 `****` | **换症状不换病**：`****` 没了，但拿到的是**类型标签**（见 P0-2）           |
| ① 助手不能建节点/连线             | 未在本包验证（属包 5 范围）                                                |

---

## 2 · P0-1 · 剧本修订路径全断（`prompt-guard` 4000 字符硬顶）

**症状**：镜头阶段点「拆镜头」→ `POST /api/studio/node-script-doc` **500**，UI 无可见反馈。

**根因**（dev server 日志，owner 提供）：

```
Prompt rejected by guard: Prompt exceeds maximum length of 4000 characters (got 4018)
  at guardUserPrompt → llmTextCompletion → createNodeScriptDoc
```

`buildUserPrompt` 的固定开销 ≈ `SCRIPT_DOC_OUTPUT_CONTRACT`(~1.6k) + 深度指令 + 限制行 + 语言行 + 结尾，
再拼上**已有 ScriptDoc 的 JSON**（本例 1169 B）和**对话全文**（本例 735 字）就必然越界。

**实测证据（每组稳定复现）**：

| payload                            | 结果                    |
| ---------------------------------- | ----------------------- |
| 完整 doc + 原对话                  | **500 · ~700ms**（3/3） |
| 完整 doc + 一句短对话（9 字）      | 200 · ~3.6s             |
| 去掉 doc（首稿路径）               | 200 · ~4s               |
| doc 去掉 styleNote/background/时长 | 200 · ~4.9s             |

> ⚠ 关键：**越界只差 18 个字符**（4018 / 4038 / 4058）。所以表现为「有时行有时不行」，极易被误判成模型抖动。

**影响面比「拆镜头」大**——凡是携带已有 ScriptDoc 的请求走同一条路：

- 「拆镜头」（镜头阶段）
- 「按对话更新大纲」（大纲阶段二次起草）
- **✨ 定向编辑**（角色模块 / 单镜模块）

即 **首稿能出，之后一个字都改不动**。

**附带伤（两处）**：

1. 错误被吞成泛化 `INTERNAL_ERROR / errors.common.unexpected`，前端拿不到「太长了」这个可行动信息。
2. **错误框在浅色画布上读不出来**：`text-red-100`（lab L≈92.2）配 `bg-red-500/10`，是暗色画布时代遗留的类名。落点 `ScriptDocWorkspace.tsx` 错误块。

**不在本包修**（包 2 禁改码）。修的时候要一起决定：截断策略（截对话？截 doc？）还是抬阈值——**别只抬阈值**，剧本会一直长。

---

## 3 · P0-2 · 助手拿到的 `title` 是类型标签，不是名字

**实测**：把一个 `shotText` 节点改名为「雨夜开场镜」，再问助手「把每个节点的名字原样列出来」。
助手列出的是 `图片 / 图片 / 镜头文本 / 视频生成 / 音色 …` —— **既没有「小林」「常客」，也没有「雨夜开场镜」**。

**请求体实录**（`/api/studio/node-assistant`）：

```json
{
  "id": "node-5a2662ee-…",
  "title": "图片",
  "type": "image",
  "summary": "小林：疲惫的仿生人便利店店员…",
  "status": "running"
}
```

**诊断比 07-26 更准**：

- `node-assistant-request.ts:38` 的 `node.title.trim() || node.type` 兜底**永远不触发**——`title` 不为空。
- 但填进去的是**本地化类型标签**。画布上显示的名字（角色名 / 用户改名）与 `node.title` 是**两个不同的东西**。
- `summary` 反而是有效信息（角色描述 / 图片 prompt 都在）。

**影响**：`@` 按名字引用不可能成立 → **阻塞包 5**（助手写画布工具）。修复要动的是「显示名的真正来源如何进入 assistant payload」，不是再加一层兜底。

---

## 4 · 其它确认（含正面结论）

| 项                       | 结论                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **投影幂等**             | ✅ 成立。重投节点数不变，toast「画布已与大纲一致，没有新节点要生成。」——包 3 的红线**已经被满足**，不需要重造机制                                         |
| **生成中无取消**         | ✅ 确认（plan 已知）。视频节点进入「正在生成视频…」后无取消入口                                                                                           |
| **sweeper 兜底**         | ✅ 有效。悬挂 job 最终被判 `FAILED · callback_timeout`（"Reaped by execution sweeper"）                                                                   |
| **图片节点生成中无反馈** | ⬜ **待复验**。同一时刻 seedance 节点显示「正在生成视频…」，图片节点只显示「选一张代表图」空态。观察时 tab 在后台（计时器被节流），**需前台复验后再定性** |
| **大纲阶段字段分布**     | `emotion` 在大纲阶段就填，`camera` 不填（靠镜头阶段或手动 ＋ 补）——与代码一致，非缺陷                                                                     |

---

## 5 · ✅ 已解决：本地 dev 跑不出任何生成结果

> **结论（2026-07-31 收口）**：根因 = `.env.local` 的 `NEXT_PUBLIC_APP_URL` 写成 **`https://localhost:3000`**（owner 之前把域名从生产改成 localhost 时，**协议留在了 `https`**）。
> Next dev 是明文 HTTP，worker 用 `https://` 回连时 workerd 的 TLS 握手失败，且**不抛可捕获异常，而是报 `internal error; reference = …`**——这正是日志里那串不透明错误。
> 已改成 `http://localhost:3000`，**图片与视频均实测走到 `COMPLETED` 且节点卡面出图/出片**。详见 §5.2。

**这不是产品缺陷，是本地开发环路的债**。它曾阻塞包 3 / 包 4 的验收（那两包都要「先有图可审」），现已解除。

排查已走到的位置：

| 环节                                  | 状态                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL` 指向生产        | ⚠️ **改了一半 —— 这就是根因**。域名改成了 localhost，但协议仍是 `https://`。它决定派发载荷里的 **`resolveKeyUrl` / `callbackUrl`**（worker 取 key + 回调的地址）     |
| worker 的 `INTERNAL_CALLBACK_URL`     | ✅ 本来就对——来自 `workers/execution/.dev.vars` 的 `http://localhost:3000/...`，**不受 Next 侧变量影响**（`readRequiredCallbackEnv` 读 worker 自己的 env，不读载荷） |
| 8787 端口僵死的 `workerd.exe`         | ✅ 已清理并重启（新 worker 12ms 响应）。僵死期间表现为 `POST /api/studio/generate` **502 · 「AI 服务响应超时」**                                                     |
| **worker 内部 Workflow 抛不透明错误** | ❌ **未解**。见下                                                                                                                                                    |

worker 日志（owner 提供）：

```
[wrangler:info] POST /workflows/image-queue 200 OK (41ms)
✘ [ERROR] Uncaught Error: internal error; reference = …   ×19
[wrangler:info] POST /workflows/fal-queue   200 OK (38ms)
✘ [ERROR] Uncaught Error: internal error; reference = …   ×19
```

Next → worker 这一跳正常（200）；炸在 Workflow 实例内部，workerd 只给 reference 不给堆栈，重试约 19 次耗尽后**不回调**，job 永远 `IN_PROGRESS` 直到 sweeper 判死。

### 5.2 · 定位过程与根因（2026-07-31）

**被排除的怀疑面**（都做过对照实验，别再重走）：

| 怀疑                                     | 实测结论                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| R2 `remote: true` × Workflows local 混合 | ❌ 不是。在 Workflow step 内真实 `GENERATION_BUCKET.put()` **成功**（`typeof .put` 不算数，必须真写） |
| 陈旧 wrangler 进程争抢 `.wrangler/state` | ❌ 不是。用 `--persist-to` 指向同一 state 目录跑探针，照样 `PROBE_OK`                                 |
| workerd 连不上 `localhost`               | ❌ 不是。`http://localhost:3000` 从 step 内可达（返回 405/403）                                       |
| worker 代码 / `.dev.vars` / 端口         | ❌ 不是。worker src 与 main 逐字节相同；`.dev.vars` 三个变量均正确加载                                |

**决定性 A/B**——同一个 Workflow step、同一台 Next dev，只换协议：

| 探针 URL                                | 结果                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| `http://localhost:3000/api/internal/…`  | **405** —— 可达，Next 正常应答                           |
| `https://localhost:3000/api/internal/…` | **`Error: internal error; reference = ovdgvuglrr5ut4…`** |

与 owner 日志里的错误签名完全一致 → **根因锁定**。

**为什么完全静默**：`resolve-api-key` 失败后，workflow 的兜底 `catch` 会走 `step.do('callback-failure')` 发失败回调——但那个回调发往**同一个坏掉的 `callbackUrl`**，于是兜底自己也炸。失败态因此永远送不回 Next，job 只能挂到 sweeper 判 `callback_timeout`。

### 5.3 · 修复

1. **配置**：`.env.local` → `NEXT_PUBLIC_APP_URL="http://localhost:3000"`（原为 `https://`）。
2. **代码（防复发）**：`buildInternalUrl()` 增加 `assertReachableInternalUrl()`——**`https://` + loopback 主机直接在派发前抛错并点名 `NEXT_PUBLIC_APP_URL`**，把「静默挂 N 分钟再被 sweeper 判死」变成即时的自解释报错。真实域名不受影响，生产（`https://www.anteisuba.com`）零行为变化。
   - `src/services/execution-worker.service.ts` · `src/constants/execution.ts`（新增 `LOOPBACK_HOSTNAMES`，并复用到既有的 `shouldUseInlineExecutionFallback`）
   - 测试：`execution-worker.service.test.ts` +3 例（拒 https loopback / 放行 http loopback / 放行生产域名）

⚠️ **worker 侧未改任何代码**——排查用的探针路由与日志已全部移除，`workers/execution/src/index.ts` 与 main 逐字节一致。

### 5.4 · 验收实测（2026-07-31 · 项目 `worker-fix-verify-0731`）

| 项                                     | 结果                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 图片 · fal FLUX LoRA                   | ✅ `COMPLETED` · 节点卡面出图 · `cdn.anteisuba.com/…/image/…png` HTTP 200 · DOM `naturalWidth` 1024                                                            |
| 视频 · Seedance 2.0 Fast **480p / 5s** | ✅ `COMPLETED` · 节点卡面出播放器 · `…/video/….mp4` HTTP 206 `video/mp4`                                                                                       |
| 图片 · **OpenAI GPT Image 2**          | ⚠️ 管线通了，但 **OpenAI 侧 401 `Incorrect API key`** → 属凭证问题，不是 worker 问题。UI **秒级**报「你的 API Key 无效或已过期」——这本身就证明失败回调链路已通 |

👉 **OpenAI GPT Image 2 要出图，需 owner 换一把有效的 OpenAI key**（模型选择器里该 key 显示「未验证」）。

### 5.5 · 由此产生的可用性缺口（产品侧，值得单独修 —— **仍未修**）

worker 不回调时，用户看到的是**转圈到天荒地老**——没有超时提示、没有取消、要等后台 sweeper 才判死。
「生成永远不结束」比「生成失败」体感差得多。**前端应有自己的等待上限与可见的失败态**，不能把兜底全押在服务端 sweeper 上。

§5.3 的守卫只堵住了「本地 https 配错」这一种成因；**任何其它让 worker 静默的原因（provider 挂死、worker 进程被杀、网络断）依然会让前端转圈到 sweeper**。这条留给画布线，不在本次修复范围内。

---

## 6 · 对后续包的直接影响

| 包                       | 影响                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **包 3**（投影补齐静帧） | ✅ **正当性确认**（③④）。红线「投影幂等」**已经成立**，不必重造。~~⛔ 前置：先解 §5 的 worker 阻塞~~ → **§5 已解，阻塞解除，可开工** |
| **包 4**（审核态）       | 依赖包 3 先有图可审；~~同样被 §5 阻塞~~ → **§5 已解**                                                                                |
| **包 5**（助手写画布）   | **新增硬前置 = P0-2**。名字进不了 payload，`@` 引用与「按名字建/连」都立不住                                                         |
| **P0-1**                 | 不属于任何已排包，但**它让剧本改不动**——建议插在包 3 之前顺手修（改动集中在 `node-script-doc.service` 的 prompt 装配）               |

---

## Last Verified

2026-07-31 · `localhost:3000` 真机（claude-in-chrome），项目 `包2-实测校准-0731（claude，可删）`。
证据形式：程序化读值（ScriptDoc 25 字段 / DOM 节点类型统计 / assistant 请求体 / 生成状态接口 / 对照实验 12 组）+ 全流程截图。
未修改任何 `src/**`。测试期间新建 1 个一次性项目、发起 2 次图片生成与 2 次视频生成（均因 §5 未产出结果）。

**§5 收口补测** · 2026-07-31 · 项目 `worker-fix-verify-0731`（claude，可删）。
证据形式：Workflow step 内协议 A/B 对照探针 + worker 日志 + 节点卡面截图 + `document.querySelector` 读 `naturalWidth`/`currentSrc` + CDN 直连 `curl`（图 200 / 视频 206）。
本次修改 `src/services/execution-worker.service.ts`、`src/constants/execution.ts`、`+test`，以及 `.env.local`（非受版本控制）。`workers/**` 未留任何改动。
