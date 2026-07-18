# r4a workflow JSON 草稿 — phase-2 Worker 映射用

来源：`docs/plans/runner-r4-krea2-multiref-2026-07.md` §4 施工顺序「Worker workflow
部署」的前置材料。以下三份都是在新建测试端点 `pixelvault-runner-r4a-test`
（镜像 `ghcr.io/anteisuba/pixelvault-runner-fork:5.8.6-r4a`）上**直提 workflow
JSON 实测过**的 ComfyUI API-format 图，节点命名风格对齐
`workers/execution/src/models/runner/workflow-builder.ts`，方便 phase-2 直接
参考改写成该文件的参数化分支。底模统一用 `waiIllustriousSDXL_v150.safetensors`
（沿用生产 manifest 的 ddim/normal/clipSkip=2 推荐档）。

## ipadapter_single_b.json — 已验证 ✅

单参考图注入。`IPAdapterUnifiedLoader(preset="PLUS (high strength)")` →
`IPAdapterAdvanced(weight=0.75, combine_embeds="concat")`，`model` 走
ipadapter-apply 输出而非直接走 checkpoint。实测出图：构图/配色被参考图（暖色同心圆）
强烈注入，证明 custom node、文件命名、`extra_model_paths.yaml` 路由全部正确。

首次调用需要 `input.companions_to_fetch` 带两个条目（`target_dir: "ipadapter"` /
`"clip_vision"`，见 fork 仓 README「r4a 新增」小节）触发播种下载（约 3.14GiB，
实测约 3.4 分钟）；此后同一 Volume 上的任何请求都是缓存命中，不再重下。

## ipadapter_multi_c.json — 已验证 ✅（有调参笔记）

两张参考图（暖色同心圆 + 冷色网格）经 `ImageBatch` 合批后喂给**同一个**
`IPAdapterAdvanced`（`combine_embeds="average"`），而非链式两个 IPAdapterAdvanced——
这是 `ComfyUI_IPAdapter_plus` 官方 `examples/ipadapter_combine_embeds.json`
示范的多图正解（NODES.md 也明确写多图走 `combine_embeds`，不是逐张链式加权）。

实测：出图与单图版本、与无 IPAdapter 的回归基线均明显不同，证明两张图确实都进了
流水线；但 `average` 模式下暖色参考图在感知上占主导，冷色网格的影响更多体现在细节
（瞳孔纹样）而非整体色调——这是嵌入空间平均的已知特性，不是 fork 缺陷。phase-2
调参可以试 `combine_embeds="concat"`（保留两张图各自完整嵌入，理论上混合痕迹更均衡）
或分別提高各自 weight 后再平均。

## hiresfix_d.json — ⚠ 已验证复现一个真实 bug，暂不能直接抄

这份 JSON 是「按预期设计」的图（`VAEDecode` → `UpscaleModelLoader
("4x-AnimeSharp.pth")` → `ImageUpscaleWithModel` → `SaveImage`），也是
`workflow-builder.ts` 现有 `upscalerModelFilename` 分支已经在生产代码里实现的
同一模式——但**目前从未被真实调用过**（`upscalerModelFilename` 至今没有调用方传值）。

实测：`UpscaleModelLoader`/`ImageUpscaleWithModel` 两个节点本身完全正常
（用 `LoadImage → Upscale → SaveImage` 独立探针验证，出图正确，1.5s 内完成）；
但只要把 `ImageUpscaleWithModel.image` 接到同一 prompt 里 `VAEDecode` 的输出
（也就是刚采样出来的图，而非从磁盘 LoadImage 进来的图），RunPod job 就会
`status: COMPLETED` 但 **完全没有 `output` 字段、也没有 `error` 字段**——像是
worker 进程在执行到这一步时静默中止，官方 `worker-comfyui/handler.py` 的
websocket 结果收集完全没收到任何东西可返回。4 次独立复现（换 seed 排除节点级
缓存 / 加一个不依赖放大分支的对照 SaveImage 排除"整图一起失败" / 加
`ImageScale` 归一化 pass 排除简单的 dtype 不对齐），现象一致。**反而验证了**：
SDXL 采样分支和放大分支各自独立存在于同一张图里、互不连接时是可以共存成功的
（两个 SaveImage 都出图）——说明不是"两个模型都在显存里"的资源争用，而是
`VAEDecode` 输出张量直接喂给 `ImageUpscaleWithModel` 这条**数据依赖边**本身
有问题。

这份 JSON 按原始设计保留在此仓库供参考，但 **phase-2 接入 Worker 前必须先解决
这个根因**，否则 hires-fix 一上线就会让请求方拿到「表面成功、实际空图」的
静默失败。下一步建议（未验证，留给 phase-2）：

- 查 `runpod/worker-comfyui` 和/或 ComfyUI 0.25.0 的 issue tracker 有没有
  `ImageUpscaleWithModel` 接 `VAEDecode` 直出张量的已知问题；
- 试更高版本 worker-comfyui tag（若 P1 的 Krea2 阻塞后续也要求升级核心版本，
  两件事可以合并验证）；
- 或退一步换路线：`VAEDecode` 先落盘（`SaveImage` 临时文件）再用
  `LoadImage` 重新读回来喂给放大链——探针已证明 LoadImage 来源的图完全正常，
  代价是多一次编解码 I/O，但能绕开这个未知 bug 先把 hires-fix 功能交付。
