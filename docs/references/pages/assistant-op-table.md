# 宿主 op 表（assistant-op-table.md）

> 进度表 21 的 spec。助手的「改」与「请求生成」两个动词，在三个宿主（图片 / 视频工作台 · 画布 · LoRA 装配台）上到底有哪些 op、各自撤怎么撤、落在界面的哪一格 —— 一张可查的表。
>
> 协议、五动词、五类卡、每轮结账以 [`assistant-shell-v2.md`](assistant-shell-v2.md) 为准（§2 五动词 · §5 生成确认卡 · §7 结账），画布那一侧多出来的东西以 [`node-canvas-v2.md` §13](node-canvas-v2.md) 为准，LoRA 域以 [`lora-assistant.md`](lora-assistant.md) 为准。**本文不重抄它们**，只把 op 这一格摊平成表。
>
> ⚠ **真值在代码**。三张表逐条从常量文件抄来（见文末 Source of Truth），表和代码对不上时代码赢。⛔ 不在本文钉死任何「总共几条」当作规范 —— 写在这里的数字是某一天的点数，用来对账，不用来约束。

---

## 1. 原则

1. **模型只见五个入口** —— `look` / `research` / `ask` / `apply` / `request_generation`。op 是 `apply` 与 `request_generation` 的 `action` 值。
2. **组内细分是封闭枚举**，值 = 本组原工具 id，由 `ASSISTANT_OPERATOR_TOOL_VERBS` 过滤现算；⛔ 不是开放字符串。
3. **一次 apply 只改一项**（不是 `changes[]`）—— 错一项只重发一项。
4. **改动型必带 inverse**：schema 层写成必填，缺了校验就不过。
5. **费用档 × 可逆档决定落法**：free 且可逆 → **自动落**；paid 或不可逆 → 出确认卡。第三档（花钱）不给 inverse，回头路是结果卡而不是撤销钮。
6. **回执**：一轮内自动落的 op 合成一行「已改 N 项 · 撤销」；被改对象 outline 闪一次说的是「是哪几个」。
7. **撤销逆序**执行 inverse；画布那一侧是线性栈，撤到那一步为止。
8. **结账**：「问」的产出进「决定」，「看」进「事实」，「请求生成」进「待办」。
9. **域裁剪裁的是枚举值不是工具条目** —— 界面上没有的旋钮，模型压根看不见。
10. **钱闸**：服务端永远只吐载荷，扣扳机的那一跳在客户端宿主手上。

---

## 2. 工作台 op 表（图片 / 视频）

列头：op id · 动词组 · 参数要点 · inverse · 费用 / 可逆 · 落点 · 是否已接 11 的专属 chip。

「域」一列：`图` = 只在 image 域，`视` = 只在 video 域，`图视` = 两域都有。⚠ 这里只列**会产生 op 的**那些（改 + 请求生成）；读 / 查 / 问三组不产 op，见 `assistant-shell-v2.md` §2.1。

