# 5 · 厂商速查

> 由 `gen/build-digest.mjs` 生成，与线上画布同一份内容；改内容改脚本，不要手改本文件。

## 图片：四家自然语言 + NAI + Runner

_PixelVault · 5 厂商速查 · 1 / 5 · 2026-09-17 一手核对_

只列影响决策的事实；全文与来源链接在仓库 `docs/design/roadmap-canvas/research/image-nl.md` · `novelai-pixai.md`。价格为当时官方标价。

| 家族           | 在用型号                                        | 官方要点                                                                                                                                                                           | 接了                                                           | 没接的高价值                                                |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| GPT Image      | 2.5 Sunburst · 2.5 Flare · 2                    | 三款同价（文入 $5 / 图入 $8 / 图出 $30 每 M）；edits 多图 + 蒙版；六档画质；透明底；Responses 多轮编辑工具                                                                         | 六档画质 · 透明底 · 预览 · input_fidelity                      | Responses 多轮工具 · moderation:low · output_format · n > 1 |
| Gemini 图像    | 3 Pro Image · 3.1 Flash · 3.1 Flash-Lite        | 多图 ≤ 14（Pro 6 物体 / 5 角色；Flash 10 / 4 / 3）；对话式多轮编辑；搜索接地；无免费档                                                                                             | 单轮生成                                                       | 多轮会话编辑 · 按角色分槽 · 分辨率按型号收敛                |
| FLUX 2         | Pro · Pro Edit · Flash · Kontext Max            | ≤ 8 图且输入 + 输出 ≤ 9MP；不支持负面词；JSON prompt + @image 是写法不是字段                                                                                                       | 主体                                                           | FLUX.2 [max]（10 参考）· safety tolerance                   |
| Seedream 5.0   | Pro · Lite（fal / 火山 / BytePlus）             | Pro ≤ 10 图（Lite 14）；图层拆分（Pro）；组图 / 联网（仅 Lite）；Pro 1K / 1.5K 同价                                                                                                | 图层拆分 · 透明底                                              | 组图 · Pro 1.5K 档                                          |
| NovelAI        | V5 Full · V5 Curated · V4.5 Full · V4.5 Curated | BYOK；V5 不在 Opus 无限档；**角色图用 Full（Curated 不认识新角色）**；多角色 V5 ≤ 22 / V4.5 ≤ 6；质量标签与 UC 预设是标签串不是字段；精确参考仅 V4.5，+5 Anlas；Vibe 官方 API 暂无 | inpaint · 质量标签 · UC · Text: · 采样器 · 官方补全 · 精确参考 | Director Tools · 透明底                                     |
| PixAI          | Tsubaki.2 · Haruka v2 · Hoshino v2              | 有官方 REST API（beta，t2i only）                                                                                                                                                  | 09-20 暂时下架                                                 | —                                                           |
| Qwen Image 2.1 | qwen2.1（Runner）                               | 独立 RunPod 端点；CFG / 步数 / 负面 / seed / ≤ 10 参考                                                                                                                             | 私有白名单评估                                                 | 公开与否待定                                                |

## 视频：六族

_PixelVault · 5 厂商速查 · 2 / 5 · 2026-09-17 一手核对_

全文在 `research/video.md`。

| 家族                  | 官方能力                                                                                                                                    | 我们的状态                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Seedance 2.5 / 2.0    | 480p–1080p · 4–30s 或 -1 智能 · 编辑 / 延长任务 · 21:9 · **白模参考 / 渲染三档** · 时间戳分镜；2.0 图 1–9 / 视频 3 / 音频 3，只认「镜头 N」 | 1080p 已放开；编辑 / 延长 · -1 · 21:9 未接                        |
| Kling O3 / V3 Pro     | **multi_prompt 镜头列表** + shot_type · 首尾帧 · elements + create-voice · video-to-video · motion-control；无延长端点                      | O3 v2v edit 已接（转白模）；multi_prompt · 首尾帧 · elements 未接 |
| Wan 3.0               | t2v / i2v 首尾帧 / r2v（图 10 · 视频 5 · 音频 5）· Prime 上位档                                                                             | 主体已接；Prime 未接                                              |
| HappyHorse 1.1        | reference-to-video · video-edit                                                                                                             | 只接 t2v + i2v                                                    |
| Gemini Omni 1.1 Flash | 五种任务含 edit / extend · 首尾帧 · 有状态多轮编辑 · 360p–4K                                                                                | 只当文生 / 图生                                                   |
| MiniMax H3            | i2v 首尾帧 · 768P / 2K · 768P → 2K Regeneration（约砍 40% 试错成本）· H3-Max                                                                | 只发 2K；首尾帧未接                                               |

- **尾帧**：keyframeSlots 全是 1，只有火山通道真发 last_frame；Kling / MiniMax / Omni 的尾帧被静默丢。
- **白模试验（09-17）**：Kling O3 standard v2v edit，5s 720p 推镜一次调用 247s · $0.126 / s ≈ $0.63；运动 / 姿态 / 构图逐帧对齐，材质统一哑光陶土；prompt 要保留背景体块、写 no eye color。

## 语音：云端 · 自托管 · 人声提取

_PixelVault · 5 厂商速查 · 3 / 5 · 2026-09-17 一手核对_

