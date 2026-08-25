接入新模型：$ARGUMENTS

> **工作流与开工硬门在 [`docs/scenes/new-model.md`](../../docs/scenes/new-model.md)**（专属 5 问、联网核验义务、禁改范围、验证命令）。本文件只管一件事：**落点清单**——一个模型到底要落哪些文件。两边不重复，冲突时以 scene 为准。
>
> 开工前先读：`docs/references/model-catalog.md`（现役表与退役策略）· `docs/references/providers.md`（接入契约 + §新模型接入的默认路由策略）· `docs/references/model-pricing.md`。

## 1 · 目录（所有模态共用）

- **`src/constants/models/enum.ts`** — 往 `AI_MODELS` 加 id。
- **`src/constants/models/{image,video,audio,model-3d}.ts`** — 加一条 `ModelOption`（形状见 `models/types.ts`）。
  - ⛔ **别往 `src/constants/models.ts` 里加条目**——那个文件的 `MODEL_OPTIONS` 只是把四个目录文件 spread 进来的 barrel。
  - `available: false` 的条目必须同时进 `RETIRED_MODEL_IDS` / `RESERVED_MODEL_IDS` 或被 feature flag 挡住，否则 `models.test.ts` 的「keeps every unavailable catalog model retired, reserved, or feature-flag-gated」直接打回。
  - **退役 ≠ 删除**：翻 `available: false`，enum 条目绝不动（旧数据还要靠它解析出 label）。
  - `cost` 是**平台额度单位，不是 provider 计费真值**；定多少问 owner。`freeTier` 同理。
- **`src/constants/models.ts` 的四张映射表**（漏了不报错，只是 UI 少一块）：
  | 表 | 作用 |
  | --- | --- |
  | `MODEL_MESSAGE_KEYS` | 模型 id → i18n key |
  | `MODEL_FAMILIES` | 模型选择器**第一层**：品牌 |
  | `MODEL_VARIANTS` | 模型选择器**第二层**：型号（同型号跨渠道归一）|
  | `VIDEO_MODEL_PRIORITY` | 视频模型排序，仅视频 |

## 2 · i18n ×3

`src/messages/{en,ja,zh}.json` 的 `Models.<messageKey>.{label,description}`，三语必须同步。

⛔ **禁止用正则批量改 messages JSON**——跨 256KB 的 `.*?` 会静默删掉别处的键，而且全量闸门照过。逐键改。`src/i18n/completeness.test.ts` 抓漏译。

## 3 · 单价（`src/constants/models/unit-prices.ts`）

模型选择器**第三层「渠道比价」**的数据源，也是首页价格的唯一来源。**是给用户看的参考价，不是计费依据。**

口径钉死（混档会让比价失去意义，文件头有完整说明）：视频 = 720p / 每秒 / 含音频 / 无视频输入；图片 = 单张 / 1:1 / **按 adapter 实际发出去的尺寸取档**（不是 1024² 一刀切）；一律 USD，汇率统一 7.1。

⚠ **宁可留空也不填猜的数**——一个错的数比没有数更糟，下游 `StudioCostPreview` 靠「缺价」降级成「约 $X 起」。

## 4 · 按模态补能力表

| 模态 | 文件                          | 内容                                                                                                                        |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 视频 | `video-model-capabilities.ts` | `supportedDurations` / `supportedResolutions` / `supportedAspectRatios` / `audio` / seed 矩阵                               |
| 视频 | `video-model-send-plan.ts`    | `family` 联合类型要加值 · `slots`（图/视频/音频/total）· `keyframeSlots` · `positionalImageTokens` · `imageAspectRatioLock` |
| 图片 | `provider-capabilities.ts`    | `maxReferenceImages` / `capabilities` / `resolutionOptions`                                                                 |
| 图片 | `model-strengths.ts`          | 助手写提示词时用的模型特长                                                                                                  |
| 3D   | `model-3d-generation.ts`      | tier / 预估耗时                                                                                                             |
| 音频 | `ModelOption.audioKind`       | 省略 = speech                                                                                                               |

⚠ `keyframeSlots` 的判据是「**我们的 worker 发得出来吗**」，不是「上游支不支持」。声明得比实现宽，用户填了尾帧会被静默丢掉。

## 5 · 执行链 —— ⚠ 生产在 worker，不在 `src/services/providers`

**视频/图片的生产请求构造住在 `workers/execution/src/models/<provider>/` 下。** 而 `src/services/providers/` 下的同名 builder 是**已漂移的死 fork**，不再被生产调用（出处见 `src/test/worker-contracts/` 各文件头）。

⛔ 改错边的表现是：**全量测试绿，线上毫无变化**。死 fork 自带绿测试。

- 加 builder 分支 + 对应的 id 常量表（如 `FAL_VIDEO_MODEL_IDS`）+ `buildBody` 的 switch 分支。
- 契约测试写在 `src/test/worker-contracts/`（worker 自己的 vitest 不解析 `@/` 别名，测不了依赖 `MODEL_OPTIONS` 的用例）。
- **视频**：adapterType 必须在 `generate-video.service.ts` 的 `WORKER_CAPABLE_VIDEO_ADAPTERS` 里，否则请求走到 501。加进去只是一半——worker 那侧的 `submitProviderQueue` / `pollProviderQueue` 没有对应分支的话，会在 workflow 里 500 而不是快速失败。
- **新 provider 才写新 adapter**：`AI_ADAPTER_TYPES`（`constants/providers.ts`）→ adapter 文件 → `services/providers/registry.ts` → `constants/api-keys.ts` → 平台 key 走 `src/lib/platform-keys.ts` 的 `getSystemApiKey` 映射。已有 adapter 的新模型只加配置。

## 6 · 容易漏的三处

- **`src/constants/workflows.ts`** 的 `recommendedModelIds`——`models.test.ts` 会断言被推荐的模型必须 `available`。
- **`src/constants/home-v3.ts`** 的品牌图标映射。
- **`timeoutMs`**：抬它之前先看第二道闸——`EXECUTION_WORKER.DEFAULT_MAX_ATTEMPTS × DEFAULT_POLL_INTERVAL_MS`（`constants/execution.ts`）才是轮询的真上限，只抬 `timeoutMs` 可能白改。

## 7 · 文档收尾

- `docs/references/model-catalog.md` 现役表 · `docs/references/model-pricing.md` 价格表。
- `npm run models:check-docs` 本地跑一次，确认 `officialUrl` 可达（snapshot 由 catalog 里的 `officialUrl` 自动派生）。要更新基线用 `npm run models:update-doc-snapshot`。

## 8 · 验证

⛔ **不要 `npx next build`**——dev server 跑着的时候并行 build 会污染 `.next`，症状是带登录态的页面开始 404。dev 在跑就别 build。

1. 全量 tsc + 全量 vitest（用 `full-gate` skill 的正确跑法，串行）。改模型会波及 prompt / adapter / route 的跨文件测试，**定向子集必漏**。
2. `i18n-check`。
3. **端到端实测**：dev 环境用**一次性 dev key** 真生成一次（⛔ 严禁生产 key）。这一步不能用「测试绿了」替代——死 fork、可选 prop 漏传、能力表声明得比实现宽，三种翻车都是三绿而功能全失效。