| op id                   | 域   | 动词组   | 参数要点                                                                                                                                                        | inverse                                          | 费用 / 可逆   | 落点                                     | 11 专属 chip          |
| ----------------------- | ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------- | ---------------------------------------- | --------------------- |
| `set_prompt`            | 图视 | 改       | `value` · `mode`(replace/append) · `overwrite?`                                                                                                                 | `{ value }` 旧文本                               | free · 可逆   | `prompt` 提示词框                        | 无关                  |
| `set_negative`          | 图视 | 改       | 同上；⚠ 快照缺 `negativePrompt` = 无此控件，按 `noSuchControl` 拒                                                                                               | `{ value }` 旧文本                               | free · 可逆   | `negative` 负面框                        | 无关                  |
| `set_model`             | 图视 | 改       | `modelId`（只能取快照 `availableModels`）· `channelId?`（**只在多渠道型号上**，取快照 `channels`；不给 = 客户端按记忆 / 单渠道定，都不成立就进「先选渠道」）    | `{ modelId, channelId? }` modelId 可为 `null`    | free · 可逆   | `model` 模型 chip（+ 渠道面板那一行）    | 无关                  |
| `set_specs`             | 图   | 改       | `aspectRatio` + `resolution` **两个必填** · `quality?` `preview?` `background?`                                                                                 | 旧五格（每格可 `null`）                          | free · 可逆   | `specs` 比例 chip + 高级参数             | 另有 `set_capability` |
| `set_video_specs`       | 视   | 改       | `durationSeconds?` · `aspectRatio?` · `resolution?`（逐型号有无）                                                                                               | 旧三格**永远带齐**（缺的那格 `null`）            | free · 可逆   | `specs` 比例 / 时长 / 清晰度             | 另有 `set_capability` |
| `set_count`             | 图   | 改       | `count`（值域 = 快照档位表）                                                                                                                                    | `{ count }` 旧值                                 | free · 可逆   | `count` 张数                             | 无关                  |
| `mount_reference`       | 图视 | 改       | `assetId`（只认本轮检索过的）· `slot?`(first/last/reference/video)；⛔ URL 由服务端填                                                                           | `{ assetId, slot }`                              | free · 可逆   | `references` 参考轨                      | 无关                  |
| `unmount_reference`     | 图视 | 改       | `slotIndex`（`@ImageN` 的 N，**从 1 起**）**或** `assetId`，⛔ 二选一；`slot?` 清首 / 尾帧那一格（⛔ 参考视频位无名单，拒）                                     | `{ url, slot }` 原样挂回同一个位置               | free · 可逆   | `references` 参考轨 / 帧槽               | 无关                  |
| `import_user_url`       | 图视 | 改       | `url` —— 必须逐字出现在本轮用户消息里，否则 `urlNotFromUser`                                                                                                    | `{ url }` 源地址（客户端反查落地址）             | free · 可逆   | `references` 参考轨                      | 无关                  |
| `mount_audio_reference` | 视   | 改       | `assetId` · `ownerName?`（角色归属，喂 `{Name} (@AudioN)`）                                                                                                     | `{ assetId }`                                    | free · 可逆   | `audioReferences` 音频参考位             | 无关                  |
| `set_sound`             | 视   | 改       | `enabled` —— 工具只写得出 true/false                                                                                                                            | `{ enabled }` **允许 `null`**（没设过）          | free · 可逆   | `sound` 声音开关                         | 无关                  |
| `add_project_rule`      | 图视 | 改       | `text` · `scope?` · `kind?`；`source` 恒为 `ASSISTANT`                                                                                                          | `{ ruleId }` 服务端刚写的那行                    | free · 可逆   | 服务端库（无表单落点）                   | 无关                  |
| `set_review_state`      | 图视 | 改       | `assetId` · `state`(pending/approved/blocked) · `reason?`                                                                                                       | `{ assetId, state }` **旧值**                    | free · 可逆   | 服务端 `Generation.snapshot.reviewState` | 无关                  |
| `tag_asset`             | 图视 | 改       | `assetIds[]` · `tags[]`                                                                                                                                         | `entries[]` —— **这一步真的新加上的那几个标签**  | free · 可逆   | 服务端素材库                             | 无关                  |
| `favorite_asset`        | 图视 | 改       | `assetIds[]` · `value`（必填，⛔ 没有「切换」）                                                                                                                 | `entries[]` 逐张原值                             | free · 可逆   | 服务端素材库                             | 无关                  |
| `create_folder`         | 图视 | 改       | `name` · `parentId?`（一次只建一个）                                                                                                                            | `{ folderId }`，**且仅当它仍是空的**             | free · 可逆   | 服务端 `Project` 文件夹树                | 无关                  |
| `move_assets`           | 图视 | 改       | `assetIds[]` · `targetFolderId`（必填且不可 `null`）                                                                                                            | `entries[]` 逐张原文件夹（`null` = 原来没归档）  | free · 可逆   | 服务端素材库                             | 无关                  |
| `prime_generate`        | 图视 | 请求生成 | `label?` —— ⛔ 它不是生成，只把生成键置 primed 并算价                                                                                                           | `{ primed: false }`                              | free · 可逆   | 生成键（无 field id）                    | 无关                  |
| `request_generation`    | 图视 | 请求生成 | `label?`；模型 / 张数 / 规格从快照现取，用户在卡上改                                                                                                            | **无**（§6 第三档）                              | paid · 不可逆 | 宿主 `triggerGeneration`                 | 无关                  |
| `set_capability`        | 图视 | 改       | `key`（**只能取快照 `capabilities` 现给的那几个键**，11 从 `provider-capabilities` 派生）· `value`（按 `kind` 分三种：select 选项 / slider 区间 / toggle 布尔） | `{ key, value }` 旧值，**允许 `null`**（没设过） | free · 可逆   | 专属 chip 行                             | **就是它**            |

