CDP 不可用（Chrome 调试授权超时），全程用 WebSearch + WebFetch + curl 直取一手源。以下为核实结果。

---

# PixelVault 自托管 TTS 调研（RunPod Serverless 24G）

## 1. 部署路径现状

**官方仓库** [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) — Apache-2.0，13.4k star，最后 push **2026-03-17**（近半年无更新，但 issue/生态活跃）。无官方 Release tag，无官方 Docker 镜像（**未核实到任何 Qwen 官方 TTS 镜像**）。官方给的路径是 PyPI `qwen-tts` 包 + Gradio WebUI + DashScope 云 API。

**vLLM-Omni 是当前最靠谱的 serving 路径**：[vllm-project/vllm-omni](https://github.com/vllm-project/vllm-omni) Apache-2.0，6.8k star，**今天（2026-09-17）仍在提交**，仓库内有 Qwen3-TTS 专属 deploy config（`qwen3_tts.yaml`）、async chunking、word timestamps、PD 分离等在飞工作，说明已远超"仅离线推理"阶段。但官方 Qwen3-TTS 文档页 [vllm-integration](https://mintlify.wiki/QwenLM/Qwen3-TTS/advanced/vllm-integration) 仍写着"当前仅支持离线推理，在线 serving 后续支持"——文档滞后于代码。**注意 vllm-omni v0.24.0 有活跃 bug**（#7347 每请求都触发 `Error concatenating tensor for key sr` fallback），选版本要避开。

**FastAPI 现成服务**：[groxaxo/Qwen3-TTS-Openai-Fastapi](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi)，Apache-2.0，230 star，OpenAI `/v1/audio/speech` 兼容，最后 push 2026-07-10，双后端（官方 PyTorch / vLLM-Omni）可切——**这是最省事的起点**。

**ComfyUI 节点**：[diodiogod/TTS-Audio-Suite](https://github.com/diodiogod/TTS-Audio-Suite)（1.2k star，2026-09-05 更新，维护中，多引擎含 Qwen3-TTS 与 CosyVoice3）；[DarioFT/ComfyUI-Qwen3-TTS](https://github.com/DarioFT/ComfyUI-Qwen3-TTS)（302 star，2026-02 后停更）。**后者 README 明确警告要求 `transformers==4.57.3`，会降级现有版本、影响其他节点**。

## 2. 显存与速度（实测）

唯一找到的可复现基准：[groxaxo BENCHMARK_RESULTS.md](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi/blob/main/BENCHMARK_RESULTS.md)，RTX 3090 24G，1.7B-CustomVoice：官方后端 RTF **0.97**、平均 8.49s；vLLM-Omni RTF **0.83**、7.85s；两者 VRAM 均 **~3.89 GB**。FlashAttention2 对官方后端 +10%，对 vLLM-Omni 反而 -8%。vLLM-Omni 冷启动额外 **~100s**。官方文档口径的 VRAM 建议是 0.6B 8GB / 1.7B 12GB（含 KV cache 余量）。官方宣称端到端首包 **97ms**（未标硬件）；社区 4090 数据 TTFA ~170ms（1.7B）——**二手来源，未核实**。0.6B 的独立 RTF/VRAM **未核实**。

CosyVoice3 官方称双向流式、延迟低至 **150ms**；RTF/VRAM 数据**未核实**（[model card](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512)）。

## 3. 冷启动

权重实测（HF API 拉的 blob 大小）：1.7B-Base **4.54 GB**、0.6B-Base **2.52 GB**（各含 0.68GB speech tokenizer）、1.7B-VoiceDesign 4.52 GB、Fun-CosyVoice3-0.5B-2512 **9.75 GB**（含多份 onnx/pt 冗余，实际按需只取 ~3.4GB）。

RunPod 侧：官方 [volume-cache 文档](https://docs.runpod.io/serverless/development/volume-cache) 提供 SDK `VolumeCache`，把 network volume 当镜像目录，冷启动时把权重还原到本地路径，把每次几 GB 下载变成 endpoint 一次性成本；配合 FlashBoot（进程快照）预热 worker 可 <200ms 响应。**"从冷到首次出声"的具体秒数未核实**——按权重 4.5GB 从 network volume 载入 + 模型上卡，量级在十几到几十秒，vLLM-Omni 后端还要叠 ~100s 引擎冷启，这是选型的关键劣势。

## 4. 与现有 ComfyUI worker 共存

**建议独立 endpoint**，不要塞进现有 worker-comfyui 5.10 / ComfyUI 0.34：

- 依赖冲突实锤：Qwen3-TTS 节点钉 `transformers==4.57.3`，图片 LoRA 栈大概率不同版本。
- 镜像膨胀：多 +4.5GB 权重 + torch audio 栈，拖慢图片路径冷启动。
- 扩缩容耦合：TTS 请求短、图片请求长，混在一个 endpoint 里 queue 相互挤压。
- [worker-comfyui](https://github.com/runpod-workers/worker-comfyui) 是 **AGPL-3.0**，改造分发要留意。

成本差异：两个 endpoint 各自 scale-to-zero，闲时都是 0，**没有固定成本惩罚**；唯一代价是 TTS endpoint 多一份冷启动（可用 network volume 抵消，$0.07/GB/月，5GB ≈ $0.35/月）。合并反而会让每次图片冷启动都背 TTS 权重。

## 5. API 形态

Qwen3-TTS 三种输入模式：**Base**（3 秒参考音频克隆，ICL 模式还需参考文本；X-Vector 模式仅音频）、**CustomVoice**（9 个预置音色 + instruct 指令控制）、**VoiceDesign**（纯自然语言描述音色，仅 1.7B）。语言：中英日韩德法俄葡西意 10 种 + 北京/四川方言。架构 Dual-Track 混合流式，流式与非流式都支持。CosyVoice3 语言少一门（无韩语？其列 9 种），但**方言强得多：18+ 中文方言/口音**（粤语、闽南、四川、东北、上海、陕西等），并支持情感/语速/音量 instruct。

## 6. 许可与限制

Qwen3-TTS 全系 **Apache-2.0**（GitHub LICENSE + 每个 HF model card 已逐个核实）。Fun-CosyVoice3-0.5B-2512 也是 **Apache-2.0**，但 model card 带"仅供学术用途"免责声明措辞，商用前建议再确认。**两者均未核实到强制音频水印**，也未见额外使用限制条款——但声纹克隆的合规风险（未授权声音）需要产品侧自建同意流程。

## 对照表

| 维度              | Qwen3-TTS 0.6B                | Qwen3-TTS 1.7B                             | Fun-CosyVoice3-0.5B           |
| ----------------- | ----------------------------- | ------------------------------------------ | ----------------------------- |
| 权重体积          | 2.52 GB                       | 4.54 GB                                    | 9.75 GB（仓库全量）           |
| VRAM（实测/官方） | 8GB 建议（实测未核实）        | **~3.9GB 实测** / 12GB 建议                | 未核实                        |
| RTF               | 未核实                        | **0.97 官方后端 / 0.83 vLLM-Omni**（3090） | 未核实                        |
| 首包延迟          | 未核实                        | 官方称 97ms；4090 ~170ms（二手）           | 官方称 150ms                  |
| 流式              | 是                            | 是                                         | 双向流式（文本入+音频出）     |
| 语言              | 10 种 + 京/川方言             | 同左                                       | 9 种 + **18+ 中文方言**       |
| 音色控制          | 克隆 / 9 预置                 | 克隆 / 预置 / **VoiceDesign**              | 克隆 + instruct               |
| 许可              | Apache-2.0                    | Apache-2.0                                 | Apache-2.0（含学术用途声明）  |
| Serving           | vLLM-Omni / FastAPI / ComfyUI | 同左                                       | vLLM / TensorRT-LLM / FastAPI |

## 7. 推荐

**上 Qwen3-TTS-12Hz-1.7B**（Base 做克隆、CustomVoice 做默认音色），0.6B 留作降本备选。理由：唯一有实测 VRAM/RTF 的一档、3.9GB 在 24G 卡上非常宽裕、VoiceDesign 是 CosyVoice 没有的产品能力、生态（vllm-omni 每日提交）活跃度碾压。CosyVoice3 只在**中文方言**是刚需时才值得并上。

**部署**：独立 RunPod Serverless endpoint，24GB 档（L4/A5000/3090/MIG24）。起步用 groxaxo 的 FastAPI OpenAI 兼容服务 + **官方 PyTorch 后端 + FlashAttention2**（冷启快、RTF 差距只有 14%），把权重放 network volume 用 `VolumeCache` 预置。等量上来再切 vLLM-Omni 批处理（但要避开 v0.24.0 的 `sr` bug，并接受 ~100s 引擎冷启）。

**成本**：RunPod 一手价目页，Serverless 24GB（L4/A5000/3090/MIG24）**$0.69/hr = $0.0001917/s**，4090 档 $1.10/hr。按 RTF 0.97 算，1 分钟语音 ≈ 58s GPU ≈ **$0.011/分钟**；vLLM-Omni RTF 0.83 → **$0.0096/分钟**；0.6B 若如社区所说快 2-3 倍，可压到 **$0.004-0.006/分钟**。加上冷启动摊销与 5 秒 idle timeout，低频场景实际按 **$0.015-0.02/分钟** 预算更稳。对照 RunPod 自家 Public Endpoint（MiniMax Speech 02 HD $0.05/1000 字符），自托管在有量时明显更便宜。

---

Sources: [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) · [Qwen3-TTS-12Hz-1.7B-Base](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base) · [vLLM 集成文档](https://mintlify.wiki/QwenLM/Qwen3-TTS/advanced/vllm-integration) · [vllm-project/vllm-omni](https://github.com/vllm-project/vllm-omni) · [FastAPI 基准](https://github.com/groxaxo/Qwen3-TTS-Openai-Fastapi/blob/main/BENCHMARK_RESULTS.md) · [TTS-Audio-Suite](https://github.com/diodiogod/TTS-Audio-Suite) · [ComfyUI-Qwen3-TTS](https://github.com/DarioFT/ComfyUI-Qwen3-TTS) · [Fun-CosyVoice3-0.5B-2512](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512) · [RunPod Pricing](https://www.runpod.io/pricing) · [RunPod Volume Cache](https://docs.runpod.io/serverless/development/volume-cache) · [worker-comfyui](https://github.com/runpod-workers/worker-comfyui)
