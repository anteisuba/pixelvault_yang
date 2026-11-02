# 平台点数（`p-platform-credits`）设计稿

> 状态：**owner 已定稿**（2026-11-01，四问全答），按 §3 切片施工。
> 已定（owner）：Modal 是 owner 的云端、所有用户都能跑、免费；朋友试用先给额度玩；所有调用折成点数、每人有额度、用量看得见；助手「花钱明显多先问」读这套点数。
> §4 四问 owner 11-01 已答，稿内「提议」均按答复落定。

---

## 0. 一句话

一个单位（点）、一本账（每次调用一行）、两种钱：**平台出的钱**有余额、会扣光；**你自己 key 的钱**只记不拦。助手、画布、出门、用量页都读同一个估价函数。

---

## 1. 现状（读码，2026-11-01）

| 东西         | 现在怎样                                                                                                                                                      | 出处                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 谁出钱       | **2026-10-07 起 BYOK**：图 / 视频 / 声音 / LLM 一律用户自己的 key，没有平台兜底；NAI 永远 BYOK                                                                | `generate-image.service.ts` `resolveGenerationRoute`；`constants/assistant-persona.ts` |
| 平台真掏钱的 | ① **Modal Runner**（ComfyUI 出图，唯一没有 BYOK 的路）② 联网搜（Serper / Jina）③ Fish 声音库浏览 ④ 向量（Cloudflare）⑤ 视频渲染容器                           | `lib/platform-keys.ts`、`workers/runner-modal`                                         |
| Modal 怎么拦 | 只数**次数**：每人每月 100 次、全站 600 次（≈ Starter 每月 $30 免费额度），admin 不拦                                                                         | `RUNNER_MONTHLY_LIMIT`（`constants/config.ts`）                                        |
| 账本         | `ApiUsageLedger` 一次生成一行，只有次数 / 张数 / 尺寸 / 时长，**没有钱、没有点、没有 token**                                                                  | `usage.service.ts`                                                                     |
| LLM 用量     | provider 报的 token 只进日志（`onUsage`），**不入账**                                                                                                         | `llm-text.service.ts`、`features/assistant/kernel.ts`                                  |
| 单价         | `unit-prices.ts` 有图 / 视频 / 声音的参考价（USD），文件头写明「不是计费依据」；**没有 LLM token 单价表**；`AI_MODELS[].cost`（如 3）是旧的请求基数，和钱无关 | `constants/models/unit-prices.ts`                                                      |
| 用量页       | `/settings/usage`：本月按模型的次数 × 单价 = 估算 $，加 Runner 次数；⛔ 不设预算                                                                              | `SettingsUsageSection.tsx`                                                             |
| 角色出门     | 自己一套「点」：**1 点 ≈ 1 万 token，跟模型无关**，调之前按上限估、超了收工                                                                                   | `CharacterOuting.budgetPoints/usedTokens`，`pages/cards.md` §2.2                       |
| 助手钱闸     | 按张数拦（4 张），不按钱；画布开自动没上限。自主度稿提议改成按 $ 门槛                                                                                         | `docs/design/assistant-autonomy.md`                                                    |
| 搜索配额     | `ResearchRun` 按条数每日数                                                                                                                                    | `prisma/schema.prisma` ResearchRun                                                     |

### 我发现的问题（你可能没注意到）

1. **朋友没有 key 时，现在只能用 Modal 出图**。助手（LLM）、视频、声音全要自己的 key。也就是说「送额度让朋友玩」如果只送 Modal，朋友连助手都开不了——而助手是产品的核。
2. **出门的「点」和要做的「点」不是一个东西**。1 万 token 在 DeepSeek 不到 1 美分，在贵的模型上要十几美分。两种点并存，用户会被搞糊涂，助手也没法拿来比。
3. **Modal 按次数拦，不按 GPU 秒**。一张 SDXL 和一张 Qwen-Image 大图、一次冷启动，成本能差几倍，但都算「1 次」。
4. **LLM 是最大的盲区**：助手一轮可能几万 token，现在完全没记账，用量页看不到。
5. 三处价钱口径各写各的（用量页、工作台 `StudioCostPreview`、画布 `canvas-generation-cost.ts`），自主度那边要再加一处。应该收成一个估价函数。

---

## 2. 设计

### 2.1 单位：1 点 = 1 美分（提议）

- **点 = 钱**，不是 token、不是次数。1 点 = $0.01，向上取整到 0.1 点存。
- 理由：所有东西（token、张、秒、GPU 秒）都已经能折成 USD；用钱做底，以后加任何新模型只补单价，不用改「点」的定义。$1 = 100 点，人脑好算。
- 出门改成同一种点（提议）：现在的「10 / 30 / 60 点」按新口径重标，下面「约 N 篇文章」照旧按模型单价现算。