**读一遍就够的几条不对称**：

- **`set_specs` 与 `set_video_specs` 分家**，⛔ 不是同一件事换了值。图片档两个字段都必填（只给比例不是真比例）；视频档三个参数是 provider 的三个独立字段且逐型号有无 —— 塞进「两个必填」的载荷，在 `parameters.resolution === false` 的型号上这条工具**永远无解**。
- **服务端写库的只有六条**：`add_project_rule` · `set_review_state` + 素材库四条。其余全部是「吐一个 op 让客户端应用」，所以流断在哪里都不会留下半个写入。
- **覆盖手写内容先走三选**（追加在后 / 覆盖 / 保留），那一帧是 `ask` 不是 `confirm`。
- **专属 chip 的键是现算的**：`set_capability` 的白名单来自快照的 `capabilities` 一节，而那一节由 `lib/model-capability-chips.ts` 从 `provider-capabilities` 派生 —— 与界面上那一行 chip 是**同一份**。⚠ 整节缺席 = 这个工作台 / 这个模型没有专属区（今天视频档就是：那一行只在图片档渲染），按 `noSuchControl` 拒，形状与 `set_negative` 逐字同源。
- **渠道只在多渠道型号上有意义**：`channels` 那一节只在**两条以上**时才给（折叠判据与模型选择器共用 `foldChannels`）。单渠道型号上写 `channelId` 一律拒，⛔ 不静默忽略；不写 `channelId` 时**服务端什么都不定** —— D2 Q1 删掉的「自动渠道」不许从这条路长回来。视频档的 `availableModels` 本身就是型号 × 渠道，那一档整列缺席。

---

## 3. 画布 op 表

真值是 `NODE_ASSISTANT_OPS_V4`（**32 条**，2026-09-19 逐键点数）。画布域**只开三个口子**（`canvas_apply` / `canvas_plan_rerun` / `canvas_generate`），`op` 那一格原样收 v4 的封闭词表 —— 模型看见的仍是封闭枚举，只是枚举住在它本来就住的那张表里。

**路由规则（现算，⛔ 不手抄）**：`CANVAS_APPLY_OP_IDS = NODE_ASSISTANT_OPS_V4.filter(inverse !== null && op !== 'generate')` → **28 条**。读类三条归 `canvas_plan_rerun` / `read_state`，`generate` 归 `canvas_generate`。

