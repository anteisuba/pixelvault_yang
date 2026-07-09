# 模型目录月度审计 — model-catalog.md

> 定位：模型阵容的活文档——现役盘点 + 官方动态核验 + 添加/删除建议。**每月更新一次**；owner 点名（如 Seedream 5.0）随时插审。与每周 CI 分工：`model-doc-monitor` 查「接口还活着吗/文档漂移」，本文档管「阵容该怎么变」。
> ⚠ 本文档不豁免 WORKFLOW 联网核验规则：改模型代码前仍须查官方一手资料；本文档的建议表只是审计快照。

## 审计机制

| 周期     | 载体                                                                                              | 内容                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 每周一   | CI `.github/workflows/model-doc-monitor.yml`（cron `17 0 * * 1`，跑 `npm run models:check-docs`） | 模型文档/接口可用性自动检查，报告进 Actions job summary + artifact                                                                            |
| **每月** | 本文档                                                                                            | ①盘点 `src/constants/models/` ②逐 provider 官方页扫新版本/退役公告 ③接口与错误信息变更抽查 ④出添加/删除建议表交 owner 拍板 ⑤更新 Last Audited |
| 触发式   | 本文档「本月发现」节                                                                              | owner 点名的模型动态随时核验补录                                                                                                              |

月审步骤固定五问：现役哪些？官方出了什么新的？哪些该加（直连优先）？哪些该退（用量/被上位替代）？接口/错误格式变了吗？

## 现役阵容（2026-07-10 盘点，`available: true`）

### 图像（14）

| enum                         | externalModelId                              | 通道               |
| ---------------------------- | -------------------------------------------- | ------------------ |
| OPENAI_GPT_IMAGE_2           | （同 id）                                    | OpenAI 直连        |
| GEMINI_PRO_IMAGE             | gemini-3-pro-image-preview                   | Gemini 直连        |
| GEMINI_FLASH_IMAGE           | gemini-3.1-flash-image                       | Gemini 直连        |
| FLUX_2_PRO / FLUX_2_FLASH    | fal-ai/flux-2-pro · fal-ai/flux-2/flash      | fal                |
| FLUX_KONTEXT_MAX             | fal-ai/flux-pro/kontext/max/multi            | fal                |
| FLUX_LORA                    | fal-ai/flux-lora                             | fal                |
| **SEEDREAM_45**              | fal-ai/bytedance/seedream/v4.5/text-to-image | fal                |
| **SEEDREAM_45_VOLCENGINE**   | doubao-seedream-4-5-251128                   | 火山方舟直连（cn） |
| IDEOGRAM_3                   | ideogram/v4                                  | replicate          |
| RECRAFT_V4_PRO               | fal-ai/recraft/v4/pro/text-to-image          | fal                |
| NOVELAI_V45_FULL / \_CURATED | nai-diffusion-4-5-full · -curated            | NovelAI 直连       |
| ILLUSTRIOUS_XL               | delta-lock/noobai-xl                         | replicate          |

不可用：ANIMA_PENCIL_XL（false；SDXL 系走 Comfy runner 计划，见 HANDOFF §4.2b）。

### 视频（12）

| enum                                                | externalModelId                                  | 通道                    |
| --------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| SEEDANCE_20(\_FAST)                                 | bytedance/seedance-2.0(/fast)/text-to-video      | fal                     |
| SEEDANCE_20(\_FAST)\_REFERENCE                      | bytedance/seedance-2.0(/fast)/reference-to-video | fal（画布视频汇点主力） |
| SEEDANCE_20(\_FAST)\_VOLCENGINE + REFERENCE 变体 ×4 | doubao-seedance-2-0(-fast)-260128                | 火山方舟直连（cn）      |
| VEO_31                                              | fal-ai/veo3.1                                    | fal                     |
| KLING_V3_PRO                                        | fal-ai/kling-video/v3/pro/text-to-video          | fal                     |
| HAPPYHORSE_10                                       | alibaba/happy-horse/text-to-video                | fal                     |
| LTX_23                                              | fal-ai/ltx-2.3/text-to-video                     | fal                     |

