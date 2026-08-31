# Fish Audio 接入审计 —— 代码对文档逐项（2026-08-30）

问题：这个项目的设计和 Fish 有没有对上？缺了什么？参数设得对不对？

对照的是
[Text-to-Speech 参数表](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)
与 [Emotion Control](https://docs.fish.audio/developer-guide/core-features/emotions)。
本文**不含听感判断**，只对代码与文档。

---

## 〇、先说结构：Fish 的请求体在**三个地方**各造一遍

| 路径   | 造 payload 的地方                                                            | 谁在用                                     |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------ |
| 同步   | `src/services/providers/fish-audio.adapter.ts` → `buildFishAudioRequestBody` | 没有 worker 可解析的 key 时                |
| Worker | `workers/execution/src/index.ts` → `buildFishAudioRequestBody`（**同名**）   | ⭐ **配音间、以及所有有 key 的 Fish 生成** |
| 队列   | `fal.adapter.ts` 的 `submitAudioToQueue`                                     | 与 Fish 无关（fal 专用）                   |

前两个是**近乎逐字的复制**。`canSubmitAudioViaExecutionWorker()` 只要有可解析的 key
就走 worker，所以**用户实际命中的几乎永远是 worker 那一份**——而两份已经漂了一个字段
（见第二节第 1 条）。

---

## 一、对上了的（不用动）

- **model header 是对的**。`getExecutionModelId()` 把 catalog key `fish-audio-s2-pro`
  换成 `externalModelId: 's2.1-pro-free'` 再放进 `model:` 请求头。这一条很关键：Fish 的
  **S1 用圆括号 `(happy)`、S2 用方括号 `[happy]`**，我们发的是方括号，与 S2 家族匹配。
- **枚举值逐个对得上文档**：
  | 参数 | 我们的常量 | 文档 |
  | --- | --- | --- |
  | `latency` | `['normal','balanced','low']` | low / balanced / normal ✓ |
  | `mp3_bitrate` | `[64,128,192]` | 64 / 128 / 192 ✓ |
  | `opus_bitrate` | `[-1000,24000,32000,48000,64000]` | -1000 / 24k / 32k / 48k / 64k ✓ |
  | `prosody.speed` | `AUDIO_PACE_SPEED` = 0.75 / 1 / 1.35 | 0.5–2.0 ✓ |
  | `temperature` | 0.5 / 0.7 / 0.9 | 0–1 ✓ |
  | `repetition_penalty` | schema 1–2 | 默认 1.2 ✓ |
  | `chunk_length` | schema 100–300 | 100–300 ✓ |
- **三种音色输入都覆盖**：`reference_id` 单值（音色卡）、`reference_id` 数组（多说话人）、
  `references[]`（零样本克隆的音频+文字对）。
- **端点分流正确**：要时间戳走 `/v1/tts/stream/with-timestamp`，否则 `/v1/tts`。

---

## 二、真 bug

### 1. ⭐ 表现力（克制/自然/戏剧化/自动）在 worker 路径上**完全失效**

`generate-audio.service.ts` 组 `providerInput` 时（约 1183 行）传的是：

```ts
temperature: request.temperature,   // ← 用户没在高级设置里手填就是 undefined
// 整个对象里**没有 expressiveness**
```

而 worker 的 `buildFishAudioRequestBody` 只有
`appendDefinedBodyValue(body, 'temperature', providerInput.temperature)`，
**不认识 expressiveness**，也不做任何映射。

对照同步路径（约 531 行）传的是 `expressiveness: resolveExpressivenessTier(request)`，
adapter 里再用 `EXPRESSIVENESS_TO_FISH_TEMPERATURE` 折算成温度——**那一份是对的**。

**后果**：配音间恒走 worker，所以参数面板里那四档表现力**点了等于没点**，
temperature 一律落到 Fish 默认 0.7。

⚠ **这同时更正我 08-30 早些时候的说法**：我说过「一带情感就把 temperature 拉到 0.9」，
那只在**同步路径**成立；配音间根本走不到那行代码。

⚠ 情感标记本身**不受影响**：`prompt: providerPrompt` 是在派发前就加工好的，
`[calm]` 这类标记正常到达 worker。丢的只有 temperature 这一路。

### 2. ⭐ 同一个请求体造两遍，已经在漂

第 1 条就是漂出来的结果。只要 Fish 加一个参数、或我们想调一个默认值，就得记得改两处；
漏一处的表现是「同一个功能在有 key / 没 key 时行为不同」，而这种差异极难被发现——
两条路平时都能出声。

---

## 三、与文档不符的用法（非 bug，但对不上）

| 位置                  | 现状                           | 文档                                                                                           |
| --------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `AUDIO_STYLE_PROMPTS` | `narrating` / `conversational` | 两个词在**任何一类标记里都没有**（基础情感 24 / 进阶 25 / 语气 6 / 音效 11 / 停顿 2 / 特效 3） |
| `applyPauseMarkers()` | 用 `\n\n` 表示停顿             | Fish 的停顿标记是 **`[break]` / `[long-break]`**；换行符不在任何一类里                         |

（`whispers` → `whispering` 已于今天改掉。）

---

## 四、Fish 有、我们从不发的参数

都有合理默认值，**不发不是 bug**，但其中两个是断句的直接旋钮：

| 参数                           | 默认 | 说明                         | 值不值得暴露                                            |
| ------------------------------ | ---- | ---------------------------- | ------------------------------------------------------- |
| `condition_on_previous_chunks` | true | 「用前一段音频保持音色一致」 | ⭐ 长文本被切成多段时，它决定段与段之间连不连得上       |
| `min_chunk_length`             | 50   | 分段前的最小字符数           | ⭐ 与 `chunk_length` 一起决定**在哪里切**，也就决定断句 |
| `max_new_tokens`               | 1024 | 每段最多多少音频 token       | 长句可能撞顶                                            |
| `early_stop_threshold`         | 1    | 批处理提前停止阈值           | 低                                                      |
| `features`                     | []   | 请求级 TTS 特性开关          | 未知，文档没展开                                        |

⚠ 一个观察：**配音间从不发 `chunk_length`**，所以走 Fish 默认 300。一条台词通常远短于
300 字，也就是**根本不会分段**——因此段间接缝**不是**配音间断句问题的成因。
这几个参数是给工作台的长文本准备的。

---

## 五、已执行（2026-08-30，owner：「对不上的退场，对上的补上」）

### 退场

| 退掉的           | 换成         | 依据                                                                                                                                    |
| ---------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `narrating`      | `soft tone`  | 语气与表达表里有；表里根本没有 narration 这一类，`soft tone`（gentle, quiet）最接近旁白那种收着讲，且与已被「平静」占用的 `calm` 分得开 |
| `conversational` | `relaxed`    | 基础情感表里有；表里没有 conversational，`relaxed` 是唯一对得上「日常放松地说」的词                                                     |
| `whispers`       | `whispering` | 语气与表达表的词形，`whispers` 任何一类都没有                                                                                           |

| 停顿用 `

`|`[break]`| 文档 Pause & Break Markers 只有`[break]`/`[long-break]`；换行符是我们自造的 |
| `applyPauseMarkers`的`trim().join(' ')`| 原样`join('')` | 它在中文句间凭空插空格（英文里看不出来）。同一条原则：别往用户的字里塞他没打的字符 |

### 补上

**表现力折算移到服务端**（`resolveFishTemperature`），`providerInput.temperature` 交的是
折算后的值。这修掉了第二节第 1 条那个 bug：此前 worker 路径上四档表现力完全失效。
选择在服务端折算而不是给 worker 加 `expressiveness` 字段，是为了让两条路一次对齐，
且不动 worker 契约。

### 锁住的回归

`generate-audio.service.test.ts` 新增四条：

- 表现力 `restrained` → worker payload `temperature: 0.5`
- 表现力 `auto` + 情感 → `temperature: 0.9`（与同步路径同一条推导）
- 中文停顿：`第一句。[break]第二句。[break]第三句。`（无空格）
- 旁白发的是 `[soft tone]` 而不是自造词

⚠ **前两条是这次最重要的锁**：那个 bug 从界面上完全看不出来（照样出声），
只有断言 payload 能发现。

---

## 六、还没做的

| 待办                                                           | 为什么                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 两份 payload 合成一份（adapter + worker）                      | 结构性重构，要动 worker，按 `docs/references/testing.md` 的 worker 契约保护。第二节第 2 条 |
| `condition_on_previous_chunks` / `min_chunk_length` 等暴露出来 | 都有合理默认值；且配音间不分段，用不到。属于工作台长文本的事                               |
| 「旁白 / 对话」换词之后到底像不像                              | ⚠ **只能听**。选词依据是文档词表，不是听感——音频长度指标的噪声底 ±7%，分辨不出选词差异     |