| op id                   | group     | tier            | inverse                 | autoApply      | 走哪条工具                       |
| ----------------------- | --------- | --------------- | ----------------------- | -------------- | -------------------------------- |
| `read_canvas`           | read      | free            | —                       | 是（无副作用） | `read_state`（快照）             |
| `find_node`             | read      | free            | —                       | 是             | `read_state`（快照）             |
| `plan_rerun_downstream` | read      | free            | —                       | 是             | **`canvas_plan_rerun`**          |
| `add_node`              | structure | free            | `delete`                | 是             | `canvas_apply`                   |
| `connect`               | structure | free            | `disconnect`            | 是             | `canvas_apply`                   |
| `disconnect`            | structure | free            | `connect`               | 是             | `canvas_apply`                   |
| `delete`                | structure | **confirm**     | `add_node`              | **否**         | `canvas_apply`（先出就地确认卡） |
| `move_to_shot`          | structure | free            | `move_to_shot`          | 是             | `canvas_apply`                   |
| `reorder_shot`          | structure | free            | `reorder_shot`          | 是             | `canvas_apply`                   |
| `project_script`        | structure | **confirm**     | `delete`（批量）        | **否**         | `canvas_apply`（先出就地确认卡） |
| `set_slot_version`      | structure | free            | `set_slot_version`      | 是             | `canvas_apply`                   |
| `mark_version_blocked`  | structure | free            | `mark_version_blocked`  | 是             | `canvas_apply`                   |
| `set_output_version`    | structure | free            | `set_output_version`    | 是             | `canvas_apply`                   |
| `split_output_version`  | content   | free            | `delete`                | 是             | `canvas_apply`                   |
| `set_subtype`           | content   | free            | `set_subtype`           | 是             | `canvas_apply`                   |
| `set_text`              | content   | free            | `set_text`              | 是             | `canvas_apply`                   |
| `set_prompt`            | content   | free            | `set_prompt`            | 是             | `canvas_apply`                   |
| `set_field`             | content   | free            | `set_field`             | 是             | `canvas_apply`                   |
| `attach_asset`          | content   | free            | `disconnect`            | 是             | `canvas_apply`                   |
| `set_model`             | content   | free            | `set_model`             | 是             | `canvas_apply`                   |
| `set_params`            | content   | free            | `set_params`            | 是             | `canvas_apply`                   |
| `set_voice_profile`     | content   | free            | `set_voice_profile`     | 是             | `canvas_apply`                   |
| `set_review_state`      | review    | free            | `set_review_state`      | 是             | `canvas_apply`（⚠ 助手不得自批） |
| `edit_set_timeline`     | content   | free            | `edit_set_timeline`     | 是             | `canvas_apply`                   |
| `edit_add_clip`         | content   | free            | `edit_remove_clip`      | 是             | `canvas_apply`                   |
| `edit_remove_clip`      | content   | free            | `edit_add_clip`         | 是             | `canvas_apply`                   |
| `edit_update_clip`      | content   | free            | `edit_update_clip`      | 是             | `canvas_apply`                   |
| `edit_move_clip`        | content   | free            | `edit_move_clip`        | 是             | `canvas_apply`                   |
| `edit_add_text`         | content   | free            | `edit_remove_text`      | 是             | `canvas_apply`                   |
| `edit_remove_text`      | content   | free            | `edit_add_text`         | 是             | `canvas_apply`                   |
| `edit_update_text`      | content   | free            | `edit_update_text`      | 是             | `canvas_apply`                   |
| `generate`              | paid      | **hardConfirm** | —（结果不删，只回参数） | **否**         | **`canvas_generate`**            |

### 3.1 `project_script` 已落地（进度表 24，2026-09-19）· `attach_card` 仍待新增

`project_script` 已在上表里（structure · **confirm** · inverse = 批量 `delete`）。参数是 `scriptNodeId`（`text.script` 卡）+ `mode: create | reproject`，缺省 `create`；投影过的剧本再 `create` **拒并提示改用 `reproject`**。落点是时间轴镜头节点 + 从剧本卡到每镜文本槽的连线。细则（拆镜三档 / diff 三类 / 角色空槽 / 快照两格）以 [`node-canvas-v2.md` §12.1](node-canvas-v2.md) 为准，⛔ 本文不重抄。

⚠ `project_script` 归 `confirm` 而不是 free 的判据与 `delete` 同源：**一句话能长出一整排节点**。重投影的 diff 语义（新增镜追加 / 改文案的镜标「已变」/ 删掉的镜不删节点只标灰）意味着它的 inverse 不是「整份快照回滚」，而是**只撤回本次新增**——所以参数里那个 `mode` 不是装饰，它决定 inverse 收哪几个 id。

| op id         | group   | tier | 参数（草案）                             | inverse（草案）                                              | 费用 / 可逆 | 落点                        | 谁做                                                                 |
| ------------- | ------- | ---- | ---------------------------------------- | ------------------------------------------------------------ | ----------- | --------------------------- | -------------------------------------------------------------------- |
| `attach_card` | content | free | `cardId` · `nodeId` · `role`（角色槽名） | `disconnect`（同 `attach_asset` 那条：只有节点引用没有 URL） | free · 可逆 | 角色参考槽 + `@名字` + 音色 | 进度表 35（`referenceSlots{role,url,cardId}` 已落形状与空态，见 24） |

### 3.2 画布这一侧的三条纪律（照抄 §13.2，别在这里改）

1. `connect` / `disconnect` / `attach_asset` 载荷里**只有节点引用没有 URL**。
2. `connect` 的 `slot` 必填 —— 没有槽的连线在 v4 里不存在。
3. `generate` 是唯一扣 credit 的 op，服务端只吐 op、执行在客户端。

`canvas_apply` 的 step 上那份 `inverse` 只是一张**指路条**（`{ op, nodeRef }`）：真正的撤销载荷由客户端执行器在应用那一刻算出来并扣着（删一个节点的 inverse 要整份 data 快照 + 边表 + 各槽版本，服务端手上根本没有）。形态与 `mount_lora` 逐字同源。

