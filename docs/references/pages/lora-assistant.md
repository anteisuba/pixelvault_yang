# LoRA 页助手 · 挂载与专属提示词（lora-assistant.md）

> 状态：**现行施工基准**（2026-09-12 起）。owner 已逐条拍板，照做即可。
> **本文没有「开放问题」段落**——表里没写到的按 [AGENTS.md](../../../AGENTS.md) 工程原则自己判。
> 引擎：Operator 工具环那一份（桌面 `StudioOperatorDock`）。上层协议、五动词、帧与卡片形状全部以 [`assistant-shell-v2.md`](assistant-shell-v2.md) 为准，本文**不重抄**，只写 LoRA 域这一侧多出来的东西。
> 上游业务契约：[`../domains/lora.md`](../domains/lora.md)（§7.1.1 family 方言 = 本文 §6 的事实源）。页面结构：[`lora-generate.md`](lora-generate.md)。当前可运行功能：[`lora-workbench.md`](lora-workbench.md)（§4.3 触发词 chips = 本文 §3 的事实源）。

---

## 1. 目标与不做什么

**一句话**：LoRA 页的助手今天能挂、能改权重、能写提示词，但它**不知道自己在给哪一族底模写字**——同一套 prompt 方言打天下，换了底模照样套 `score_9`。本轮只补这一件事，外加挂载那一步把判据说清楚。

### 做（owner 2026-09-12 拍板，逐条落到章节）

| #   | 事                                                                   | 落在 |
| --- | -------------------------------------------------------------------- | ---- |
| 1   | 挂载那一步的详情行加三行：底模家族 / 兼容判定 / 默认权重             | §4   |
| 2   | 跨族挂载**助手拦下**（界面不拦），拒绝理由里给同族替代建议           | §4.2 |
| 3   | 栈总权重超阈值 → 一条提醒行，**只提醒不动手**                        | §5   |
| 4   | 快照每条挂载补 `triggerWord` 与 chip 启停；触发词**只读**            | §3   |
| 5   | 家族方言表进常量，两个消费者（系统提示 / `buildLoraPromptTemplate`） | §6   |
| 6   | `set_prompt` 在 LoRA 域多一步取材，确认卡逐段标注来源 + 负面改动段   | §7   |
| 7   | 换底模后旧提示词带错方言 → 助手在同一张确认卡里提修正                | §7.4 |

### 不做（明确排除）

- ❌ **UI 不动**。§4 的三行落在**已有**的挂载日志条详情上（`describeStepDetail`），§5 的提醒行落在**已有**的系统行卡型上，§7 的来源标注落在**已有**的覆盖三选卡上。⛔ 本轮不新增任何一种卡片、不改任何一处版式、不加 token。
- ❌ **手机端不做**。`/studio/lora` 的小屏宿主仍是旧面板（`LoraAssistantDock` → `PromptAssistantPanel`，见 `LoraWorkbench.tsx:3166`）。本文所有改动都只经过 Operator 那条路，小屏行为一个字不变。
- ❌ **不动训练流程**、不动计费、不动归档。
- ❌ **不加新工具**。LoRA 域工具表（`ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[lora]`，`constants/assistant-operator.ts:1488`）本轮**条目数不变**。特别地：⛔ 不加 `set_trigger_chips`（触发词只读，§3.3），⛔ 不加 `request_generation`（装配台仍然不出图，理由见 `use-lora-operator-host.ts:382` 的头注，一个字没变）。
- ❌ 不拆 `assistant-operator.service.ts`（同 v2 §0 的判据）。

---

## 2. 现状锚点（2026-09-12 读码核实，行号即当时位置）

