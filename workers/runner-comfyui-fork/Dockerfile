# PixelVault Runner — worker-comfyui fork (v2 runtime LoRA download).
# 官方镜像基础上只加一个 wrapper handler，先下 loras_to_fetch 再跑 ComfyUI。
# tag 见 github.com/runpod-workers/worker-comfyui/releases —— 与端点 v1 保持同版。
FROM runpod/worker-comfyui:5.8.6-base

# requests 官方镜像通常已带；显式装一遍防缺。
RUN pip install --no-cache-dir requests

COPY rp_handler.py /rp_handler.py

# 用我们的 wrapper 作入口（它 import 官方 handler 再包一层下载）。
# ⚠ 若 base 镜像的 handler 不在默认 PYTHONPATH / 启动方式不同，见 README 调整。
CMD ["python", "-u", "/rp_handler.py"]