全文在 `research/tts.md` · `tts-doubao.md` · `tts-selfhost.md` · `vocal-separation.md`。

| 模型                      | 情绪控制                           | 多说话人         | 价格 / 许可                            |
| ------------------------- | ---------------------------------- | ---------------- | -------------------------------------- |
| Fish S2.1-Pro（在用）     | 自由词表 [tag] + temperature       | 原生             | $15 / M 字节；free 档 $0               |
| ElevenLabs v3             | audio tags + stability 三档        | Text-to-Dialogue | $0.10 / 1K 字符                        |
| 豆包语音合成 2.0          | 指令式，走 context_texts / `<cot>` | 逐句编排         | 后付费 ¥3 / 万字符                     |
| Seed-Audio 1.0            | 一条 prompt 出对白 + BGM + 音效    | 原生             | 邀测，无定价                           |
| Gemini TTS                | Director’s Notes + 行内标记        | 原生             | 按 token                               |
| Qwen3-TTS 1.7B（自托管）  | 自然语言指令 + VoiceDesign 造音色  | 逐句             | Apache-2.0；3090 实测 3.9GB · RTF 0.97 |
| CosyVoice3 0.5B（自托管） | instruct：方言 / 情绪 / 语速       | 逐句             | Apache-2.0                             |
| IndexTTS-2（自托管）      | 最强：情绪参考音频 / 8 维向量      | 逐句             | bilibili 许可，商用需申请              |

- 避开商用问题：Fish-Speech 权重（研究许可）· Higgs v3（非商用）· F5-TTS（CC-BY-NC）。
- 人声提取：ElevenLabs isolation ≈ $0.22 / 分钟（吃视频，只出人声）；fal demucs ≈ $0.02 / 4 分钟（四轨）；自托管 htdemucs_ft（MIT）。

## 文字：五家 LLM + 搜索

_PixelVault · 5 厂商速查 · 4 / 5 · 2026-09-23 型号已更新_

三条路由（增强 · 规划 · 助手）服务四模态。全文在 `research/llm-agent.md`。

| 家族     | 在用型号                                                                                    | 独有能力                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| OpenAI   | GPT-6 Sol（助手 / 剧本默认）· GPT-6 Luna（增强 / 自动问答）· GPT-6 Astra · gpt-5-search-api | file_search · tool_search · Conversations 永久会话 · web_search 域名白黑名单                                  |
| Gemini   | 3.8 Flash · 3.5 Flash Lite（平台 key）                                                      | Google 搜索接地 · URL context ≤ 20 URL / 34MB 含 PDF · 视频 / 音频原生输入 · thinking 摘要                    |
| Grok     | 4.7                                                                                         | X Search · Collections；推理关不掉                                                                            |
| DeepSeek | V4 Pro · deepseek-flash（vision）                                                           | 峰谷两价 · cache 命中价低两量级 · 384K 输出；无官方联网；未指定型号且带图时自动走 flash                       |
| Claude   | Opus 5.5（默认）· Fable 5.1                                                                 | 识图（09-23 接入）· 原生结构化输出 · 提示词缓存 · web_search + cited_text · memory 工具（未接，记忆走自家表） |

- **公共契约**：工具调用 + JSON Schema · 图像输入 · 推理档位 · caching · SSE。独有能力一律「探测 + 降级」。
- **搜索改进待做**：正文预算分档 · 白黑名单下沉到 provider 原生过滤 · 引用改区间锚（cited_text）· 同源家族去重 · 深研档一次澄清 + 有上限多轮。
- **检索源**：Serper 搜索 / 搜图 · Jina Reader · 萌百 · 中文维基 · Danbooru · B 站。

## Runner：RunPod · ComfyUI · 底模

_PixelVault · 5 厂商速查 · 5 / 5 · 2026-09-17 控制台实看_

全文在 `research/runner-lora.md` 与仓库 `docs/references/domains/runner.md`。

| 项            | 事实                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主端点        | `dt0wyuid7lywic`：Active 0 · Max 2 · Idle 5s · GPU 24 GB + 24 GB Pro；「standby = $803 / 月」不成立                                                                     |
| Qwen 端点     | `ok6riemrmpdiic`：Min 0 · Max 1 · Idle 5s；ComfyUI 0.37 评估镜像                                                                                                        |
| 幻影 idle     | health 报 idle 而队列卡死，遇到再抓 health 快照                                                                                                                         |
| ComfyUI       | fork 基于 worker-comfyui 5.8.6（= ComfyUI 0.25）；5.10 = 0.34 已满足 Krea 2 ≥ 0.27，升级后必须重测 VAEDecode → Upscale 空结果坑                                         |
| Volume        | 80G 已用 47.4G；换 checkpoint 要重载 6.9G，产品侧默认底模收到 1–2 个最管用                                                                                              |
| 底模候选      | Anima 新档（非商用，最低成本最高回报）· Krea 2 Turbo（最该加）· Z-Image Turbo（Apache-2.0，唯一真商用，扩容后）                                                         |
| LoRA 缺的设置 | 白名单只 1 条（运行时下载收益超其余之和）· strength 分离 · clip skip · 采样器 · 负面 embedding · hires fix · CFG rescale · ADetailer · IP-Adapter（r4a 施工完未切生产） |