| 事                    | 在哪                                                                                      | 现在是什么样                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 兼容谓词（唯一一份）  | `src/lib/lora-model-compatibility.ts:69` `isLoraBaseModelMountCompatible`                 | 按**权重架构**判：SDXL 系互通但 Illustrious ↔ Pony 互拦；`anima-dit` / `flux` 各自独立；`sd15` 永不兼容     |
| 服务端那一层包装      | `src/services/kernel/assistant-operator.service.ts:3545` `isLoraCompatibleWithBase`       | 底模未定（`baseFamily` 为 null）时返回 `true` —— 与界面上那条橙字整块不渲染一致                             |
| 挂载规划              | 同上 `:3721` `planMountLora`                                                              | 今天**不兼容不拒**：照挂 + observation 里说一句「换底模」。本轮改成 `reject`（§4.2）                        |
| 摘除 / 调权重         | 同上 `:3824` `planUnmountLora` · `:3846` `planSetLoraWeight`                              | 权重只校验 `[minWeight, maxWeight]`（0.1–2），**没有任何总量判断**                                          |
| 状态块里的 LoRA 段    | 同上 `:1254`–`:1291`                                                                      | 印底模家族 + 每条挂载的 id/名/权重/静音/不兼容告警 + 「没有上限」那一句                                     |
| LoRA 域三条硬规矩     | 同上 `:5994`                                                                              | 只有四句：LoRA 占了画面一部分 / 不推荐挂不上的 / 没有数量上限 / tag 用英文。**一句方言都没有**              |
| 文本写入              | 同上 `:2930` `planSetText`                                                                | 覆盖三选（`kind:'confirm'` → `:7530` 转成 `ask` 帧 + `overwrite` 块）。⚠ 只在用户**手写过**时才出这张卡     |
| 快照构造（宿主）      | `src/hooks/use-lora-operator-host.ts:197` `buildSnapshot`                                 | 每条挂载给 id/name/weight/enabled/family/compatible，`compatible` 与界面**同一个谓词**                      |
| 快照投影              | `src/lib/studio-operator-snapshot.ts:478` `buildLoraOperatorSnapshot`                     | 同上六格，外加 `baseFamily` / `minWeight` / `maxWeight`                                                     |
| 快照类型              | `src/types/assistant-operator.ts:422` `AssistantOperatorSnapshotLoraSchema`               | 六格。**没有 `triggerWord`、没有 chip 状态、没有任何提示词素材**                                            |
| 挂载日志条详情        | `src/lib/studio-operator-history.ts:235`                                                  | `名字 · 权重 [· family ✗]` —— 不兼容时才印家族，兼容时什么都不印                                            |
| 触发词 chips          | `src/components/business/studio/lora/LoraWorkbench.tsx:870`–`:936` + `TriggerChipRow.tsx` | chips 由挂载派生；`disabledTriggerIds` 是 `LoraWorkbench` 的局部 state；停用的不进 `triggerSelections` 编译 |
| 正文不 prefill 触发词 | `lora-workbench.md` §4.3                                                                  | 触发词是「挂载的属性」不是「用户写的词」，编译顺序 chips → tray tags → 正文                                 |
| 起手提示词模板        | `src/lib/lora-prompt-template.ts:20` `buildLoraPromptTemplate`                            | 两条写死骨架（style / 其余），**与家族无关**；唯一调用方是 `lora-source-match-prompt.ts:109`                |
| 来源配方              | `src/lib/lora-source-match-prompt.ts:60` `buildSourceMatchedLoraPrompt`                   | 作者推荐 → 挖到的来源图 prompt → 兜底骨架；`reliable=false` = 只有裸触发词；负面是**一张写死的 anime 表**   |
| 底模目录              | `src/constants/lora-base-models.ts`                                                       | 11 条 `底模×后端`，字段 family/backend/fidelity/available/…                                                 |
| 系统行（客户端卡型）  | `src/constants/studio-assistant-operator.ts:251`–`:331`                                   | 18 个码，其中 `loraMountFailed`（`:296`）就是「助手做的事在助手线程里交代」的先例                           |
| `rule_hit` 帧         | `src/constants/assistant-operator.ts:92` · `src/types/assistant-operator.ts:2939`         | 载荷是 `ruleId` + **规则原文** + `source`（`assistant` / `creator`）+ `createdAt`，绑一条真的项目规则行     |

### 两条读码得出的、直接改变实现选择的事实

1. **底模目录上没有「是不是蒸馏」这一位，本轮补上。** 11 条目录（FLUX.1-dev、Illustrious ×2、SDXL 1.0 ×2、Pony V6、SD 1.5、Anima Pencil ×2、Anima DiT ×2）里一条蒸馏底模都没有，`LoraBaseModel` 上也没有对应字段。Turbo/Lightning/Hyper 这些字样只出现在 `constants/lora.ts:443`–`:458` 的 **Civitai 浏览分桶**里（那是「LoRA 的 baseModel 值」，不是「我们出图用的底模」）。→ §5.1 加**必填**的 `distilled: boolean`，今天 11 条**全 `false`**；两档阈值的判断逻辑一次写到位（§5.2），不留半档。
2. **Operator 的 `mount_lora` 没有「确认卡」。** 它是一条 `step`，直接应用 + 画一条日志条（`StudioOperatorLogItem`），撤销在 change rail 上。带确认按钮的那张 LoRA 卡（`PromptAssistantLoraPickCard`）属于**旧面板**，只活在小屏。→ §4 的三行落在日志条详情 + observation 上；§7 的来源标注落在**覆盖三选卡**上（那才是 LoRA 域真有的一张确认卡）。

