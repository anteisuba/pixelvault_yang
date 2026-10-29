## 人声提取（Vocal Separation）调研

### 1. 云端 API 对照表

| 方案                                | 端点 / 形态                                                      | 价格（一手）                                                                                               | 时长上限                                        | stem 粒度                                                  | 延迟                                       | 一手 URL                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **ElevenLabs Voice Isolator**       | `POST /v1/audio-isolation`，multipart `audio`                    | 1000 credits/分钟（Creator $22/100k credits ≈ **$0.22/min**，档位越高越便宜）                              | **1 小时 / 500MB**，直接吃视频（mp4/mov/webm…） | **只有 2 路语义**：干净人声 vs 去掉的噪声，不分 drums/bass | 同步返回，秒级～十几秒（未核实官方 SLA）   | [docs](https://elevenlabs.io/docs/capabilities/voice-isolator) · [API](https://elevenlabs.io/docs/api-reference/audio-isolation/convert) |
| **fal.ai `fal-ai/demucs`**          | `fal-ai/demucs` queue API                                        | **$0.0007 / 秒处理时长**（≈ 一首 4 分钟曲 $0.02 量级）                                                     | 未标注                                          | vocals / drums / bass / other (+guitar/piano)              | GPU 推理，数十秒                           | [model](https://fal.ai/models/fal-ai/demucs)                                                                                             |
| **Replicate `cjwbw/demucs`**        | Replicate predictions API                                        | **≈$0.018/run**（T4，典型 82s）                                                                            | 未标注                                          | 4 stem / 6 stem，可选 `htdemucs_ft`                        | ~80s（T4 偏慢）                            | [replicate](https://replicate.com/cjwbw/demucs)                                                                                          |
| **Replicate BS-RoFormer / MDX-Net** | —                                                                | **未核实**：官方检索没找到稳定维护的 BS-RoFormer 官方模型页，只有社区打包（如 `all-in-one-audio`）         | —                                               | —                                                          | —                                          | [collection](https://replicate.com/collections/ai-enhance-audio)                                                                         |
| **LALAL.AI**                        | REST API（仅 Pro 档开放）                                        | 充值包 **750min/$50 ≈ $0.067/min**；计费 = 时长 × stem 类型数                                              | 上传 2GB（Pro）                                 | vocals/instrumental + drums/bass/piano 等多 stem           | 分 Fast / Relaxed 队列，Relaxed 排队不保证 | [api](https://www.lalal.ai/api/) · [pricing](https://www.lalal.ai/pricing/)                                                              |
| **Moises → Music.ai**               | `developer.moises.ai` 已 301 到 `music.ai`，走 Music AI 模块计费 | **Vocals stem $0.07/min**、Instrumental $0.05/min、影视 Dialogue/Music/FX $0.05/min；Pro $25/月含 $25 额度 | 未标注                                          | 模块化，按 stem 单独计费                                   | 异步 job，PAYG 并发 2                      | [pricing](https://music.ai/pricing/)                                                                                                     |
| **AudioShake**                      | 企业 API / SDK                                                   | **未核实**（官网不公开价，二手说法「按分钟、量大有折扣」）                                                 | 未核实                                          | vocals/lead+backing、影视对白等                            | 未核实                                     | [audioshake](https://www.audioshake.ai/products/sdk)                                                                                     |

要点：**ElevenLabs 是唯一原生吃视频文件、且已在你 adapter 里的**，但它是「语音增强/隔离」，不给伴奏轨——用途②（保留背景音换配音）拿不到背景轨，只能用「原轨 − 人声」近似。Music.ai 的 Vocals + Instrumental 两次调用 $0.12/min 才是真正的双轨方案。

### 2. 自托管开源模型

| 模型                            | vocals SDR                                                           | 显存                                | 4 分钟曲在 24G                                                                                    | 许可                                                                        | 现成封装                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Demucs v4 htdemucs_ft**       | MUSDB HQ **9.0 dB**（稀疏注意力版 9.20）                             | 最低 3GB，默认约 7GB RAM            | GPU 上远快于 CPU（CPU ≈ 1.5× 时长，ft 再 ×4 → CPU 约 24 min）；GPU 秒级～1 分钟，**精确值未核实** | **MIT，可商用**                                                             | [adefossez/demucs](https://github.com/adefossez/demucs)、fal/Replicate 均有                                            |
| **BS-RoFormer (viperx ep_317)** | MVSEP multisong 榜首梯队 **12.3 dB**（MVSep 自训 124-band 版 12.33） | 639MB 权重，fp16 可跑；24G 绰绰有余 | 未核实                                                                                            | ⚠️ **架构 MIT，但 viperx 权重无 LICENSE、源自 Boosty 付费分发，无商用授权** | [MVSEP 榜](https://mvsep.com/quality_checker/multisong_leaderboard?sort=vocals)                                        |
| **Mel-Band RoFormer / MDX23C**  | 介于二者之间（MVSEP 榜未进前 4，具体值未核实）                       | 同上                                | 未核实                                                                                            | 训练代码 MIT，权重逐个看                                                    | [ZFTurbo MSST](https://github.com/ZFTurbo/Music-Source-Separation-Training)（`pip install msst`）                      |
| **UVR5 权重集合**               | 覆盖 46+ 模型                                                        | —                                   | —                                                                                                 | 代码 MIT，**要求署名 UVR**；单个权重许可各异                                | [python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator)（CLI + Python + GPU/CPU Docker 镜像） |

**RunPod / ComfyUI**：`python-audio-separator` 有官方 GPU Docker 镜像，社区还有现成的 [RunPod serverless CUDA12 Dockerfile](https://gist.github.com/beveradb/b54129b847a7fc319d98a95d8c132960)（作者即该库作者），是你 24G worker 最省事的落法。ComfyUI 侧有 [ComfyUI-AudioSeparator](https://github.com/ddontsov93/ComfyUI-AudioSeparator)（包 UVR5 CLI）和 [set-soft/AudioSeparation](https://github.com/set-soft/AudioSeparation)（46 模型，MDX+Demucs）。

### 3. 视频输入链路

没有真正的「一体化」开源方案，标准三步（ElevenLabs 是唯一能跳过第 1 步的云端）：

1. `ffmpeg -i in.mp4 -vn -ac 2 -ar 44100 audio.wav`（分离器要 44.1k 立体声；ASR 那路再降到 16k 单声道）
2. 分离 → `vocals.wav` + `no_vocals.wav`（Demucs 直接输出 `--two-stems=vocals`）
3. 回填：`ffmpeg -i in.mp4 -i new_vocal.wav -i no_vocals.wav -filter_complex amix` 或作双音轨 `-map` 封装，保留原视频流 `-c:v copy`

配音场景注意：背景轨保留原响度，人声轨需对齐时间码（TTS 时长漂移要么变速要么重新对齐字幕时间轴）。

### 4. 后续链路

- **喂 Fish Audio 复刻**：官方要求 ≥10 秒，**建议 1–2 分钟清晰单说话人**；格式 wav/mp3/m4a/opus，**mono 最佳**，避免背景音乐/混响/多人重叠；默认开 `enhance_audio_quality` 降噪归一，录音棚素材可关（[fish docs](https://docs.fish.audio/developer-guide/sdk-guide/javascript/voice-cloning)）。分离出的人声先做 VAD 切段 + 说话人聚类，再挑单说话人段落拼 60–90 秒。豆包（volcengine adapter 已有）具体样本要求**未核实**。
- **人声转文字**：Whisper large-v3（1550M，**Apache-2.0**，输入必须 16kHz，30s 感受野、`chunk_length_s` 做长音频分块，[HF](https://huggingface.co/openai/whisper-large-v3)）跑在同一块 24G worker 上最省；要说话人分离/中英混排质量再上 Gemini 原生音频（你已有 gemini adapter，零额外接入成本）。

### 5. 推荐

- **云端默认（BYOK）**：分两个用途走两条路。
  ①③ 只要人声 → **ElevenLabs Voice Isolator**，adapter 已在、原生吃视频、一次调用，$0.22/min。
  ② 要人声 + 背景双轨 → **fal.ai demucs**（adapter 已在，$0.0007/s，4 分钟素材约 $0.02，成本比 ElevenLabs 低一个数量级且直接给 4 stem）。Music.ai/LALAL 不建议新接，边际收益不抵一个新 adapter 的维护成本。
- **自托管备档**：RunPod 24G worker 上跑 `python-audio-separator` + **htdemucs_ft（MIT，可商用）**；BS-RoFormer 质量更高（12.3 vs 9.0 SDR）但 **viperx 权重无商用许可，不要进产品线**，只能作内部实验或等 MIT 授权的 RoFormer 权重。
- **每分钟成本估算**：ElevenLabs $0.22 · fal demucs ≈ **$0.005–0.01/min**（按 GPU 秒计） · Replicate ≈ $0.0045/min（$0.018 / 4 min）· Music.ai 双轨 $0.12 · LALAL $0.067×stem 数 · 自托管 24G 卡时价 ÷ 吞吐（htdemucs_ft GPU 上通常 ≫ 实时，**具体秒数未核实，需实测**）。

**未核实项**：Replicate 上的 BS-RoFormer/MDX-Net 官方模型页、AudioShake 公开价、Mel-Band RoFormer/MDX23C 的具体 vocals SDR、24G 卡实测秒数、豆包复刻样本要求。
