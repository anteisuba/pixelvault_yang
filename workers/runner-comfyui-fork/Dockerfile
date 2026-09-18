# PixelVault Runner — worker-comfyui fork (v2 runtime LoRA download).
# 包装官方 handler 下载模型，并安装随生成 PNG 输出文件证据的加载节点。
# 关键：不覆盖 CMD —— 继承官方 `CMD ["/start.sh"]`，ComfyUI 仍由 start.sh 后台启动，
# start.sh 末尾的 `python -u /handler.py` 于是跑我们的 wrapper。
#
# tag 必须与端点当前版本一致（现 5.8.6）；升级 worker-comfyui 时同步改这行 + 复核 README。
# requests / runpod 官方镜像 venv 已带（官方 handler 就用），故不额外 pip，避免动 venv。
FROM runpod/worker-comfyui:5.8.6-base

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

# 不设 CMD / ENTRYPOINT —— 继承官方 `CMD ["/start.sh"]`。