---

## 3. 快照与系统提示改动

### 3.1 快照每条挂载补三格

`AssistantOperatorSnapshotLoraSchema` 加三格（`src/types/assistant-operator.ts:422`）：

| 格                  | 类型             | 语义                                                                                                     |
| ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `triggerWord`       | `string \| null` | 库记录上的触发词。`null` = 这把没有触发词（⛔ 不是空串：空串会被读成「有一个空的触发词」）               |
| `triggerEnabled`    | `boolean`        | 那枚 chip 现在是**开**还是**关**。无触发词时恒 `true`（没有 chip 可关），语义上不参与判断                |
| `recommendedPrompt` | `string \| null` | 作者推荐提示词（`LoraAssetRecord.recommendedPrompt`），`clamp` 到 `LIMITS.maxPromptChars`。`null` = 没有 |

⚠ **`triggerEnabled` 的真值只在 `LoraWorkbench` 手里**（`disabledTriggerIds`，`:882`），所以它必须沿 `LoraWorkbench` → `useLoraOperatorHost` 入参 → `buildLoraOperatorSnapshot` 走一遍，⛔ 不在 hook 里重算：重算等于第二份真相，而用户点 chip 时只会更新其中一份。
⚠ `LoraOperatorHostMount` 上加一格 `triggerEnabled?: boolean`（缺省 `true`），与既有 `enabled?` 同构。

### 3.2 状态块多印两句

`assistant-operator.service.ts:1254` 那段的每条挂载后面追加：

```
trigger "<word>" [MUTED chip]   ← 有触发词时才印；chip 关着时才印后半句
```

底模家族那一行后面追加一句方言指纹（§6.3）。⛔ 没有触发词的挂载**什么都不印**（同 chips 行「无数据不渲染」的判据）。

### 3.3 触发词只读（硬规矩，进 LoRA 域系统提示）

三句，逐字：

- 触发词由 chip 负责编译（chips → tray tags → 正文），**正文里不得重复写触发词**。重复的下场是同一个词进两次编译流。
- chip 关着 = 创作者**有意**关的（风格 LoRA 的触发词与正文打架时会关）。发现关着且这一轮要靠它出效果，**说一句**，⛔ 不要自己去开。
- 助手**没有**开关 chip 的工具，将来也不加（同「装配台没有出图键」那条判据：界面上那颗开关不在助手够得着的宿主契约里）。

---

## 4. 挂载那一步：详情行与 observation

### 4.1 三行落在步骤详情行

`planMountLora` 的 payload 已经有 `family` / `compatible` / `weight`，本轮把它们**全部印出来**，不再只在出问题时印：

| 行       | 取值                                                                    | 兼容时也印？ |
| -------- | ----------------------------------------------------------------------- | ------------ |
| 底模家族 | `payload.family`（候选的原始 baseModel 值）· `null` → 「未知底模」      | ✅           |
| 兼容判定 | `payload.compatible`，判据是**同一份** `isLoraBaseModelMountCompatible` | ✅           |
| 默认权重 | `payload.weight`（模型给的 → 候选推荐 → `defaultScale`，三段回落不变）  | ✅           |

落点**两处，同一份三行**：

1. `src/lib/studio-operator-history.ts:235` 的 `describeStepDetail`（`ASSISTANT_OPERATOR_TOOL_IDS.mountLora` 那一支）——今天是 `名字 · 权重 [· family ✗]`，改成家族与权重**恒印**。⛔ 不改 `StudioOperatorLogItem` 的 JSX，它渲染的就是这一串；⛔ **不新增任何卡型**。
2. `planMountLora` 的 `observation`——同样三件事写进去一次，让模型在正文里有据可复述。

⚠ **§4.2 生效之后，走到这里的挂载一定是兼容的**（不兼容的在 `reject` 里就断了）。「兼容判定」那一行因此恒为「兼容」，它印出来不是为了报警，而是为了**留证**：用户回头复盘时读得到「当时确实按这一族判过」。⛔ 别因为「反正总是兼容」就把这一行省掉——省掉之后日志里再也分不出「判过且通过」与「根本没判」。