---

## 4. LoRA op 表

LoRA 装配台的 op = **通用件里的那些**（与工作台同表，见 §2 的「图视」行，`set_specs` / `set_count` / `request_generation` 三条除外；`set_capability` / `unmount_reference` 两条新件也**只给两台工作台**，判据见 §6-1 / §6-2）+ 下面这八条域专属。

| op id                    | 动词组 | 参数要点                                                                                                                              | inverse                     | 费用 / 可逆 | 落点                       |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------- | -------------------------- |
| `search_loras`           | 查     | `query` · `limit?`；复用双源检索（Civitai + HF），单源失败不拖垮另一源                                                                | —（只读）                   | free · —    | 候选列表（不落任何字节）   |
| `plan_lora_pick`         | 问     | `question` · `groups[{title?, candidateIds[]}]` · `recommendedCandidateId?`；只收本轮 `search_loras` 回过的 id                        | —（什么都没发生）           | free · —    | 推荐卡（停流等创作者拍板） |
| `mount_lora`             | 改     | `candidateId`（⛔ 模型不写下载地址）· `weight?`；导入载荷服务端查填                                                                   | `{ candidateId }`           | free · 可逆 | `loras` 装配台挂载栈       |
| `unmount_lora`           | 改     | `loraId` —— 只能是快照里的**已挂载项**，⛔ 不是候选 id                                                                                | `{ loraId, weight }`        | free · 可逆 | `loras` 装配台挂载栈       |
| `set_lora_weight`        | 改     | `loraId` · `weight`（值域借 `ASSISTANT_LORA_PICK_LIMITS` 的 0.1–2）                                                                   | `{ loraId, weight }` 旧权重 | free · 可逆 | `loras` 的 `LoraScaleChip` |
| `set_lora_parameters`    | 改     | `steps?` · `guidanceScale?` · `runnerSeed?` · `runnerWidth?` · `runnerHeight?` · `runnerSampler?` · `runnerScheduler?`（`.strict()`） | 同形状的旧值                | free · 可逆 | `specs` 高级参数           |
| `analyze_references`     | 看     | `imageIndices?`                                                                                                                       | —（只读）                   | free · —    | 无（产出是一段事实）       |
| `critique_result`        | 看     | `goal?` · `targetIds?`；图来自请求里的 `result`，⛔ 模型不给地址                                                                      | —（只读）                   | free · —    | 无（产出是一段评价）       |
| ~~`set_specs`~~          | —      | **域表里缺席**：装配台有比例（`LoraAspectRatioChip`）却没有清晰度，而 `set_specs` 两字段必填                                          | —                           | —           | 比例这颗旋钮本域够不着     |
| ~~`set_count`~~          | —      | **域表里缺席**：装配台是单次出图，界面上没有张数控件                                                                                  | —                           | —           | —                          |
| ~~`request_generation`~~ | —      | **域表里缺席**：出图键住在 `GenerateBranch` 的局部 state，宿主契约上没有 `triggerGeneration`                                          | —                           | —           | —                          |

⚠ 缺席**不是遗漏**，是「摆一条这个域里无解的工具」的反面 —— 论据逐条写在 `ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN[lora]` 的头注上。要补，补的是控件或宿主契约，不是工具表。

---

## 5. 回执与撤销契约