### 音频（3）

FISH_AUDIO_S2_PRO（s2-pro，Fish 直连）· ELEVENLABS_V3（eleven_v3）· ELEVENLABS_SFX_V2（eleven_sfx_v2）。

### 3D（5）

RODIN_GEN_2_5 · HUNYUAN3D_V31_PRO · HUNYUAN3D_V3 · TRELLIS_2 · TRIPOSR（全 fal 系）；HUNYUAN3D_2_1 已 false（被 v3.1 上位替代）。

## 本月发现（2026-07）

### Seedream 4.5 → 5.0（owner 点名，已官方核验 2026-07-10）

- **Seedream 5.0 已发布**（2026-02，经即梦/火山方舟；fal 已上架）。变体：**5.0 Lite**（text-to-image + edit）与 **5.0 Pro**（text-to-image 旗舰）。
- 新能力：提示词触发**联网搜索**（时效性内容/公众人物）、**低幻觉可控编辑**（前后对照学变换）、生成前 **CoT 推理**（DiT + 高压缩 VAE 架构）。
- fal endpoints：`fal-ai/bytedance/seedream/v5/lite/text-to-image` · `fal-ai/bytedance/seedream/v5/lite/edit` · `bytedance/seedream/v5/pro/text-to-image`。
- 官方声明 API 向后兼容，迁移成本低；火山方舟侧 ark model id **待控制台核对**（沿用 additive 双版本原则）。

### 建议表（待 owner 拍板）

| 动作 | 模型                                                             | 理由                                          |
| ---- | ---------------------------------------------------------------- | --------------------------------------------- |
| 添加 | SEEDREAM_50_PRO（fal `bytedance/seedream/v5/pro/text-to-image`） | 旗舰直代升级，当前 4.5 的正统后继             |
| 添加 | SEEDREAM_50_LITE（fal `.../v5/lite/text-to-image`）              | 性价比档 + 联网搜索能力                       |
| 添加 | SEEDREAM_50_VOLCENGINE（ark id 待控制台核对）                    | 国内直连，按 additive 双版本原则与 fal 并存   |
| 评估 | 5.0 Lite **edit** 端点接入图像编辑链路                           | 低幻觉编辑是编辑工作台的能力升级              |
| 保留 | SEEDREAM_45 双版本暂不退役                                       | 与 5.0 并行验证风格/成本/稳定性一个周期后再议 |

### 本月未覆盖（下次月审 = 首次全量）

其余 provider 新版本扫描（Veo / Kling / FLUX / Recraft / NovelAI / ElevenLabs / Fish / 3D 族 / Gemini/OpenAI 图像）与各 provider 错误信息格式抽查——首次全量审计待排期。

## 接入执行规范（指针）

- 加模型四件套：`AI_MODELS` enum + 模型配置 + i18n ×3 + provider adapter（`backend.md`）。
- 直连官方优先，FAL 仅在无直连或 FAL 唯一/更优时（owner 拍板规则）。
- 错误信息：接入时把 provider 错误码映射进 `constants/generation-errors`（→ i18nKey）；逐 provider 错误格式细化归 `providers.md`（批 2 待写）。

## Source of Truth

- `src/constants/models/{enum,image,video,audio,model-3d,types}.ts` · `src/constants/providers.ts`
- `.github/workflows/model-doc-monitor.yml` + `npm run models:check-docs`
- 官方资料（本次）：fal Seedream 5.0 模型页与文档、ByteDance Seed 官方页

## Last Audited

- Date: 2026-07-10 · 范围：全量盘点（34 现役）+ Seedream 族官方核验；其余 provider 留首次全量月审。下次月审：**2026-08 初**。
