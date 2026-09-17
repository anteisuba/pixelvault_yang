CDP 不可用（Chrome 调试授权超时），改用 WebFetch + r.jina.ai 直取火山引擎官方文档，以下每条均来自一手文档。

---

# 豆包语音合成 2.0 + 声音复刻 2.0 — API 契约调研

## 1. 鉴权与开通

- **新版控制台单头鉴权**：`X-Api-Key`（控制台 > API Key 管理获取）+ `X-Api-Resource-Id` + `X-Api-Request-Id`(uuid)。旧版控制台是 `X-Api-App-Id` + `X-Api-Access-Key` 双头，官方明示"后续下线，建议尽快切换"。BYOK 只需存一个 API Key，不需要 appid。（[音频生成HTTP](https://www.volcengine.com/docs/6561/2550782)、[单向流式WS](https://www.volcengine.com/docs/6561/2534913)）
- **Resource-Id 同时决定模型与计费口径**：`seed-tts-2.0`（官方音色）/ `seed-icl-2.0`（复刻音色）；1.0 为 `seed-tts-1.0`、`seed-icl-1.0(-concurr)`。（[WS双向V3](https://www.volcengine.com/docs/6561/1329505)）
- **需开通**：控制台「开通管理」勾选 _豆包语音合成模型2.0_、_豆包声音复刻模型2.0_；后付费复刻音色还要**单独开通后付费音色服务**。（[下单及使用指南](https://www.volcengine.com/docs/6561/1167802)）
- 个人账号是否可开通：**未核实**（文档未限制，但实名/企业认证要求未在文档中找到）。

## 2. 两条协议

**HTTP（Chunked 单向流式）** `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`
请求体 `{"req_params":{text, speaker, model?, ssml?, audio_params{format,sample_rate,bit_rate,speech_rate,loudness_rate,enable_subtitle}, additions{...}}}`。每个 chunk 是一行 JSON：`{code, message, data(base64 音频片段), sentence{words[{word,startTime,endTime,confidence}]}, usage{text_words}}`。（[2528925](https://www.volcengine.com/docs/6561/2528925)）

**一次性非流式** 另有 `POST /api/v3/tts/create`（model=`seed-audio-1.0`，音频生成模型），返回 `{audio(base64), url(2h有效), duration, original_duration(计费依据，上限120秒), subtitle}`；这条是**按分钟计费**的另一条产品线，字段是 `text_prompt` + `references`，不是 TTS 2.0 的 speaker/text 体系——不要混用。（[2550782](https://www.volcengine.com/docs/6561/2550782)）

**WebSocket 单向流式** `wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream`，请求体同上。
事件：`TTSSentenceStart` → `TTSResponse`(音频) → `TTSSentenceEnd` → `TTSSubtitle` → `SessionFinished`(带 `usage.text_words`)。MsgType 两类：`FullServerResponse` / `AudioOnlyServer`。
**二进制帧**：≥4 字节可变 header + payload size + payload。byte0 高4位 protocol version(`0b0001`)、低4位 header size(`0b0001`)；byte1 高4位 message type（`0b0001` full-client request / `0b1001` full-server response / `0b1011` audio-only）低4位 flags(`0b0100`=带 event number)；byte2 高4位序列化（0=Raw，1=JSON）低4位压缩（0=无，1=gzip）；byte3 保留；byte4~7 可选 event number / connect id / session id。（[2534913](https://www.volcengine.com/docs/6561/2534913)、[1329505](https://www.volcengine.com/docs/6561/1329505)）

## 3. 指令式情感控制（关键）

三种机制，**都是独立字段，不是写进 text**：

1. **`additions.context_texts`（string list）** — 自然语言语音指令，如 `["你可以用特别特别痛心的语气说话吗?"]`。**当前只有列表第一个值生效**；**该字段不参与计费**。同一字段也用于"引用上文"（传对话上文让模型承接语境情绪）。仅 TTS 2.0 官方音色 + 复刻2.0**表现力增强版**支持；**speaker 为复刻音色且指定了 `model` 参数时不支持 context_texts**。
2. **`additions.use_tag_parser: true`** — 开启后 text 内可写行内 COT 标签：`<cot text=急促难耐>…</cot>`，可多组，作用域为单句，**单句 text 建议 <64 字符（含标签）**。仅复刻 2.0 表现力增强版。
3. **`ssml`** — 传 SSML 标记文本（[SSML 规则 1330194](https://www.volcengine.com/docs/6561/1330194)），仅中英文音色；需 `disable_markdown_filter=false`；与发音词典 `pronunciation_dict` 互斥（同时用时 SSML 失效）。

另有 1.0 时代的 `audio_params.emotion` + `emotion_scale`(1~5，默认4)，仅部分音色支持，**2.0 已被 context_texts 取代**。
**文本长度上限**：TTS 2.0 单次 text 的硬上限**未核实**（文档未列出；WS 双向流式文档只说"会处理过长文本并自动分句"）。

## 4. 音色

[音色列表 1257544](https://www.volcengine.com/docs/6561/1257544) 是唯一权威表，无公开 REST 列表接口（控制台侧有 `ListSpeakers` OpenAPI，需火山签名鉴权，[2160690](https://www.volcengine.com/docs/6561/2160690)）。ID 规律：`{语种}_{性别}_{名字拼音}_{代次}_bigtts`，2.0 代次标记为 **`uranus`**（如 `zh_female_vv_uranus_bigtts`、`en_male_tim_uranus_bigtts`）；1.0 为 `moon/mars/...` 等行星名。该页 2.0 中外文音色 244 条含 `uranus_bigtts`。方言通过 `additions.explicit_dialect` 指定（beijing/dongbei/henan/shaanxi/shanghai/sichuan/tianjin/yue），语种通过 `explicit_language`（20 种）。

## 5. 声音复刻 2.0

- **训练** `POST /api/v3/tts/voice_clone`（V3，头：`X-Api-Key` + `X-Api-Request-Id`）。体：`speaker_id`（控制台预分配 `S_xxx`；后付费可用 `custom_speaker_id` 自定义 8~256 字符）、`audio{data(base64), format}`、`text`（对读文本，差异大报 45001109 WERError）、`language`(0~21)、`extra_params{demo_text(4~300字), enable_audio_denoise, disable_volume_normalization}`。
- **样本**：wav/mp3/ogg/m4a/aac/pcm（pcm 仅 24k 单声道），**单文件 ≤10MB，每次 1 个文件**；官方宣称 5 秒即可复刻（时长下限文档未硬性规定，**未核实**）。
- **返回** `{status(0未找到/1训练中/2成功/3失败/4已激活), speaker_id, available_training_times, speaker_status[{model_type, demo_audio(1小时有效)}]}`。**复刻2.0 → model_type=5**；status=2 或 4 即可合成。
- **用于合成**：把 `speaker_id` 填进 `req_params.speaker`，Resource-Id 换成 `seed-icl-2.0`；可选 `additions.tone_fidelity=true` 还原训练音频的口音/韵律（仅同语种、不支持双向流）。
- **上限**：预付费音色**每个 15 次训练**，启用后不可再训；后付费音色**首次合成即固定且收槽位费**，试听 7 天未调用自动删除。账号级音色总数无上限，按槽位购买。
- 旧的 V1 `POST /api/v1/mega_tts/audio/upload`（`Authorization: Bearer;{token}` + `Resource-Id`）已标"不再迭代"，勿接。（[2534906](https://www.volcengine.com/docs/6561/2534906)、[1305191](https://www.volcengine.com/docs/6561/1305191)）

## 6. 计费（[1359370](https://www.volcengine.com/docs/6561/1359370)）

「¥5/万字符」是**旧的「大模型语音合成」后付费价**。2.0 新品线：

| 项                              | 后付费          | 预付费资源包（1年）                                                         |
| ------------------------------- | --------------- | --------------------------------------------------------------------------- |
| 豆包语音合成2.0                 | **3 元/万字符** | 10万字 28元(2.8) → 2000万字 5400元(2.7) → 2亿 48000(2.4) → 20亿 420000(2.1) |
| 豆包声音复刻2.0                 | **3 元/万字符** | 同上阶梯                                                                    |
| 旧「大模型语音合成 / 声音复刻」 | 5 / 8 元/万字符 | 4.5 / 7.5 元起                                                              |

**音色槽位**：预付费 138元/音色（0~50档），阶梯降至 28元（5001~10000）；后付费 138元/音色无阶梯。
**并发**：2.0 合成与复刻正式版**默认 10 并发**，增购 100 元/并发/月。
**免费额度**：官方计费文档未给出 TTS 免费额度口径（二手来源称新用户赠 2 万字符/15 次训练，与旧版控制台文案"免费赠送音色，15次训练 + 2万字符合成"一致，但未在计费文档中确认——**部分未核实**）。计费字符含标点，以 `usage.text_words` 为准。

## 7. Fish S2.1-Pro → 豆包字段映射

| PixelVault / Fish 概念       | 豆包 2.0 写法                                             | 说明                                                                             |
| ---------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| model `s2.1-pro`             | header `X-Api-Resource-Id: seed-tts-2.0` / `seed-icl-2.0` | 模型选择在 header 不在 body                                                      |
| `text`                       | `req_params.text`                                         | —                                                                                |
| `reference_id`(音色)         | `req_params.speaker`                                      | 官方音色名 vs `S_xxx`                                                            |
| `references[]`(即时参考音频) | **不支持**                                                | 豆包必须先训练成音色；即时参考只在 `/tts/create`(seed-audio-1.0，按分钟计费)存在 |
| L1 三档表现力（低/中/高）    | 编译成 `additions.context_texts[0]` 一句中文指令          | 建三档 prompt 模板；复刻音色需用表现力增强版且**不能同时传 `model`**             |
| L2 行内 `[bracket]` 标记     | `additions.use_tag_parser=true` + `<cot text=…>…</cot>`   | 需重写标记语法；单句含标签 <64 字符，须先按句切分                                |
| `prosody.speed`              | `audio_params.speech_rate` [-50,100]                      | 100=2x，-50=0.5x                                                                 |
| `prosody.volume`             | `audio_params.loudness_rate` [-50,100]                    | —                                                                                |
| pitch                        | `req_params.post_process.pitch` [-12,12]                  | Fish 无对应，默认 0                                                              |
| `format`/`mp3_bitrate`       | `audio_params.format` + `bit_rate`                        | 流式建议 pcm；mp3 务必显式传 bit_rate，默认值实为 8k 会明显掉音质                |
| `chunk_length` / `latency`   | 无                                                        | 服务端自动分句                                                                   |
| `temperature`/`top_p`        | **不支持**                                                | 丢弃                                                                             |
| 时间戳/字幕                  | `audio_params.enable_subtitle=true` → `words[]`           | 仅中英                                                                           |
| 多轮语境                     | `additions.section_id`(uuid)                              | Fish 无                                                                          |

**豆包不吃的**：即时参考音频、采样参数、Fish 的 bracket 语法、任意长文本一次性提交。**必须新增的编译层**：L1→context_texts 中文指令模板、L2→`<cot>` 标签 + 单句 ≤64 字符切分、参考音频→走一次复刻训练拿 `S_xxx` 再合成。