### 2.2 两种钱，一本账

|          | 平台出钱（funding = platform）                                | 你自己的 key（funding = byok）       |
| -------- | ------------------------------------------------------------- | ------------------------------------ |
| 包括     | Modal GPU、联网搜、声音库、（Q1 定了的话）朋友用 owner 的 key | 你绑了 key 的所有调用                |
| 余额     | **有**，扣到 0 就停                                           | 没有，只记                           |
| 用量页   | 「剩 N 点 · 本月用了 M 点」                                   | 「你自己的 key 本月约 M 点（≈ $X）」 |
| 助手门槛 | 读                                                            | 读（花的是你的钱，照样该问）         |

### 2.3 账本：扩 `ApiUsageLedger`，不新开一张

一处事实，不开第二个家。加这几列：

- `kind`：`llm` · `image` · `video` · `audio` · `3d` · `gpu` · `search`
- `funding`：`platform` · `byok`
- `points`（Decimal，实扣）· `estimatedPoints`（调之前估的）
- `inputTokens` · `outputTokens` · `gpuSeconds` · `mediaSeconds`（按 kind 填）
- ~~`surface`~~：第 1 片没加——眼下没有读它的地方，等用量页要按「哪里花的」分时再加（不预埋）。

LLM 每一轮写一行（现在只进日志的那个 `onUsage` 改成也入账）。`FreeTierSlot` 已经没人用，一并删。

### 2.4 额度：`CreditGrant` 一张新表

- 一行 = 一次送点：`userId · points · reason（signup / invite / owner-gift / monthly）· expiresAt?`。
- 余额 = 送的总数 − 平台出钱的实扣总数。不单独存余额字段，避免对不上。
- 送法（提议，Q4 定）：
  - **新用户注册送一笔\*\***100 点\*\*（≈ $1，owner 11-01 定）。
  - **owner 手动送**：设置页里 admin 才看得到的一个小框「给 xxx 加 N 点」。
  - 邀请码以后再说。
- **全站总闸保留**：Modal 每月全站花费上限（按 $ 算，默认 $30）。这是保护 owner 的钱，跟个人余额是两道闸。

### 2.5 扣法：先占后结

把出门已经在用的 `OutingMeter` 那套推广成全站一个 `meter`：

1. **调之前**按上限估（图按张、视频按秒 × 档位、LLM 按「输入字数 + 最大输出」、Modal 按该工作流的典型 GPU 秒）。
2. 平台钱：余额 < 估价 → 不调，直接告诉你「点数不够，还剩 N 点」。够 → **先占住**这么多。
3. **调完**按 provider / Modal 报回来的实数结算，多占的退回；失败全退。
4. BYOK：不占，只在结算时记一行。

### 2.6 价钱从哪来

- 图 / 视频 / 声音：现有 `unit-prices.ts`。文件头那句「不是计费依据」要改成「平台钱按它扣，BYOK 按它估」。
- **LLM：新加一张 token 单价表**（每个助手路由模型的输入 / 缓存 / 输出 $/M），同样带 `source` 和 `verifiedAt`。
- **Modal：按 GPU 秒**。L40S $0.000542/s；Modal 的 `app.py` 量一下从接单到交图的秒数回报给 Worker，冷启动按实际算进去。
- **估不出价的**：平台钱 = 不让跑（先补价格）；BYOK = 照跑，但助手当作「超门槛」先问一次（跟自主度稿一致）。

### 2.7 一个估价函数，所有地方读

`estimatePoints(action) → { points, confidence: exact | range | unknown }`，放 `src/lib/credits/`：

- 工作台 `StudioCostPreview`、画布 `canvas-generation-cost.ts`、用量页、助手钱闸、出门，全部改读它。
- 显示：工作台按钮旁「约 12 点」（悬停看 $）；用量页点和 $ 都给。

### 2.8 跟助手自主度接上

- 自主度稿的「门槛 $1」改成 **100 点**（同一个数，换个单位）。存在 `assistant_setting`，你一句话就能改。
- 助手问的时候说点数：「这批 12 张约 340 点，超过你定的 100 点，出吗？」
- 平台余额不够时助手不硬试，直接说「还剩 N 点，这批要 M 点」。

### 2.9 用户看到什么