| 事                   | 规则                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **合成一行**         | 一轮内所有自动落的 op 合成**一行**「已改 N 项：模型 · 提示词 · 参考图」+「撤销」（`StudioOperatorCheckpointCard`），⛔ 不是每步一行                                                                                                                                                                                                                             |
| **撤销粒度**         | 认 `runKey`（这一轮），⛔ 不去劈条目 id。点撤销**就地**展开二选：只回参数（结果不删、对话保留）/ 连对话一起回（参数回滚 + 截断该轮之后的线程）                                                                                                                                                                                                                  |
| **逆序**             | 按 step 的 `inverse` **逆序**执行                                                                                                                                                                                                                                                                                                                               |
| **服务端那六条**     | 后果在库里的（规则 + 审核态 + 素材库四条）撤销要**打一次网络**，走 `revertAssistantAssetWriteAPI`                                                                                                                                                                                                                                                               |
| **更大的粒度**       | 参数栏上「清掉助手全部改动」二击确认照旧留着（拍板 14）：它管的是这个工作台上助手改的**全部**，与薄卡的「这一轮」是两种粒度                                                                                                                                                                                                                                     |
| **闪**               | 被改对象 outline 闪一次，**320ms**，只动 `outline` 与 `opacity`（⛔ 不动 transform / 尺寸：被改的东西常在视线里，动尺寸会让整片重排）。**三个宿主同一条动效**：画布走 `canvas.css` 的 `.node-assistant-touched`，工作台 / 装配台走 `globals.css` 的 `.assistant-field-touched`（时长取脊柱现成的 `--duration-slow`，⛔ 不新造一档）。一轮内多项**同时各闪各的** |
| **motion-reduce**    | `prefers-reduced-motion` 下降到 **1ms 并保留终态**，与画布其余三档同一条规矩；工作台那一档由 `globals.css` 末尾那条全局降级接住（压到 0.01ms = 直接不闪），⛔ 不写第二条降级                                                                                                                                                                                    |
| **既有例外**         | 画布的 **`add_node` 不闪** —— 新 id 由执行器现铸，助手这一侧根本看不见它；一张卡凭空出现本来就比闪一下更响。工作台的**张数**住在规格 chip 的「更多」浮层里，浮层没展开时闪不到（静默跳过，⛔ 不为它把浮层弹开）                                                                                                                                                 |
| **画布撤销栈**       | **线性**：撤到那一步为止，不是只撤那一步。语义与用户自己按 ⌘Z 一致，⛔ 不另起一套「只撤中间那一格」的画布撤销（那需要第二份图历史）                                                                                                                                                                                                                             |
| **结账**             | 「问」的产出进**决定**，「看」进**事实**，「请求生成」进**待办**（§7.2）                                                                                                                                                                                                                                                                                        |
| **花钱档没有撤销钮** | `request_generation` / `canvas_generate` / v4 `generate` 都不给 `inverse`。⛔ 别补一个空的去「统一形状」——日志条上会多出一颗点了没反应的钮。回头路是结果卡                                                                                                                                                                                                      |

---

## 6. 差距清单（现状 vs 画板 / 原则）

