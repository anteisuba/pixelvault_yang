# 音频域后续开发方向调研（2026-07-05）

> ⚠ **施工请读设计基准** [`audio-domain-design-2026-07.md`](audio-domain-design-2026-07.md)（同日晚出，合并本文 + 情绪专题 + owner 拍板）。本文保留为调研背景与来源。

> 调研范围：X（opencli twitter）、GitHub（opencli github-trending）、Hugging Face Hub、网页检索。
> 对象：`/studio/audio` 的后续开发方向。本文是方向调研，不是施工图；落地前按域拆任务包。
>
> 图解：[`svg/audio-direction-landscape.svg`](svg/audio-direction-landscape.svg)（生态地图）、[`svg/audio-direction-roadmap.svg`](svg/audio-direction-roadmap.svg)（方向优先级与路线）。

---

## 1. 现状快照（代码事实）

`/studio/audio` 目前是**纯 TTS 工作台**，挂在共享 workspace（`StudioModeSync mode="audio"`）：

| 能力         | 现状                                                                | 关键代码                                                           |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| TTS 模型     | Fish Audio s2-pro（cost 2）+ ElevenLabs v3（cost 5），仅 2 个       | `src/constants/models/audio.ts`                                    |
| 音色市场     | Fish Audio 公开库 + 我的音色                                        | `src/constants/voice-cards.ts`（provider: fish_audio / fal_f5tts） |
| 音色克隆     | VoiceTrainer，≤8 个文件、单文件 ≤10MB                               | `src/components/business/studio/VoiceTrainer.tsx`                  |
| 临时参考音频 | 上传 clip + transcript 即用（ad-hoc clone）                         | `StudioAudioParams` audioReference\*                               |
| 多说话人     | speakerVoiceIds ≤8（对话基础已有）                                  | `audio-options.ts` `AUDIO_SPEAKER_VOICE_IDS_MAX`                   |
| 风格/情绪    | 6 读法 chips + 3 真情绪（prompt 前缀实现）                          | `voice-cards.ts` AUDIO_STYLE / emotion                             |
| 高级参数     | format/sampleRate/bitrate/latency/temperature/topP/chunk/repetition | `StudioAudioParams.tsx`                                            |
| 画布联动     | voice→character 音色绑定、voice→video 旁白直连（cast 五卡重设计）   | `docs/design/reviews/2026-07-05-video-shot-cast-redesign.md`       |

**没有的**：音乐、音效/Foley、视频配音（video-to-audio）、播客式长音频成品、文字描述造音色（voice design）、转录/字幕、音频编辑。

## 2. 外部动向（调研结论）

### 2.1 TTS / 语音克隆：已 commoditize，差异化转向「表现力 + 音色设计」