⚠ **`defaultScale` 的口径**：`buildSnapshot` 里已经写死「条目没写 scale = 用 `asset.defaultScale`」，与 `handleGenerate` 逐字一致（`use-lora-operator-host.ts:215`）。这三行印的是**同一个数**，⛔ 不另算。

### 4.2 跨族挂载：助手拦，界面不拦

`planMountLora` 里那条「装不上**不拒**」（`:3776` 的注释块）本轮改判：`compatible === false` → `reject(REJECT.loraIncompatibleBase)`（新增拒绝码，与既有 `loraNotImportable` 同族，加在 `constants/assistant-operator.ts:1988` 那一组里）。

⚠ **那段注释要跟着改，⛔ 不能留旧话**（一条说「装不上不拒」的注释挂在一个 `reject` 上面，就是下一个人踩的坑）。它今天写了两半论据，去向分别是：

- 「界面上用户自己也挂得上」这半 → **搬进新注释**，作为「拦的是助手那只手、不是用户那只手」的判据（下一段）。
- 「真实的下一步常常是换底模」这半 → **搬进拒绝理由**（下面第 2 条的措辞），不再是不拒的理由，而是拒了之后给的出路。

拒绝理由里必须有两样东西：

1. 这把是为哪一族训的、当前底模是哪一族（两个 family 值都来自服务端，⛔ 不让模型按名字猜——`"Anima"` 是 DiT 而 `"Anima Pencil XL"` 报的是 `"SDXL 1.0"`，按子串猜必错）。
2. **同族替代建议**：让模型用 `search_loras` 按**当前底模家族**再搜一轮，或者提议换底模（`set_model` 在 LoRA 域=换底模，一直可用）。⚠ 措辞是「去搜同族的」而不是「没有合适的」——助手手上有 `search_loras`，一句「找不到」是在推辞。

⚠ **拒绝的是助手，不是用户**：**界面侧一个字不变**——用户自己仍然挂得上一把不兼容的 LoRA，装配台照旧只画一行橙字、不禁用、不弹窗；想硬挂的人**去界面点**，助手不替他点。这条改判只收紧助手那只手；⛔ 不动 `LoraWorkbench` 的任何一处挂载路径，⛔ 不动 `isLoraBaseModelMountCompatible`（界面与助手仍共用同一个谓词，只是拿到 `false` 之后各走各的）。

---

## 5. 权重提示：只提醒不动手

### 5.1 阈值进常量

`src/constants/lora-base-models.ts`：

```
LoraBaseModel 加一格 distilled: boolean      // 必填，指**步数蒸馏**（turbo / lightning / hyper / LCM / schnell）；FLUX.1-dev 那种 guidance 蒸馏不算，填 false
LORA_STACK_WEIGHT_BUDGET = { default: 1.5, distilled: 1.0 }
```

⚠ **`distilled` 是必填，⛔ 不写成 `distilled?:`**：可选的那一版让「没想过」和「不是蒸馏」长得一模一样，加新底模的人可以整格不填就过 typecheck。必填等于把这个问题摆到每一条目录面前。今天 11 条**全填 `false`**。

⚠ **两档阈值的判断逻辑一次写到位**（非蒸馏 > 1.5、蒸馏 > 1.0），⛔ 不因为今天没有蒸馏底模就先只写一档：接 **Z-Image Turbo / FLUX schnell** 这类蒸馏底模时，只需要把目录里那一条置 `distilled: true`，护栏自动走 1.0 档，⛔ 不必回头改判据、也不必再动这份文档。

⛔ 别用名字含 "turbo" 去嗅——`constants/lora.ts:443`–`:458` 那批 Turbo 字样说的是 **LoRA 的 baseModel 值**（Civitai 浏览分桶），不是我们出图用的底模。

### 5.2 判据

栈总权重 = **启用中**（`enabled !== false`）的挂载权重之和。⚠ 与 `handleGenerate` 的 `.filter(entry => entry.enabled !== false)` 同口径；静音的那把不进出图，也就不该计进预算。

阈值按**当前底模**那一条的 `distilled` 取：`true` → 1.0，`false` → 1.5。⚠ 底模未定（`baseFamily` 为 null）时**不判**——没有底模就没有预算，同 `isLoraCompatibleWithBase` 在底模未定时不下判断那条判据。

超过阈值时：

