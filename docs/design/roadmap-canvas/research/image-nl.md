# 图片「自然语言指令模型」能力对照（2026-09-17）

口径：能力一句只写官方文档写明的；仓库状态以 `src/constants/**`、`src/services/image/image-edit.service.ts`、`workers/execution/src/index.ts`（图片真正的请求构造层，adapter 只剩 healthCheck）为准。

## 1. OpenAI GPT Image（gpt-image-2 / 2.5-flare / 2.5-sunburst）

来源：[生图指南](https://developers.openai.com/api/docs/guides/image-generation)｜[flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)｜[sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)｜[gpt-image-2](https://developers.openai.com/api/docs/models/gpt-image-2)

| 能力           | 官方口径                                                                                                                                                           | 仓库状态                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 端点           | 只有 `v1/images/generations` + `v1/images/edits`（+Batch）；Responses API 另有 `image_generation` 工具，支持多轮迭代编辑、传 File ID、`action: auto/generate/edit` | 部分。worker 直打两个 REST 端点（index.ts:6884），Responses 工具形态**未接入**             |
| 多图输入       | edits 接多张，`image[]`；mask 应用于第一张                                                                                                                         | 已接入。edit service 用 `image[]`；`OPENAI_GPT_IMAGE_MAX_REFERENCE_IMAGES = 16`            |
| 蒙版           | mask 需带 alpha 通道、与原图同格式同尺寸、<50MB                                                                                                                    | 已接入（image-edit.service.ts:498 用 sharp 反相合成 alpha mask）。⚠ worker 生成路径无 mask |
| 尺寸           | 建议 1024²/1536×1024/1024×1536；自定义须 16 的倍数、比例 1:3–3:1、单边 ≤3840、总像素 655,360–8,294,400                                                             | 部分。worker 只按 aspectRatio+档位映射固定几档                                             |
| 画质           | `low/medium/high/xhigh/max/auto`（2.5 两款；旧模型止于 high）                                                                                                      | 已接入（MODEL_CAPABILITY_OVERRIDES 六档）                                                  |
| 背景/格式/压缩 | `background:transparent`（须 png/webp）、`output_format: png/jpeg/webp`、`output_compression` 0–100                                                                | 部分。background 已发；`output_format` 被写死 `png`；压缩未接                              |
| 张数           | `n` 可 >1                                                                                                                                                          | 未接入（worker 恒 `n:1`）                                                                  |
| 流式预览       | `partial_images` 0–3                                                                                                                                               | 已接入（恒 2，index.ts:6880）                                                              |
| 负面提示词     | 无此字段                                                                                                                                                           | 一致（model-strengths 标 unsupported）                                                     |
| seed           | 文档未记载                                                                                                                                                         | 一致（OPENAI capabilities 无 seed）                                                        |
| 审核档         | `moderation: auto \| low`；拦截返回 `moderation_blocked` + `moderation_details`                                                                                    | **未接入**（全仓无 moderation 参数）                                                       |
| 价格           | 三款同价：文本入 $5/M、图入 $8/M、图出 $30/M；1024² low→max = $0.00588–$0.21072                                                                                    | 已接入（unit-prices.ts MODEL_UNIT_PRICE_RANGES，verifiedAt 2026-09-09）                    |
| 配额           | Tier1 100K TPM/5 IPM → Tier5 8M TPM/250 IPM                                                                                                                        | 未建模                                                                                     |
| 版本           | sunburst 快照 `gpt-image-2.5-sunburst-2026-09-08`；gpt-image-2 快照 `2026-04-21`，无退役公告                                                                       | 目录三条都在                                                                               |

## 2. Google Gemini 图像（3 Pro Image / 3.1 Flash Image / 3.1 Flash-Lite Image）

来源：[图像生成](https://ai.google.dev/gemini-api/docs/image-generation)｜[3-pro-image](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image)｜[定价](https://ai.google.dev/gemini-api/docs/pricing)

| 能力           | 官方口径                                                                                                           | 仓库状态                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 输入模式       | 三款都支持文生图 + 对话式编辑；推荐多轮对话式连续编辑                                                              | 部分。生成/编辑都是**单轮单次** `generateContent`，无会话累积                        |
| 多图上限       | 总 14 张；Flash 细分 10 物体/4 角色/3 风格；Pro 为 ≤6 物体、≤5 角色                                                | 部分。`GEMINI.maxReferenceImages = 14` 一刀切，未按模型/角色分档                     |
| 蒙版           | 只有语义蒙版（"只改蓝沙发"），不收像素 mask                                                                        | 一致（editImageWithGemini 明确不传 mask）                                            |
| 比例           | `1:1,3:2,2:3,3:4,4:3,4:5,5:4,9:16,16:9,21:9`                                                                       | 部分（worker 发 `imageConfig.aspectRatio`，但项目自有的比例集未对齐 21:9/4:5/5:4）   |
| 分辨率         | Lite 仅 1K；Flash 0.5K/1K/2K/4K；Pro 1K/2K/4K；必须大写 K                                                          | 部分。`GEMINI.resolutionOptions = ['1K','2K','4K']` 对 Lite 是虚标，对 Flash 少 0.5K |
| 张数           | 一次一张（`interaction.output_image`）                                                                             | 一致                                                                                 |
| 文字渲染       | "Advanced text rendering"，信息图/菜单/图表可读                                                                    | 已在 model-strengths 体现                                                            |
| 联网接地       | Flash 支持 Google Search / 图片搜索接地；Lite 不支持                                                               | **未接入**                                                                           |
| 思考档         | 默认开；Flash 系支持 minimal / high                                                                                | **未接入**                                                                           |
| 流式/负面/seed | 文档均未记载 → 未核实                                                                                              | 一致（GEMINI capabilities 只有 resolution/imageAnalysis）                            |
| 水印           | 所有输出带 SynthID                                                                                                 | 未在产品层说明                                                                       |
| 价格           | Pro 1K/2K $0.134、4K $0.24；Flash 0.5K/1K/2K/4K = $0.045/$0.067/$0.101/$0.151；Lite 1K $0.0336；三款**均无免费档** | ⚠ 目录里 `GEMINI_FLASH_IMAGE` 标了 `freeTier: true`（models/image.ts），与定价页冲突 |
| 版本           | `gemini-3-pro-image` 稳定版；`-preview` 已于 2026-06-25 关停                                                       | 已接入（externalModelId 已切 GA）                                                    |

## 3. Black Forest Labs FLUX 2

来源：[FLUX.2 [pro] API](https://docs.bfl.ai/api-reference/models/generate-or-edit-an-image-with-flux2-%5Bpro%5D)｜[FLUX.2 提示词指南](https://docs.bfl.ai/guides/prompting_guide_flux2)｜[模型列表](https://bfl.ai/models)｜fal OpenAPI（`fal.ai/api/openapi/queue/openapi.json?endpoint_id=…`）

| 能力        | 官方口径                                                                                                           | 仓库状态                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 多图参考    | BFL：`input_image`…`input_image_8`，上限 8；且 **输入+输出合计 9MP**（1MP 输出时最多 8 张，2MP 时 7 张…）          | 已接入张数（`FAL_FLUX_2_PRO_MAX_REFERENCE_IMAGES = 8`）；**9MP 预算规则未建模**                                                                                                                                                        |
| T2I vs Edit | fal 把 pro 拆成 `/flux-2-pro`（无 image_urls）与 `/flux-2-pro/edit`（有）                                          | 已接入（worker `FAL_IMAGE_REFERENCE_ENDPOINT_BY_T2I` 自动换端点）                                                                                                                                                                      |
| Flash       | fal `fal-ai/flux-2/flash` 描述为 FLUX.2 [dev] 基座；`/flash/edit` 明确"最多 4 张，超出取前 4"                      | 已接入（常量与端点换挡都对）                                                                                                                                                                                                           |
| 分辨率      | 最小 64×64，最大 4MP，边长须 16 的倍数，推荐 ≤2MP                                                                  | 部分（只用 fal 预设枚举 `square_hd` 等，未做自定义 W/H）                                                                                                                                                                               |
| 张数        | fal pro/edit schema **无 num_images**；flash 有（≤4）；kontext/max/multi 有（≤4）                                  | 一致（恒发 1 张，但也就没法用）                                                                                                                                                                                                        |
| 负面提示词  | 指南明确 **不支持**                                                                                                | ⚠ 半一致：model-strengths 标 unsupported，但 `MODEL_CAPABILITY_OVERRIDES` 给 FLUX_2_PRO / FLUX_2_FLASH 声明了 `negativePrompt`、`guidanceScale`、`steps`，而 fal pro/edit schema 里这三个字段**都不存在**（flash 只有 guidance_scale） |
| seed / 格式 | seed 支持；BFL 输出 jpeg/png/webp，fal pro 只 jpeg/png，flash 三种                                                 | 已接入 seed；格式未暴露                                                                                                                                                                                                                |
| 审核档      | BFL `safety_tolerance` 0–5（默认 2）；fal 1–5 + `enable_safety_checker`                                            | **未接入**（worker 不发这两个字段，恒走默认）                                                                                                                                                                                          |
| 结构化提示  | 支持 JSON prompt + `@image1` 引用 + HEX 色值                                                                       | 仅写进 enhanceHint，无结构化输入通道                                                                                                                                                                                                   |
| Kontext Max | fal `kontext/max/multi`：`aspect_ratio` 九档、`num_images` ≤4、`safety_tolerance` 1–6、`enhance_prompt`            | 部分（目录只声明 seed + 4 张参考图）；BFL 官网已把 Kontext 归入上代                                                                                                                                                                    |
| 最新版本    | **FLUX.2 [max]** 为 FLUX.2 旗舰（10 张参考、web contextual generation）；另有 FLUX.2 klein、FLUX 3（图/视频/音频） | **未接入**。fal 上 `fal-ai/flux-2-max` 与 `/edit` 已可用（schema 实测 200）                                                                                                                                                            |
| 价格        | fal pro：$0.03 首 MP + $0.015/额外 MP；flash $0.005/MP；kontext max $0.08/张                                       | 已接入（unit-prices.ts，verifiedAt 2026-08-18）                                                                                                                                                                                        |

## 4. ByteDance Seedream 5.0（Pro / Lite）

来源：[火山方舟 图片生成 API](https://www.volcengine.com/docs/82379/1541523)｜[fal Seedream 5.0 Pro](https://fal.ai/models/bytedance/seedream/v5/pro/text-to-image)｜fal OpenAPI｜[BytePlus ModelArk](https://docs.byteplus.com/en/docs/ModelArk/1330310)（目录页可达，正文未取到 → 该站细节未核实）

| 能力               | 官方口径（火山 Ark）                                                                                                                                | 仓库状态                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 参考图上限         | **Pro 最多 10 张；Lite / 4.5 / 4.0 最多 14 张**；单图 ≤30MB、比例 [1/16,16]、总像素 ≤3600 万                                                        | ⚠ 不一致。`VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES = 14` 对 Pro 超限（该常量自注 UNVERIFIED，现已可证实）；worker 恒 `.slice(0,14)`。fal 侧 10 张是对的 |
| 组图（sequential） | `sequential_image_generation: auto/disabled` + `max_images` 1–15，输入参考图 + 生成图 ≤15；**仅 Lite/4.5/4.0 支持，Pro 明确不支持**                 | **未接入**（worker 恒 `n:1`，不发该字段）                                                                                                                |
| 流式输出           | `stream: true` 逐张返回；**仅 Lite/4.5/4.0**，Pro 不支持                                                                                            | **未接入**                                                                                                                                               |
| 联网搜索           | `tools:[{type:'web_search'}]`，**仅 Lite**；用量见 `usage.tool_usage.web_search`                                                                    | **未接入**（model-strengths 已写"可联网"，但没有开关）                                                                                                   |
| 图层拆分           | `layer_decomposition: true` → 1 张底图 + 最多 16 个透明 PNG 图层，带 z_index / bounding_box / name / description；**仅 5.0 Pro**，单图输入          | **未接入**（画布 `style-transfer` / `text-render` 仍是空壳，这条比它们更有产品价值）                                                                     |
| 尺寸               | Pro：档位 1K/1.5K/2K（默认 2K），或 W×H，总像素 [921,600, 4,624,220]；**1.5K 与 1K 同价且效果更好**。Lite：2K/3K/4K，总像素 [3,686,400, 16,777,216] | 部分。`VOLCENGINE.resolutionOptions = ['2K','4K']` → Pro 无 1K/1.5K 档（省钱档取不到），Lite 缺 3K；worker 已按模型正确夹 Pro 的 4.62MP 上限             |
| 格式/返回          | `response_format: url\|b64_json`，url 24h 失效；`output_format` png/jpeg                                                                            | 已接入（发 url，落 R2）                                                                                                                                  |
| 文字渲染           | fal 页：14 种语言原生文字；Ark：Pro 额外支持 14 种语言提示词，中文 ≤300 字 / 英文 ≤600 词                                                           | 部分（提示词长度未做 `maxPromptChars`，Seedream 两条目录项就是空的）                                                                                     |
| 负面提示词         | Ark 文档与 fal schema **均无该字段**                                                                                                                | ⚠ 不一致：model-strengths 把 6 条 Seedream 都标 `negativePrompt: 'supported'`；worker 仍会往 fal 发 `negative_prompt`                                    |
| seed / 引导        | Ark 有 seed；`guidance_scale` 文档未记载 → 未核实。fal Seedream schema **两者都没有**                                                               | ⚠ 仓库给 VOLCENGINE/BYTEPLUS 声明了 guidanceScale 且 worker 会发                                                                                         |
| 水印               | `watermark` 默认 **true**（右下角"AI 生成"）                                                                                                        | 已接入（worker 显式发 false）                                                                                                                            |
| 张数               | fal `num_images` ≤6、Lite 另有 `max_images` ≤6                                                                                                      | 未接入（恒 1）                                                                                                                                           |
| 价格               | fal Pro ≤1536² $0.0675 / ≤2048² $0.135；fal Lite $0.035；火山 Pro 高档 0.60 元、Lite 0.22 元                                                        | 已接入且已校正档位（unit-prices.ts 注释有推导）                                                                                                          |

## 最值得补的 10 个缺口（按价值排序）

1. **接入 FLUX.2 [max]（fal `fal-ai/flux-2-max` + `/edit`）** — BFL 现役旗舰、10 张参考，目录里最高档只有上一代 pro，端点实测可用，是一次纯增量的质量跃迁。
2. **修正 Seedream Pro 参考图上限 10（现为 14）** — 官方白纸黑字，超限直接 400，属于"能力矩阵写错导致线上失败"的一类。
3. **Seedream 5.0 Pro 图层拆分（layer_decomposition）** — 一次请求拿到底图 + 最多 16 个带坐标的透明图层，正好喂画布节点，是四家里独一份、且画布最缺的编辑能力。
4. **删掉/改正 Seedream 与 FLUX 的 negativePrompt / guidanceScale / steps 声明** — 官方均无这些字段，现在 UI 让用户填了却发不出效果，是最典型的"虚标能力"。
5. **Seedream 组图 sequential_image_generation（Lite）** — 一次出一组内容关联的图，正是分镜/故事板场景，产品里目前只能靠多次单发拼。
6. **OpenAI `moderation: low`** — 四家里唯一可调审核档；不接就只能吃默认拦截，NSFW 兜底路径少一层。
7. **Gemini 多图上限按模型分档（Pro 6 物体/5 角色，Flash 10/4/3）** — 现在 14 一刀切，Pro 上传满会被拒，且丢掉了"角色 vs 物体"这个可以直接指导 UI 槽位的语义。
8. **Gemini 分辨率按模型收敛（Lite 仅 1K，Flash 有 0.5K）** — 现状对 Lite 是虚标档位、对 Flash 少一个最便宜档，直接影响成本。
9. **Seedream Pro 1K/1.5K 档位（1.5K 与 1K 同价、效果更好）** — 现在恒发 2K 落高价档，补上档位即是立刻省钱。
10. **`output_format` / `n` 的统一暴露** — OpenAI 写死 png、四家都恒发 1 张，而各家 schema 普遍支持 jpeg/webp 与 2–6 张；一次改动同时降体积和提高每次生成的可选性。

未核实：BytePlus ModelArk 正文（JS 渲染，只取到目录）；Gemini 的流式/seed/负面提示词；Seedream 的 guidance_scale。
