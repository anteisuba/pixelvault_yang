# LoRA 多参考图 可行性调研（图五「参考图真的只能挂一张吗」）

> 状态：**调研结论 v1（2026-07-18，Fable 桌面调研）**，含 3 项待实证；结论 = **可行，走 Runner+IPAdapter 路线，独立 feature 立项**（工程量对标 2026-07-12 v2「运行时 LoRA 下载」那次的跨栈规模）。
> 姊妹文档：`docs/plans/lora-assistant-nl2tag-2026-07.md`（图四+图五主施工图）。

## 1. 现状为什么只有一张

现行参考图链路（2026-07-12 img2img 上线，commit `a05f2eb2` 线）：

```
app ReferenceSlot（1 张）→ Worker recipe→workflow 映射（workers/execution）
→ runner ComfyUI：LoadImage → VAEEncode → KSampler(denoise = 1 - referenceStrength)
```

这是 **img2img 潜变量初始化**范式——参考图只能有一张，因为它是「起点画布」不是「注入信号」。多参考需要换范式：参考图作为**条件注入**（NovelAI Vibe Transfer 的实质）。

## 2. 语义拆分（「多参考」其实是三件事）

| 语义                      | 技术                              | owner 语境优先级              |
| ------------------------- | --------------------------------- | ----------------------------- |
| 风格/氛围注入（多图融合） | IPAdapter（image prompt adapter） | **高**——即 Vibe Transfer 对标 |
| 身份保持（人脸/角色）     | IPAdapter-FaceID / PuLID          | 中——与角色卡主线交叠          |
| 构图/姿势控制             | ControlNet                        | 低——另一条线，不混入本题      |

## 3. 路线评估

### 路线 1：Runner + ComfyUI IPAdapter_plus（推荐）

SDXL 系 runner 底模（WAI / animaPencil / Pony / SDXL1.0）全部适用。需求清单：

| 层              | 改动                                                                                                 | 说明                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| fork 镜像（r4） | 安装 `ComfyUI_IPAdapter_plus` custom node                                                            | 沿用 v2 fork 的 mv handler + importlib 入口纪律（⚠别覆盖 CMD/start.sh） |
| 权重            | `ip-adapter_sdxl.safetensors`（~700MB）+ image encoder `CLIP-ViT-H`（~2.5GB，各 IPAdapter 共享一份） | 走 v3/v4 已验证的 HF 自播种或 R2 权威仓路径；⚠ volume 40GB 现状余量待核 |
| Worker workflow | 新分支：`IPAdapterUnifiedLoader` → `IPAdapterAdvanced`（多图各带 weight）串进 KSampler 前            | 与现有 img2img 分支正交可叠加（起点图 + 注入图并存）                    |
| app             | ReferenceSlot 1→N（上限进常量，建议 3）+ 每图 strength + 与现 referenceStrength 语义区分             | UI 归 Fable 出小节设计，工程归 Sonnet                                   |

**Anima DiT 首发排除**：Qwen-Image/DiT 架构无成熟 IPAdapter 生态（社区无对应权重），挂 Anima 底模时多参考 UI 按「不支持不渲染」隐藏——与 per-source 可用性同机制。

### 路线 2：云端多图模型（不适用 LoRA 主线）

gpt-image / Gemini image / Seedream 原生吃多图，但**挂不了用户 LoRA**；fal FLUX LoRA 侧的 Redux 是单图风格迁移。结论：路线 2 只服务 Studio 图像页（已有部分能力），LoRA 工作流的多参考必须走路线 1。

## 4. 待实证（立项后第一步）

1. `worker-comfyui` 5.8.6 基础镜像是否已含 IPAdapter_plus custom node（大概率无，需 r4 加装）——起 dev pod 一次探明。
2. Volume `rk3t3mb1ko`（40GB）现余量 vs +3.2GB 权重（encoder+adapter）；不够则扩容或走运行时下载缓存。
3. IPAdapter 权重选型（plus / plus-face / FaceID 变体）与 WAI/Pony 实测出图质量——一次性 dev 实例测试 key 纪律。

## 5. 结论与建议

- **可行**，工程量中大（fork r4 + Worker workflow + app 三层五步，含真机验收）。
- **建议独立 feature 立项**（暂名 runner-multi-reference），不并入图四/图五批次——助手线是纯 app 层，本线要动 RunPod 基建,节奏与风险不同。
- 顺位建议：图四/图五施工图落地 → 本线立项（届时先做 §4 三项实证）。
- 与在飞线的交叠提示：image-edit-extensions ideation（带角色参考图 / ReferenceSlotRole 扩展）与本线共用 ReferenceSlot 扩容，立项时合并设计避免两次改同一件。

## Last Verified

- 2026-07-18 · 桌面调研（现有代码链路 + comfy-runner memory 体系 + IPAdapter 生态公开信息）；§4 三项未实证，立项后先补。