- **设置 · 用量**：顶上一行「剩 N 点」（只有拿过平台额度的人才显示），下面本月按类别（对话 / 图 / 视频 / 声音 / GPU）的点数，展开到模型。BYOK 的单独一栏。
- **出图按钮旁**：「约 N 点」。
- **点数用完**：错误文案「点数用完了，找 owner 加一点，或绑自己的 key」，带去绑 key 的 `QuickSetupDialog`（按 Hard Rule 8，不跳页）。

---

## 3. 施工切片（看稿后按这个顺序做，每片能单独上线）

1. **账本 + LLM 入账**：`ApiUsageLedger` 加列；LLM 每轮入账；Modal 回报 GPU 秒；只记不拦。（先把数看清楚，后面才定得准额度。）
   - ✅ 2026-11-01 已做：迁移 `20261101230000_platform_credits_ledger`（账本加 `kind / funding / points / *Tokens / gpuSeconds`，`GenerationJob.funding`）。LLM：`resolveLlmTextRoute` 给路由带上 `meter`，`llmTextCompletion / llmTextStream / llmNativeWebSearch` 每次调用记一行（`services/llm-usage.service.ts`，⛔ 不等不抛），助手主循环（`features/assistant/kernel.ts`）另记；角色出门不再记总数，改由每次调用各记一行。生成：建任务时记出资方，回调结算时抄进账本；Runner 记 `kind = gpu`，`gpuSeconds` = 建任务到回调的秒数（Modal 不回报计费秒数，这是上限估计，冷启动算在内）。`points` 先空着，第 2 片填。
2. **估价函数 + LLM 单价表**：`estimatePoints`；工作台 / 画布 / 用量页改读它。
   - ✅ 2026-11-01 前半已做：LLM 单价表 `constants/models/llm-prices.ts`（助手路由表 15 个型号全覆盖，有测试锁；DeepSeek 按高峰价；推出价按日期分段）；`lib/credits/points.ts`（`usdToPoints` · `pointsOfLlmUsage`）；LLM 每行入账时现算 `points`（Gemini 思考加回输出），Runner 按 L40S $0.000542/s × 占卡秒数；用量页按账本点数优先、没结算的照旧次数 × 单价。
   - 后半等「助手自主度」的钱闸上 main 再做：它已把工作台估价抽成 `lib/generation-cost.ts`、闸在 `lib/assistant-spend-gate.ts`，届时连同 `lib/canvas-generation-cost.ts` 并进 `lib/credits/estimatePoints`，替换宿主 `generationPoints()` 与 `generationPointsOf`。
3. **额度 + 先占后结**：`CreditGrant`、注册送点、admin 加点；Modal 从「每人 100 次」换成点数；全站 $ 总闸。
   - ✅ 2026-11-02 已做：迁移 `20261102020000_credit_grants`；`services/credits.service.ts`（余额 = 送的 − 账本平台行 `points`，不另存；注册礼读余额时按 `dedupeKey = signup:<userId>` 补，存量用户也有；admin 不拦但照记）。Runner 个人闸换点数：余额 − 在跑任务 × 10 ≥ 10 才放行，锁内复查；全站月 600 次闸先保留（$ 总闸等跑出真实数再定）。助手「自动」一把 key 都没有、平台配了 `DEEPSEEK_API_KEY`、还有点数 → 走平台 DeepSeek Flash（占位 key id `platform:deepseek`），按 token 扣点；点数花光照旧就地弹配 key。设置页用量节显示余额，admin 多一个「加点」表单（邮箱或用户名，`POST /api/admin/credits`）。LoRA 台改读点数。
4. **助手钱闸接点数**（跟自主度一起做）。
5. **出门换成新点**。
   - ✅ 2026-11-02 已做：`OutingMeter` 改记点数（按所选型号单价，输入 / 缓存 / 输出分开算），写日记那一份也按型号折；`CharacterOuting.usedPoints` 新列（迁移 `20261102030000_outing_used_points`，旧行按 `usedTokens / 1 万` 显示）；弹框「约 N 篇」按型号算。档位仍是 10 / 30 / 60 点，意思变成 $0.1 / $0.3 / $0.6 —— DeepSeek 一趟能逛得比以前长，Claude Opus 会短很多。

---

## 4. owner 定（2026-11-01）

1. 朋友赠送的点数**能用便宜 LLM（DeepSeek）走 owner 的 key**、从点数扣；视频等贵的仍要自己的 key。
2. **1 点 = 1 美分**；角色出门的「1 点 ≈ 1 万 token」一起改成这套。
3. 自己 key 的花费**也折点数显示，只看不拦**。
4. 新用户默认送 **100 点**。
5. 助手自主度的花钱门槛先定 $1 = **100 点**。
