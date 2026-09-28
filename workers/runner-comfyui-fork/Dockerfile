# PixelVault Runner — worker-comfyui fork (v2 runtime LoRA download).
# 包装官方 handler 下载模型，并安装随生成 PNG 输出文件证据的加载节点。
# 关键：不覆盖 CMD —— 继承官方 `CMD ["/start.sh"]`，ComfyUI 仍由 start.sh 后台启动，
# start.sh 末尾的 `python -u /handler.py` 于是跑我们的 wrapper。
#
# 两个底座（2026-09-28 owner 定）：
# - final（主端点）：官方 5.10.0-base = CUDA 12.8 + ComfyUI 0.34，官方测过的组合，
#   不再手动切 ComfyUI 版本。5.8.6 上切 0.37 会把 PyTorch 拉到 2.12 + CUDA 13，
#   主端点绑在 EU-RO-1 一个机房，再限 CUDA 13 的机器可用量太少。
# - qwen-evaluation（独立评估端点）：Qwen-Image 2.1 要 0.37 的 TextEncodeQwenImage21，
#   保持 5.8.6-base + 钉 0.37，与 09-21 评估镜像一致。
# 升级 worker-comfyui 时同步改 FROM + 复核 README 的核对点。
# requests / runpod 官方镜像 venv 已带（官方 handler 就用），故不额外 pip，避免动 venv。
FROM runpod/worker-comfyui:5.10.0-base AS runtime

# 保留官方 handler，再把 wrapper 放到官方入口路径。
RUN mv /handler.py /handler_base.py
RUN grep -q -- '--disable-metadata' /start.sh \
    && sed -i 's/ --disable-metadata//g' /start.sh \
    && ! grep -q -- '--disable-metadata' /start.sh
# rp_handler imports sibling modules at import time — copy them next to /handler.py.
COPY rp_handler.py /handler.py
COPY runner_payload.py /runner_payload.py
COPY comfy_models.py /comfy_models.py
COPY cache_policy.py /cache_policy.py
COPY cache_manifest.py /cache_manifest.py
COPY model_evidence.py /comfyui/custom_nodes/pixelvault_model_evidence/__init__.py

RUN cd /comfyui && timeout 300 python main.py --quick-test-for-ci --cpu

FROM runpod/worker-comfyui:5.8.6-base AS qwen-runtime

ARG COMFYUI_COMMIT=73c9bad4d21e7addbe1d13bc92eee0f1431b017d
RUN git -C /comfyui fetch --depth 1 origin ${COMFYUI_COMMIT} \
    && git -C /comfyui checkout --detach ${COMFYUI_COMMIT} \
    && uv pip install -r /comfyui/requirements.txt "transformers>=4.50.3,<5" "huggingface-hub<1.0"

RUN mv /handler.py /handler_base.py
RUN grep -q -- '--disable-metadata' /start.sh \
    && sed -i 's/ --disable-metadata//g' /start.sh \
    && ! grep -q -- '--disable-metadata' /start.sh
COPY rp_handler.py /handler.py
COPY runner_payload.py /runner_payload.py
COPY comfy_models.py /comfy_models.py
COPY cache_policy.py /cache_policy.py
COPY cache_manifest.py /cache_manifest.py
COPY model_evidence.py /comfyui/custom_nodes/pixelvault_model_evidence/__init__.py

RUN cd /comfyui && timeout 300 python main.py --quick-test-for-ci --cpu

FROM qwen-runtime AS qwen-evaluation
COPY qwen_workflow.py /qwen_workflow.py
RUN python /qwen_workflow.py --download-models /comfyui/models

FROM runtime AS final

# 不设 CMD / ENTRYPOINT —— 继承官方 `CMD ["/start.sh"]`。