- **服务端**：`planMountLora` / `planSetLoraWeight` 的 observation 末尾追加一句「总权重 X 超过这个底模的 Y，画面容易糊 / 串味；**我没有动任何权重**，要收的话告诉我收哪一把」。⛔ 不自动归一、⛔ 不改任何权重、⛔ 不拒这一步。
- **客户端**：宿主（`use-lora-operator-host.ts` 的 `apply.lora.setWeight` / `mount` 成功后）插一条系统行，新增码 `loraWeightOverBudget`，`subject` = 总权重与阈值。

**为什么是系统行而不是 `rule_hit` 帧**：`rule_hit` 的载荷里有 `ruleId` / `source`（只有 `assistant` / `creator` 两值）/ `createdAt`，它渲染出来的薄卡说的是**用户当时写下的那句原话**（`types/studio-assistant-operator.ts:149`）。权重预算不是任何人写下的规则，塞一条合成 id 进去等于伪造一条项目规则——那张薄卡的全部可信度就来自「这确实是你写的」。系统行（`loraMountFailed` 是现成先例）表达的正好是「助手做的事在助手线程里交代」，形制是同一条薄行，i18n 三语各补一句即可。

---

## 6. 方言表与模板

### 6.1 落在哪个文件：新建 `src/constants/lora-prompt-dialects.ts`

**理由（两条，都可验证）**：

1. **依赖方向**。`lora-base-models.ts` 顶上 `import { AI_MODELS, getModelById } from '@/constants/models'`——它是「底模×后端」目录，天然拖着整个模型目录。方言表的消费者之一是 `src/lib/lora-prompt-template.ts`，那条路今天**零依赖**（只 import 类型），并且跑在客户端（Library inspector / 装配台）。把方言并进底模目录等于让一句「Pony 要 score 前缀」把模型目录拖进那个 bundle。
2. **本仓的既有习惯**就是一件事一个常量文件：`lora.ts`（section/来源/Civitai 分桶）· `lora-base-models.ts`（底模目录）· `lora-candidate.ts`（候选确认链）· `lora-assistant.ts`（NL→tag 引擎）。方言是第五件事。

新文件只 import `type LoraBaseFamily`。

### 6.2 表的形状

按 `LoraBaseFamily` 全覆盖（`Record<LoraBaseFamily, LoraPromptDialect>`，⛔ 不用 `Partial`——漏一族的表现是那一族静默回落到别人的方言）：

| 字段             | 语义                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| `skeleton`       | 正向骨架：`subject` / `style` 两支（与 `buildLoraPromptTemplate` 现有两支对齐） |
| `weightedParens` | 这一族习不习惯 `(tag:1.2)` 括号权重                                             |
| `negative`       | 推荐负面（数组，逗号连接）                                                      |
| `forbidden`      | 这一族**不能出现**的东西 + 一句为什么                                           |

逐族取值，事实源 [`../domains/lora.md` §7.1.1](../domains/lora.md)（⛔ 本文不复述结论，只落成表）：

| family                        | 正向                                                   | 括号权重 | 负面               | 禁忌                                                   |
| ----------------------------- | ------------------------------------------------------ | -------- | ------------------ | ------------------------------------------------------ |
| `pony`                        | `score_9, score_8_up, score_7_up` 前缀 + Danbooru 标签 | 是       | 按模型页推荐       | 缺 score 前缀质量会塌                                  |
| `illustrious`                 | Danbooru 标签 + `masterpiece, best quality` 词序       | 是       | 标准质量 neg       | ⛔ 不加 score 前缀（那是 Pony 的）                     |
| `sdxl` / `anima`（Pencil XL） | 同 Illustrious 一档（SDXL 系通用质量词）               | 是       | 标准质量 neg       | ⛔ 不加 score 前缀                                     |
| `flux`                        | 自然语言长句，触发词仍保留                             | **否**   | 较短 / 按模型页    | ⛔ 少用括号权重、⛔ 不套 Danbooru 词墙                 |
| `anima-dit`                   | 跟 Anima / Qwen-Image 工作流与触发词                   | 否       | 按 runner / 模型页 | ⛔ 不套 Pony score 前缀；⚠ Anima DiT ≠ Anima Pencil XL |
| `sd15`                        | 保留一档兜底（本仓 runner 范围外）                     | 是       | 标准质量 neg       | —                                                      |

### 6.3 两个消费者