| #   | 差距                                                                                                                                                                                                                                                                                                        | 谁做                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | ~~工作台没有「专属 chip 值」op~~ —— **已落**：`set_capability` 进工作台域表（图 + 视），键白名单来自快照 `capabilities`（与 11 那行 chip 同一份派生），值按 `kind` 三种形态各自校验，`inverse` 收旧值且允许 `null`。⚠ 视频档今天没有专属区，那一节缺席 → `noSuchControl`                                    | 进度表 21 · 已落                               |
| 2   | ~~没有 `unmount_reference`~~ —— **已落**：`slotIndex`（`@ImageN`，从 1 起）或 `assetId` 二选一，`slot` 清首 / 尾帧那一格，载荷与 `inverse` 同形（原样挂回同一个位置）。⚠ 参考视频位**仍拒**（快照只给了个数没给名单，摘哪一条无从指认）；装配台那条参考轨也还没接，补它是独立一件                           | 进度表 21 · 已落（LoRA 域与参考视频位待补）    |
| 3   | ~~`set_model` 不带渠道~~ —— **已落**：快照在**多渠道型号**上给 `channels`（折叠判据与选择器共用 `foldChannels`），`set_model` 收可选 `channelId`；单渠道型号上写它拒，写错一条拒并列回真的那几条；不写则服务端不定，客户端按记忆 / 单渠道定，都不成立进「先选渠道」（进度表 10 那道闸）。撤销连渠道一起回去 | 进度表 21 · 已落                               |
| 4   | ~~工作台字段不闪~~ —— **已落**：`globals.css` 的 `.assistant-field-touched` 与画布同一条 320ms 动效，组件上以 `data-assistant-field` 指认（提示词框借 `STUDIO_PROMPT_TEXTAREA_ID`），落在模型 / 规格 / 张数 / 专属 chip / 参考轨 / LoRA 挂载栈。⚠ 张数在浮层里、浮层没展开时闪不到（既有例外，见 §5）       | 进度表 21 + 22 · 已落                          |
| 5   | **画布线性撤销栈只能撤到该步**：与「整组回滚」的口径不同 —— 一轮里第 1 步和第 3 步之间夹了用户自己的编辑时，撤销会一并回退                                                                                                                                                                                  | 已知取舍，不改；若要改需第二份图历史（无归属） |
| 6   | **排片回传缺口**：剪辑台「一句话排片」只到面板，拿不到剪辑台能直接套用的时间线提案（`deliverTimelineProposal` 无生产者）；`TIMELINE_PLAN_TOOL_ID = 'plan_timeline'` 在 `edit-desk.ts` 里定着，但 v4 op 词表里**没有这条 op**                                                                                | 进度表 21（补 op）+ 画布 §13.6                 |
| 7   | **`node-canvas-v2.md` §13.2 把 `plan_timeline` 列进「读」组**，而 `NODE_ASSISTANT_OPS_V4` 里没有它 —— 文档超前于代码                                                                                                                                                                                        | 文档修正（21 落地时一并改）                    |
| 8   | **`NODE_ASSISTANT_AUTO_APPLY_OPS`（v3 的 8 条）还在 `node-assistant-ops.ts` 里**，运行时已无消费者（canvas_apply 走 v4 现算），是旧词表残留                                                                                                                                                                 | 进度表 57（清理旧助手）                        |
| 9   | ~~`project_script`（24）~~ **已落地**（2026-09-19，structure · confirm · inverse 只撤回本次新增）；`referenceSlots{role,url,cardId}` 的**形状与空态**随它一起落，投影按 `@角色` 开空位。**仍缺 `attach_card`（35）**：角色槽装填（卡片总线把角色卡的图与音色挂进来）还没有 op，空位今天只是空位             | 进度表 35                                      |
| 10  | **LoRA 域有回执、无「改」的三条旋钮**：`set_specs`（无清晰度控件）· `set_count`（单次出图）· `request_generation`（宿主无 `triggerGeneration`）三条域表缺席，比例这颗旋钮助手够不着                                                                                                                         | 进度表 34 / 45（控件或宿主契约先动）           |
| 11  | **配音间没有 op 表**：画板骨架注里写「LoRA 与配音间两张表随 34 / E10 再写」，而 owner 09-19 改口 —— 配音间不挂助手，这张表**不写**                                                                                                                                                                          | 已收口，无待办                                 |

---

## Source of Truth

- 工具词表与分组：`src/constants/assistant-operator.ts`（`ASSISTANT_OPERATOR_TOOL_IDS` · `ASSISTANT_OPERATOR_TOOLS` · `_READ_TOOLS` / `_MUTATING_TOOLS` / `_SPEND_TOOLS` · `ASSISTANT_OPERATOR_VERB_IDS` · `ASSISTANT_OPERATOR_TOOL_VERBS` · `ASSISTANT_OPERATOR_ENTRY_ACTIONS` · `ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN` · `ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN` · `ASSISTANT_OPERATOR_WRITE_MODES` · `ASSISTANT_OPERATOR_CANVAS_LIMITS`）
- 参数 / payload / inverse 的形状：`src/types/assistant-operator.ts`（`ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS` · `readStep` / `mutatingStep` / `spendStep` · `CANVAS_APPLY_OP_IDS`）
- 画布 op 真值表：`src/constants/node-assistant-ops.ts`（`NODE_ASSISTANT_OP_V4_IDS` · `NODE_ASSISTANT_OPS_V4` · `NODE_ASSISTANT_OP_V4_SPECS` · `NODE_ASSISTANT_OP_V4_GROUP_IDS` / `_TIER_IDS` · `NODE_ASSISTANT_SETTABLE_FIELDS`）
- 落地与撤销：`src/lib/studio-operator-apply.ts`（`applyOperatorStep` / `revertOperatorStep`）· `src/lib/node-assistant-op-apply-v4.ts`（画布执行器就地算 inverse）· `src/hooks/use-studio-operator-revert.ts`
- 落点词表：`src/constants/studio-assistant-operator.ts`（`STUDIO_OPERATOR_FIELD_IDS`）
- 回执与闪：`src/components/business/studio/assistant-operator/StudioOperatorCheckpointCard.tsx` · `src/constants/motion.ts`（`ASSISTANT_TOUCH_FLASH_MOTION`）· `src/app/canvas.css`（`.node-assistant-touched`）· `src/hooks/node/node-ingest-dom.ts` · `src/app/globals.css`（`.assistant-field-touched`）· `src/lib/studio-operator-flash.ts`
- 专属 chip 与渠道的派生源：`src/lib/model-capability-chips.ts`（11 那行 chip，`set_capability` 的键白名单）· `src/lib/group-models-for-picker.ts`（`foldChannels`，渠道身份）· `src/lib/resolve-model-channel.ts` + `src/lib/model-picker-gate.ts`（「先选渠道」那道闸）· `src/lib/studio-operator-snapshot.ts`（两节快照的构造）
- 宿主：`src/hooks/use-studio-workbench-operator-host.ts` · `src/hooks/use-lora-operator-host.ts` · `src/hooks/node/use-canvas-operator-host.ts` · `src/hooks/node/use-canvas-operator-requests.ts`
- 协议与页面基准：[`assistant-shell-v2.md`](assistant-shell-v2.md) · [`node-canvas-v2.md`](node-canvas-v2.md) §13 · [`lora-assistant.md`](lora-assistant.md)