- **开源克隆爆发**，X 上高互动帖直接喊 "ElevenLabs just lost its moat"（2026-06-01，1.1k likes）：3 秒克隆、本地跑、646 语言、MCP server、水印内置。对应 HF 上的 [k2-fsa/OmniVoice](https://hf.co/k2-fsa/OmniVoice)（2026-03，zero-shot clone + voice design，646 语言）。
- HF trending（2026-07）：[bosonai/higgs-tts-3-4b](https://hf.co/bosonai/higgs-tts-3-4b)（2026-06，controllable/expressive，趋势第一）、[openbmb/VoxCPM2](https://hf.co/openbmb/VoxCPM2)（2026-04，voice design + clone）、[Qwen3-TTS-12Hz-1.7B-CustomVoice](https://hf.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice)（2026-01，Apache）、[Supertone supertonic-3](https://hf.co/Supertone/supertonic-3)（端侧 ONNX）、[ResembleAI/chatterbox](https://hf.co/ResembleAI/chatterbox)（MIT，盲测多项胜 ElevenLabs）。
- **我们的供应商本身在开放**：[fishaudio/s2-pro](https://hf.co/fishaudio/s2-pro) 2026-03 已上 HF（instruction-following 标签）。ElevenLabs 的护城河收缩到 声学质量长尾 + 生态（agents/SFX/music）。
- 含义：**纯 TTS 不再是卖点**。价值上移到：音色资产管理（我们已有音色卡）、表现力控制（情绪/指令跟随）、以及音色作为跨模态身份（我们画布已把音色当角色身份单元——方向对了）。

### 2.2 音乐生成：商用许可分层清晰，直连 API 只有一家最稳

- [Suno v5 质量领先](https://www.teamday.ai/blog/best-ai-music-models-2026)但**无官方 API**（RIAA 诉讼 2025 底与大厂和解）；第三方转售 API 灰色。
- [ElevenLabs Music](https://elevenlabs.io/music-api)（2025-08 上线）：**训练数据带授权、商用安全、官方 API**（约 $0.80/min）。我们已有 ElevenLabs adapter，直连成本最低（符合「优先直连官方 API」）。
- [MiniMax Music 2.5](https://fal.ai/learn/tools/ai-music-generators)（2026-01 加人声）：API 便宜（~$0.035/曲 via fal），但走 fal（备选）。
- 开源：[ACE-Step 1.5](https://hf.co/ACE-Step/Ace-Step1.5)（2026-01，MIT，text2music）、[Stable Audio 3 medium](https://hf.co/stabilityai/stable-audio-3-medium)（2026-05，music+SFX）、[google/magenta-realtime-2](https://hf.co/google/magenta-realtime-2)（2026-05，实时 jam）——远期可走 RUNNER 插座。

### 2.3 音效 / Foley / 视频配音：与视频管线强耦合，是画布的直接补口

- [ElevenLabs SFX V2](https://elevenlabs.io/docs/overview/capabilities/sound-effects)（2025-09）：48kHz、≤30s、无缝 loop、单端点 API（`POST /v1/sound-generation`，一次返回多变体 WAV）。
- [ElevenLabs Video-to-Sound](https://elevenlabs.io/blog/how-to-add-sound-effects-to-your-video-with-elevenlabs-video-to-sound-generator)（2026-03 更新）：上传视频逐帧视觉分析 → 自动生成匹配音效。
- **视频模型原生带音轨已成默认**：Veo 3.1 / Seedance 2.0 一次生成同步音频；[LTX-2.3](https://hf.co/Lightricks/LTX-2.3)（2026-03 开源）直接标 text-to-audio-video / video-to-audio 全家桶。
- 含义：竞品（[Krea 靠 Gaga AI 补音频层](https://www.gstory.ai/blog/krea-ai/)、[OpenArt 已有 AI Music + AI Voice](https://openart.ai/blog/best-ai-generators/)）都把音频做成**视频工作流的配套层**，而不是孤立 surface。我们画布的「动作/场景卡」天然缺声音层。

### 2.4 播客 / 长音频：NotebookLM 定义了品类，开源已跟上

- NotebookLM Audio Overview：80+ 语言、4 种形态（Deep Dive/Brief/Critique/Debate）、可中途插话。
- [open-notebook](https://github.com/lfnovo/open-notebook)（34.9k stars，GitHub 月度 trending）：开源实现，多 LLM + 多 TTS provider 的**剧本→多说话人合成**管线。
- 含义：技术上就是「LLM 出对话稿 + 多音色 TTS 拼接」。我们两块积木都有：多说话人 voiceIds（≤8）+ 画布的两阶段剧本引擎（outline→shots 的 script-doc 模式可平移成 outline→dialogue）。

## 3. 方向盘点与优先级

按「复用现有管线的程度 × 对整体产品（画布视频主线）的加成」排序：

### D1 音效生成（SFX）— P0

- **接法**：ElevenLabs SFX V2，adapter 已存在（`elevenlabs.adapter.ts` 加端点），credit/R2/重试管线全复用。
- **价值**:独立 surface（prompt→音效，多变体出纸与图片模式同构）+ 画布场景/动作卡的声音层入口。
- **建模要点**：不要新造 outputType；AUDIO 内加 **`audioKind: 'speech' | 'sfx' | 'music'` 能力属性**（呼应「属性别编码成节点类型」原则），`AUDIO_MODEL_OPTIONS` 按 kind 过滤。

### D2 音乐生成 — P0（与 D1 同批建模、可分批上）

- **接法**：ElevenLabs Music API 直连（商用许可最干净、同一 adapter 家族）；MiniMax Music 2.5 作第二模型（走火山/fal 视可用性）。
- **价值**：补齐「图/视频/音频」三模态里音频的另一半；视频 BGM 直接喂画布。
- **风险**：成本高（$0.80/min）→ credit 定价要拉开；先短时长（≤60s）。

### D3 播客 / 对话长音频 — P1

- **接法**：复用两阶段剧本引擎（大纲→对话稿两道门）+ 现有多说话人 voiceIds + 音色卡。新增一个「对话稿→分段合成→拼接」的编排 service（确定性代码，不是 LLM 判断）。
- **价值**：把「音色资产 + 剧本脑」两个既有强项拧成一个成品化输出；NotebookLM 式品类已被验证。
- **前置**：分段合成的进度/失败恢复（长任务），与 video 轮询同构。

### D4 Voice Design（文字描述造音色）— P1.5

- **接法**：ElevenLabs voice design API 已有；开源 OmniVoice/VoxCPM2 证明能力普及。产出物直接落**音色卡**（资产模型不变，多一个来源=designed）。
- **价值**：音色卡家族补「无样本造声」入口；画布角色卡（脸+音色身份单元）多一条供给线。

### D5 视频配音（video-to-audio）— P2

- **接法**：ElevenLabs video-to-sound；挂画布视频节点的后处理（生成完的视频一键补音效层）。
- **注意**：Seedance/Veo 原生音轨普及后价值收窄，定位是「给无声/替换音轨的补救」，不做主路径。

### D6 转录/字幕 — P2（工具位）

- 服务画布（参考视频→动作描述）与音频详情页（歌词/文稿展示），不做独立 surface。

### 明确不做（现在）

- **实时对话 voice agents**：与「个人 AI 画廊 + 归档」产品定位错位，管线（WebRTC/流式）完全另起炉灶。
- **DAW 式音频编辑**：重编辑器投入，竞品也没在聚合平台里做成。

## 4. 架构落点（先建模后动工）

1. **`audioKind` 是属性不是新类型**：`ModelOption` 加 kind 字段（Zod schema 同步），Studio audio 模式内做 语音/音效/音乐 切换（chips 或 segmented），不拆新路由、不拆新 mode。
2. **音色卡是跨方向资产**：D3/D4 都往 voice-cards 里汇，provider 枚举扩展（designed 来源），不另造库。
3. **画布联动走已有端口语义**：SFX/音乐产物 = 音频资产，可被 video 节点作为音轨引用（与旁白 voice→video 同构）。
4. **i18n 三语同步 + QuickSetupDialog**：新模型照 add-model checklist；缺 ElevenLabs key 时路由 QuickSetupDialog（Hard Rule 8）。

## 5. 专题：情绪控制为什么无感、应该怎么做（2026-07-05 追加）

> 触发：owner 反馈「情绪选项有，但生成出来听不出区别」。
> 图解：[`svg/audio-emotion-control-stack.svg`](svg/audio-emotion-control-stack.svg)。

### 5.1 根因诊断（代码事实）

现有"情绪"链路的全部实现 = 把一个英文短语拼到全文最前面：

```
applyAudioStylePrompt() → `[calm and steady] ${prompt}`   // generate-audio.service.ts:280
```

五个叠加的原因导致听不出区别：

1. **注入点错**：唯一注入点是全文开头一枚全局前缀。两家模型的情绪机制都是**行内、位置跟随**的标记——Fish 官方文档明说句级 cue 放"每句句首"效果最好，v3 要求 tag 紧贴被修饰片段。一个开头标签对后面几百字的影响快速衰减。
2. **ElevenLabs 表现力被参数压死**：adapter 硬编码 `stability: 0.5`、`style: 0`（`elevenlabs.adapter.ts:29-31`）。v3 对 tag 的响应度由 stability 三档决定（Creative 0.0 / Natural 0.5 / Robust 1.0），Robust 档"基本不理 tag"，Natural 居中；想听出情绪要 Creative。UI 的 temperature/topP 等滑块只对 Fish 生效，ElevenLabs 一个都没接。
3. **词表弱**：`'calm and steady'`、`'natural character dialogue'` 是读法描述，不是两家训练语料里的强情绪词。规范词是 `[excited]` `[whispers]` `[angry]` `[sobbing]` 这类；我们的 whisper 写成 `'whisper softly'`，v3 规范 tag 是 `[whispers]`。
4. **音色天花板**：情绪上限由音色本身决定（v3 文档原话：别指望悄悄话音色能 `[shout]`）。默认 Rachel / 平直朗读克隆的参考音频，怎么标都平。
5. **没有对照**：单次生成无 A/B，10–20% 的差异人耳记不住，感知上就是"没区别"。

### 5.2 机制 ground truth（两家官方）

|            | Fish s2-pro                                                                 | Eleven v3                                                                         |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 语法       | `[bracket]` 行内标记（S1 旧版是圆括号）                                     | `[audio tags]` 行内标记                                                           |
| 词表       | **自由自然语言**，15k+ 标签，支持程度副词 `[slightly sad]` `[very excited]` | 推荐词表（[laughs]/[whispers]/[sighs]/[sarcastic]/[excited]/[crying]…）+ 鼓励实验 |
| 位置       | 句级放句首；词级 `[emphasis]` 放词前；可叠 `[sad][whispering]`              | 紧贴被修饰片段之前/之后                                                           |
| 响应度旋钮 | temperature（已暴露）                                                       | stability 三档：Creative（最有表现力，会飘）/ Natural / Robust（几乎不理 tag）    |
| 音效       | `[laughing]` `[sighing]` `[gasping]` 等 11 种                               | `[gunshot]` `[applause]` 等                                                       |
| 其他杠杆   | 参考音频自带情绪基调                                                        | 标点（省略号=停顿）、大写=强调、音色选择决定上限                                  |

**关键结论**：两家在行内 `[tag]` 语法上收敛了 → 可以做**统一内部表示（span 标注）+ 编译期按 provider 映射词表**，与画布 cinematic-grammar / token 的思路同构。

### 5.3 方案：四层控制栈

- **L0 音色上限（地基）**：音色卡补"情绪范围"元数据；克隆训练引导用户上传有起伏的样本；把已有的 ad-hoc 参考音频明确定位出"情绪参考（emotion donor）"用法，不只是音色。
- **L1 表现力参数（响应度）**：包装成一个统一的「表现力」三档旋钮（克制/自然/戏剧化），各 adapter 自行编译——v3 映射 stability 1.0/0.5/0.0，Fish 映射 temperature 低/中/高。不让用户学两套厂商参数。ElevenLabs 默认档从硬编码 Natural 改为可选、且情绪场景默认 Creative（拍板点）。
- **L2 行内情绪标记（核心层）**：情绪 chips 从"全局单选"改成"光标/选区插入器"——选中一段文本点 chip = 插入 `[excited]` 内联 token（可删、可视化，复用 video cast S2 的 mention-input contentEditable 原子 token 方案，同一套交互语言）。存储用文本内嵌 `[tag]`（所见即所存）；编译时 Fish 原样透传（自由词表），v3 走白名单映射 + 校验（进 prompt-guard 家族）。现有全局 chips 保留为"基调"，编译时改成**逐句句首**注入而非全文一次。
- **L3 情绪导演（LLM 自动标注）**：一键"标注情绪"——台词交给文本模型（画布 assistant 路由已有），按上下文自动插 tag，`llm-output-validator` 校验"只加标记、不改词"。与 D3 播客直接复利：对话稿生成时就带情绪标注。
- **配套：A/B 试听**：同文本 2–4 个情绪变体并排出纸（复用图片多 variant 交互）。没有对照就没有感知。

### 5.4 落地切片

| 切片                 | 内容                                                                                                                            | 量级                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| S1 参数修复 + 强词表 | v3 stability 三档暴露、默认改 Creative/Natural；`AUDIO_STYLE_PROMPTS` 换规范强词（whisper→`[whispers]` 等）；全局基调改逐句注入 | 小（当天可听出区别） |
| S2 行内 token 插入   | 选区/光标插 tag UI + per-provider 编译映射 + 校验                                                                               | 中                   |
| S3 情绪导演 + A/B    | LLM 标注 pass + 多变体对照出纸                                                                                                  | 中                   |
| S4 音色层经营        | 情绪参考 donor、克隆引导、音色卡情绪范围                                                                                        | 中偏小               |

验证口径（S1 后）：同音色同文本，跑 `无标记` vs `[excited]`（v3 Creative 档）vs `[sobbing][whispering]`（Fish）三件并听——应有明显可辨差异；听不出即回查编译产物里 tag 是否真的进了正文/参数是否真的下发。

## 6. 调研来源

- X（opencli twitter search ×2）：开源克隆冲击帖（2026-06-01）、ElevenLabs/SarvamAI/xai 官方帖脉络。
- GitHub（opencli github-trending ×1）：open-notebook 月度上榜。
- HF Hub（hub_repo_search ×2）：text-to-speech / text-to-audio trending 榜单（本文 §2 各模型链接）。
- 网页（WebSearch ×4）：
  - [Suno vs Udio vs ElevenLabs Music 2026](https://www.aimagicx.com/blog/suno-vs-udio-vs-elevenlabs-music-comparison-2026)、[Best AI Music Models 2026](https://www.teamday.ai/blog/best-ai-music-models-2026)、[fal: AI music generators](https://fal.ai/learn/tools/ai-music-generators)、[Eleven Music API](https://elevenlabs.io/music-api)
  - [ElevenLabs SFX 文档](https://elevenlabs.io/docs/overview/capabilities/sound-effects)、[Video-to-Sound](https://elevenlabs.io/blog/how-to-add-sound-effects-to-your-video-with-elevenlabs-video-to-sound-generator)、[Tom's Guide 实测](https://www.tomsguide.com/ai/i-tried-the-new-elevenlabs-video-to-sound-effects-demo-and-its-pretty-amazing)
  - [OpenArt 音频布局](https://openart.ai/blog/best-ai-generators/)、[Krea 2026 review](https://www.gstory.ai/blog/krea-ai/)
  - [open-notebook](https://github.com/lfnovo/open-notebook)、[NotebookLM alternatives 2026](https://www.atlasworkspace.ai/blog/notebooklm-audio-alternatives)、[awesome-ai-voice](https://github.com/wildminder/awesome-ai-voice)
  - 情绪专题：[Fish Audio Emotion Control](https://docs.fish.audio/developer-guide/core-features/emotions)、[Fish S2 word-level control](https://fish.audio/blog/fish-audio-s2-fine-grained-ai-voice-control-at-the-word-level/)、[ElevenLabs v3 audio tags](https://elevenlabs.io/blog/v3-audiotags)、[v3 best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)、[audio tags 帮助文档](https://help.elevenlabs.io/hc/en-us/articles/35869142561297-How-do-audio-tags-work-with-Eleven-v3)
- 已跳过：grok（未登录不可用）、gh CLI（本机未安装）。