1. **`buildLoraPromptTemplate`**（`src/lib/lora-prompt-template.ts`）签名加 `baseModelFamily: string`，内部 `normalizeToLoraBaseFamily` → 取骨架。⚠ 优先级**不变**：作者推荐 prompt 仍然优先于骨架（原头注那条判据一个字没变），方言只换**兜底那一支**。归一不出家族时用今天这两条写死骨架，⛔ 不猜。
2. **`buildSourceMatchedLoraPrompt`**（`src/lib/lora-source-match-prompt.ts`）的负面：现在是一张写死的 anime 表 + `isAnimeLikeLora` 子串嗅探（`:186`）。改成查方言表的 `negative`，⛔ 删掉 `isAnimeLikeLora`（过时实现直接删，不留兼容层）。正向那条 `ANIME_SOURCE_MATCH_TAGS` 追加同理并进方言表。
3. **LoRA 域系统提示**：按**当前底模家族**注入一段方言（`assistant-operator.service.ts:5994` 那一块），只注入当前那一族，⛔ 不把六族全倒进上下文。底模未定时注入「底模还没定，先别按任何一族的习惯写」。

---

## 7. `set_prompt` 取材与确认卡

### 7.1 取材阶梯（只在 LoRA 域生效）

按**挂载顺序**逐条取，第一个拿得到的赢：

1. `recommendedPrompt`（快照新格，§3.1）——作者自己写的那一版。
2. 来源配方 `buildSourceMatchedLoraPrompt`。⚠ `reliable === false` 时**不当素材用**，改走第 3 档，并在确认卡里明说一句「来源图描述不够，按家族骨架写」。
3. 家族骨架（§6 方言表）。

⚠ `source === 'trained'`（自训 LoRA）**如实说没有料**：自训资产既没有作者推荐也没有 Civitai 来源图，编一段「来源配方」出来是本仓最讨厌的那种谎。这一档直接走骨架并说明。

⚠ 实现落点是 `planSetText` 里 `run.request.domain === 'lora'` 那一支（与 `image` 域的参考图复核那一支并列，⛔ 不混进去）。素材来自**快照**，⛔ 不新增 DB 读、⛔ 不新增工具。

### 7.2 确认卡加两段

覆盖三选那一帧（`ask` + `overwrite` 块，`assistant-operator.service.ts:7530`）的 `overwrite` 载荷加两格：

| 格             | 内容                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `sourceNotes`  | 逐段标注：`["主体 — 来自《XX》的作者推荐", "画风 — 家族骨架（Illustrious）"]`，条目数 ≤ 挂载数 + 1 |
| `negativeDiff` | 这一次要对负面框做的改动（新增了哪几个词 / 没有改动时缺席）                                        |

渲染落在**已有**那张卡上（多几行文本），⛔ 不新造卡型、⛔ 不加图标、⛔ 不改布局。i18n 三语同步。

⚠ **没有确认卡的那一支**（提示词框是空的 → 不触发覆盖三选）：同一份 `sourceNotes` 进 step 的 observation，模型在正文里复述。⛔ 不为了「让卡出现」去伪造一次确认——那会把一个每次都要点的按钮塞进空框路径。

### 7.3 推荐负面也进助手

`set_negative` 在 LoRA 域按方言表的 `negative` 取值，与 `set_prompt` **同一轮**给出（两条工具不变）。写法沿用既有 `mergeNegativePrompt`（`lora-source-match-prompt.ts:142`）的去重口径，⛔ 不覆盖用户已写的负面词——覆盖仍然走覆盖三选。

### 7.4 换底模后的方言纠错

助手**改提示词前先看家族**（系统提示里一句硬规矩）：当前正文里出现当前家族 `forbidden` 里的东西（典型：`score_9` 前缀留在 FLUX 上），就在**同一张确认卡**里把修正一起提出来——⛔ 不另开一轮、⛔ 不静默替换、⛔ 不只是口头提醒然后照旧写。

⚠ 判据用方言表的 `forbidden`，⛔ 不让模型自由发挥「这看起来不像 FLUX 的写法」。

---

## 8. 测试清单