## Last Verified

- **2026-09-19 · `project_script` 落地（进度表 24）**：§3 画布表补一行（structure · **confirm** · inverse = 批量 `delete`，**只撤回本次新增的那几面镜**），§3.1 从「待新增两行」缩成只剩 `attach_card`（35），§6 差距 9 标 24 那一半已落。点数因此由 `NODE_ASSISTANT_OPS_V4` **31 → 32**、`CANVAS_APPLY_OP_IDS` **27 → 28**；tier 非 free 的从两条变三条（`delete` / `project_script` 两条 confirm + `generate` hardConfirm），有测试锁住这张名单。细则以 [`node-canvas-v2.md` §12.1](node-canvas-v2.md) 为准，本文只摊 op 这一格。
- **2026-09-19 · 差距清单 1–4 落地（进度表 21 代码部分）**。四条各一个 commit：`set_capability`（专属 chip 值）· `unmount_reference`（摘一张）· `set_model` 带 `channelId`（渠道）· 工作台 / LoRA 字段 320ms 闪。工具表由 **42** 条变 **44** 条（`ASSISTANT_OPERATOR_TOOLS` 逐键点数，有测试锁住那个数），域表 image **30 → 32** · video **30 → 32**（各多 `set_capability` / `unmount_reference` 两条），lora **33** 与 canvas **24** 不动。⚠ 本节其余数字仍是本文建立那天的点数，⛔ 它们只用来对账，代码赢。
- ⚠ 落地时**没有改**的三处，如实记在这里：① 参考视频位仍摘不掉（快照那一节只给了个数，没给名单）；② 装配台那条参考轨没接 `unmount_reference`（宿主那只手归属另算）；③ 视频档没有专属 chip 行（那一行只在图片档渲染），所以 `set_capability` 在视频档一律 `noSuchControl` —— 形状与 `set_negative` 同源，补的是控件不是工具表。
- **2026-09-19 · 本文建立（进度表 21 spec）**。Method：逐键读上述常量文件点数 —— `ASSISTANT_OPERATOR_TOOLS` **42** 条（读 18 / 改动型 22 / 花钱 2）；域表 image **30** · video **30** · lora **33** · canvas **24**；`NODE_ASSISTANT_OPS_V4` **31** 条，`CANVAS_APPLY_OP_IDS` 现算得 **27** 条（31 − 读类 3 − `generate`），其中 tier 非 free 的只有 `delete`（confirm）与 `generate`（hardConfirm）。⚠ 这些数字是对账用的点数，不是规范；代码加一条而本文没跟上时，代码赢。
- 与画板 D7 ② 那张 12 行骨架的出入已逐条记在 §6：`set_capability` / `unmount` / `channelId` 三条**2026-09-19 已补齐**（此前骨架有而代码无）；`delete` 骨架写「不可逆」而代码给了 `inverse: add_node`（confirm 档、进 `CANVAS_APPLY_OP_IDS`）；`plan_rerun_downstream` 骨架与 `generate` 并列在「paid · 确认卡」而代码是 read / free；骨架的「现有 `NODE_ASSISTANT_AUTO_APPLY_OPS` 8 条」是 v3 残留，现行是 v4 的 31 条。
