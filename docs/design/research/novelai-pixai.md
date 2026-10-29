# NovelAI + PixAI 调研（子代理报告，2026-09-16 核对）

## A · NovelAI 图像功能矩阵（官方 vs 仓库）

| 功能                     | 官方口径                                                                         | 仓库状态                                                              | 官方 URL                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 模型档                   | V5 Full/Curated（2026-08-20 发布）；V4.5 为 previous；V4/V3/Furry 在线无退役公告 | 已接入四档 BYOK-only                                                  | https://docs.novelai.net/en/image/models/                                                                     |
| 提示词长度               | V5 Full ~1471 / Curated ~703 tokens；V4.5 ~512                                   | 未接入（无 maxPromptChars）                                           | models 页                                                                                                     |
| 文生图 API               | POST image.novelai.net/ai/generate-image → ZIP；Bearer token                     | 已接入（Worker 直发，自解 ZIP）                                       | https://image.novelai.net/docs/index.html                                                                     |
| img2img strength/noise   | Strength 改动幅度，Noise 添细节                                                  | 部分：单图，noise 硬编 0，maxReferenceImages:1                        | https://docs.novelai.net/en/image/strengthnoise/                                                              |
| Inpaint                  | 遮罩重绘；V5 仅 Full 有 inpaint 模型，Curated 借 V4.5                            | 未接入                                                                | https://docs.novelai.net/en/image/inpaint/                                                                    |
| 多角色构图               | V5 最多 22 人自由定位；V4/4.5 最多 6 人 5×5 网格；source#/target# 交互前缀       | 已接入 V5（22 人、auto/manual、独立正负）；缺 V4.5 六人、交互前缀提示 | https://docs.novelai.net/en/image/multiplecharacters/                                                         |
| Vibe Transfer            | V4+ 最多 16 vibe，编码 2 Anlas；V5「coming later」                               | 未接入                                                                | https://docs.novelai.net/en/image/vibetransfer/                                                               |
| Precise Reference        | 2026-02 发布，仅 V4.5；每参考 +5 Anlas                                           | 未接入                                                                | https://docs.novelai.net/en/image/precisereference/                                                           |
| Director Tools           | 去背景 / 线稿 / 上色 / 情绪 / 去杂 / Pixel Snap；POST /ai/augment-image          | 未接入                                                                | https://docs.novelai.net/en/image/directortools/                                                              |
| Text: 文字渲染           | 放 prompt 最末；V5 EN/JA/ZH，上限 Full 750 字                                    | 未接入                                                                | https://docs.novelai.net/en/image/textrendering/                                                              |
| 质量标签                 | V5 Light / Standard 两档                                                         | 未接入（qualityToggle:false 硬编）                                    | https://docs.novelai.net/en/image/qualitytags/                                                                |
| UC 预设                  | Heavy / Light / Furry / Human / None                                             | 部分（硬编 ucPreset）                                                 | https://docs.novelai.net/en/image/undesiredcontent/                                                           |
| 采样器 / SMEA / DYN      | 8 种采样器；>1024² 自动 SMEA                                                     | 未接入（k_euler_ancestral 硬编）                                      | https://docs.novelai.net/en/image/sampling/                                                                   |
| CFG rescale / Decrisper  | 推荐 CFG 5–6                                                                     | 部分（CFG 暴露，rescale/decrisper 硬编）                              | https://docs.novelai.net/en/image/stepsguidance/                                                              |
| 分辩率档 / 批量          | Small/Normal/Large/Wallpaper；Opus 免费条件 ≤28 步单张 ≤1024²                    | 部分（5 个固定尺寸，n_samples 1）                                     | https://docs.novelai.net/en/subscription/                                                                     |
| Anlas / 订阅             | V5 首个对 Opus 免费生成设「电池」上限；2026-09-21 起退订清零 Anlas               | 部分（只有错误码）                                                    | https://blog.novelai.net/subscription-updates-usage-limits-subscription-anlas-policy-adjustments-88a208d5d9c5 |
| 透明背景 / 新标签 / 漫画 | V5 原生 alpha；depthness / complexity / visual novel 标签；单图多格              | 未接入                                                                | V5 发布公告                                                                                                   |
| Enhance / Upscale        | Enhance 二次过模；/ai/upscale 4×                                                 | 未接入                                                                | https://docs.novelai.net/en/image/enhance/                                                                    |

最该补的 8 条：1 V5 Full inpaint · 2 质量标签 / UC 预设 / Text: 控件 · 3 采样器 / SMEA / schedule / rescale 暴露 · 4 分辩率档 + Anlas 预估 + 批量 · 5 Vibe Transfer（V4.5） · 6 Precise Reference（V4.5） · 7 Director Tools 作编辑动作 · 8 V5 自然语言增强 + 透明背景标签 + V4.5 六人。

## B · PixAI 接入

- 有官方 REST API（beta）：api.pixai.art，POST /v2/image/create → GET /v1/task/{id} 轮询或 webhook；Bearer API key；模型 Tsubaki.2（DiT）/ Haruka v2 / Hoshino v2（SDXL）；loras ≤5；batchSize 1|4；无 i2i / 参考 / 编辑 / 视频。文档 https://platform.pixai.art/en/docs
- Key：会员在 profile 即时生成，或邮件申请。credits 制，API 专属价目未核实。ToS 允许官方 API，社区逆向包违约。
- 建议：A 类原生 adapter，队列型 submit→poll，先 BYOK；t2i only；loras 数组可接 LoRA 方向。风险：beta 无 SLA、模型 ID 随版本变、媒体 URL 过期。