| #   | 验的是                                                                                                | 文件                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `distilled` 必填且 11 条全 `false`；阈值两档都可判（非蒸馏 1.5 / 蒸馏 1.0，蒸馏档用构造条目验）       | `src/constants/lora-base-models.test.ts`                                                |
| 2   | 方言表六族全覆盖；Pony 有 score 前缀、IL/FLUX/Anima DiT 各自没有                                      | `src/constants/lora-prompt-dialects.test.ts`（新）                                      |
| 3   | `buildLoraPromptTemplate` 按家族换骨架；作者推荐仍然优先；家族归一不出时回落                          | `src/lib/lora-prompt-template.test.ts`                                                  |
| 4   | 负面来自方言表；`isAnimeLikeLora` 全仓零命中；`reliable` 语义不变                                     | `src/lib/lora-source-match-prompt.test.ts`                                              |
| 5   | 快照三格：`triggerWord` null 与空串之分、chip 关着时 `triggerEnabled=false`、`recommendedPrompt` 截断 | `src/lib/studio-operator-snapshot.test.ts` · `src/hooks/use-lora-operator-host.test.ts` |
| 6   | 快照 schema 三格的校验与上限                                                                          | `src/types/assistant-operator.test.ts`                                                  |
| 7   | 跨族挂载被拒 + 拒绝理由里有两个 family 与「去搜同族」                                                 | `src/services/kernel/assistant-operator.service.test.ts`                                |
| 8   | 挂载详情三行恒印（家族 / 兼容 / 权重），observation 里同一份三行                                      | `src/lib/studio-operator-history.test.ts`                                               |
| 9   | 超预算 observation 出现且**权重没被改**；不超时不出这句；底模未定时不判                               | `src/services/kernel/assistant-operator.service.test.ts`                                |
| 10  | 系统行 `loraWeightOverBudget` 插得进线程                                                              | `src/hooks/use-lora-operator-host.test.ts`                                              |
| 11  | 系统提示：当前家族的方言在、别族的不在；底模未定时那一句在                                            | `src/services/kernel/assistant-operator.service.test.ts`                                |
| 12  | 取材阶梯三档 + `reliable=false` 落第 3 档 + 自训如实说                                                | `src/services/kernel/assistant-operator.service.test.ts`                                |
| 13  | `overwrite.sourceNotes` / `negativeDiff` 渲染                                                         | `.../assistant-operator/StudioOperatorQuestionCard.web.test.tsx`                        |
| 14  | 三语键齐                                                                                              | `/i18n-check`                                                                           |

⚠ 触及共享类型（`types/assistant-operator.ts`）与 kernel 服务：合并前按 [WORKFLOW](../../WORKFLOW.md) 影响面表跑**全量 Vitest + 全量 typecheck**（`full-gate`）。

---

## 9. commit 计划

> 一动作一 commit，顺序按 constants/types → services → hooks → components。
> 每个 commit 的机器门都含 `npm run typecheck` · `npm run lint`；下表只列**额外**的定向验证。
> ⚠ dev server 归 owner 起，不另起实例；dev 跑着时不并行 build。

| #   | commit                                                                 | 改动文件（要点）                                                                                                                                                               | 额外验证                                                                                                                 |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `feat(lora): distilled base flag and stack weight budget`              | `constants/lora-base-models.ts`（`LoraBaseModel` 加**必填** `distilled: boolean`，11 条全 `false`；加 `LORA_STACK_WEIGHT_BUDGET` 两档）                                        | `vitest run src/constants/lora-base-models.test.ts`                                                                      |
| 2   | `feat(lora): family prompt dialect table`                              | `constants/lora-prompt-dialects.ts`（新）+ 同名 test                                                                                                                           | `vitest run src/constants/lora-prompt-dialects.test.ts`                                                                  |
| 3   | `refactor(lora): prompt template and source recipe follow the dialect` | `lib/lora-prompt-template.ts`（签名加家族）· `lib/lora-source-match-prompt.ts`（负面/正向查表，删 `isAnimeLikeLora`）· 两处调用点                                              | `vitest run src/lib/lora-prompt-template.test.ts src/lib/lora-source-match-prompt.test.ts` · `rg isAnimeLikeLora` 零命中 |
| 4   | `feat(assistant): snapshot carries trigger words and prompt stock`     | `types/assistant-operator.ts` · `lib/studio-operator-snapshot.ts` · `hooks/use-lora-operator-host.ts` · `components/.../LoraWorkbench.tsx`（透传 chip 状态）                   | `vitest run src/types src/lib/studio-operator-snapshot.test.ts src/hooks/use-lora-operator-host.test.ts`                 |
| 5   | `feat(assistant): block cross-family lora mounts`                      | `services/kernel/assistant-operator.service.ts`（`planMountLora` 改 `reject` + **重写 `:3776` 那段注释**）· `constants/assistant-operator.ts`（`REJECT.loraIncompatibleBase`） | `vitest run src/services/kernel`                                                                                         |
| 6   | `feat(assistant): mount step spells out family, fit and weight`        | `lib/studio-operator-history.ts` · service 的 observation                                                                                                                      | `vitest run src/lib/studio-operator-history.test.ts src/services/kernel`                                                 |
| 7   | `feat(assistant): warn on an over-budget lora stack`                   | service（两处 observation）· `constants/studio-assistant-operator.ts`（`loraWeightOverBudget`）· `hooks/use-lora-operator-host.ts` · `messages/{en,ja,zh}.json`                | `vitest run src/services/kernel src/hooks` · `/i18n-check`                                                               |
| 8   | `feat(assistant): lora domain prompt gets dialect and trigger rules`   | service 的 LoRA 域规矩块 + 状态块两句                                                                                                                                          | `vitest run src/services/kernel`                                                                                         |
| 9   | `feat(assistant): set_prompt sources its material and shows it`        | service `planSetText` 的 lora 支 · `types/assistant-operator.ts`（`overwrite.sourceNotes` / `negativeDiff`）· `StudioOperatorQuestionCard.tsx` · `messages/{en,ja,zh}.json`    | `vitest run src/services/kernel .../StudioOperatorQuestionCard.web.test.tsx` · `/i18n-check`                             |

**顺序判据**：1–3 是纯常量与纯函数，任何一条随时可合且不动助手；4 把素材铺到快照上（5–9 全都读它）；5–6 是挂载那一步的两件事（先改判据再改播报，反过来会有一版日志说着「已挂载」而下一版把它拒了）；7 依赖 1 的阈值；8 依赖 2 的方言表；9 最重也最靠后，它同时读 4 的素材与 2 的骨架。

**合并前**：`npm run test:run`（`full-gate`）一次，改动触及共享类型与 kernel 服务。

---

## Source of Truth / Last Verified

### Source of Truth

- **决策**：owner 2026-09-12 拍板（范围、七条、UI 不动、手机端不做、不加新工具）
- **上游契约**：[`../domains/lora.md`](../domains/lora.md) §7.1.1（family 方言 · 跨族拦截 2026-09-11 拍板）
- **页面**：[`lora-generate.md`](lora-generate.md)（助手是按需辅助层，不重排主台）· [`lora-workbench.md`](lora-workbench.md) §4.3（触发词 chips 与编译顺序）
- **协议**：[`assistant-shell-v2.md`](assistant-shell-v2.md)（五动词 / 十帧 / 五类卡片 / 钱闸）
- **代码**：`src/constants/lora-base-models.ts` · `src/constants/assistant-operator.ts` · `src/constants/studio-assistant-operator.ts` · `src/types/assistant-operator.ts` · `src/services/kernel/assistant-operator.service.ts` · `src/lib/lora-model-compatibility.ts` · `src/lib/lora-prompt-template.ts` · `src/lib/lora-source-match-prompt.ts` · `src/lib/studio-operator-snapshot.ts` · `src/lib/studio-operator-history.ts` · `src/hooks/use-lora-operator-host.ts` · `src/components/business/studio/lora/LoraWorkbench.tsx`

### Last Verified

- **2026-09-12 · 本文创建，owner 当日逐条拍板**。代码现状于本日读码核过，**只写文档，代码未动**。三处「代码与讨论口径不一致」已按代码 + owner 拍板写死：
  - **底模目录上没有蒸馏这一位**：11 条里没有蒸馏底模，`LoraBaseModel` 上也没有字段；Turbo 字样只在 `constants/lora.ts:443`–`:458` 的 Civitai 浏览分桶里（那是 LoRA 的 baseModel 值）。→ 加**必填** `distilled: boolean`（今天全 `false`），两档阈值逻辑一次到位；接 Z-Image Turbo / FLUX schnell 时只改那一条的值（§5.1）。
  - **Operator 的 `mount_lora` 没有确认卡**：它是 step + 日志条 + change rail 撤销；带确认按钮的 LoRA 卡属于旧面板（只活在小屏）。→ 三行落在 `describeStepDetail` 的 mount_lora 详情与 observation 上（§4.1），来源标注落在覆盖三选卡上（§7.2），**不新增卡型**。
  - **跨族挂载今天是「不拒只警告」**（`planMountLora:3776` 的注释块写明了判据）。→ 改成 `reject`；那段注释**重写**，两半论据分别搬进新注释（界面不拦）与拒绝理由（换底模 / 按同族再搜），⛔ 不留旧话（§4.2）。**界面侧一个字不变。**
