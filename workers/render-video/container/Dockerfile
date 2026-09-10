# 剪辑台渲染容器（S9 · spec §6「渲染层」）。
#
# ── 许可边界（⚠ 读这一段再改任何 configure 开关）─────────────────────────
# FFmpeg 基座是 **LGPL 2.1+**。一旦 `--enable-gpl` 或链入 libx264 / libx265，
# **整个产物转为 GPL**（ffmpeg.org/legal.html，查阅 2026-09-09），官方明确不提供
# 任何付费专有例外。GPL 的义务由**分发**触发，我们只在自己的容器里跑、只把成片
# 交给用户，通常不构成分发 —— 但那条论证要靠法务背书，而这一层是「渲染一条片子」，
# 不值得为它欠一个法务判断。
#
# 所以本镜像走 **LGPL-clean**：
#   ⛔ 不给 `--enable-gpl`、⛔ 不给 `--enable-nonfree`、⛔ 不链 libx264 / libx265；
#   ✅ H.264 编码用 **libopenh264**（Cisco，BSD-2-Clause，二进制专利费由 Cisco 承担）；
#   ✅ 音频用 FFmpeg 原生 AAC 编码器（无外部库）。
# 代价：openh264 的压缩效率比 x264 差一档（同画质文件更大约 20–30%）。这一期接受 ——
# 成片存在 R2、出网免费，文件大一点的账单远小于一个许可判断的代价。
# 要换回 x264（更小的文件）必须先过法务，并把结论写回本文件与 README。
#
# ⚠ H.264 的**专利**许可（MPEG LA）与版权许可是**两层**，与本文件的选择无关。

FROM debian:bookworm-slim

# Debian 主仓的 ffmpeg 是 GPL 构建（链了 x264），所以**不能** apt install ffmpeg。
# 自己 configure 一份 LGPL 的。
ARG FFMPEG_VERSION=7.1
ARG OPENH264_VERSION=2.4.1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      nasm \
      pkg-config \
      xz-utils \
      nodejs \
    && rm -rf /var/lib/apt/lists/*

# libopenh264（BSD-2-Clause）。
RUN curl -fsSL "https://github.com/cisco/openh264/archive/refs/tags/v${OPENH264_VERSION}.tar.gz" \
      -o /tmp/openh264.tar.gz \
    && tar -xzf /tmp/openh264.tar.gz -C /tmp \
    && make -C "/tmp/openh264-${OPENH264_VERSION}" -j"$(nproc)" PREFIX=/usr/local install-shared \
    && ldconfig \
    && rm -rf /tmp/openh264*

# FFmpeg —— ⚠ configure 里**没有** --enable-gpl / --enable-nonfree / --enable-libx264。
RUN curl -fsSL "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
      -o /tmp/ffmpeg.tar.xz \
    && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp \
    && cd "/tmp/ffmpeg-${FFMPEG_VERSION}" \
    && ./configure \
         --prefix=/usr/local \
         --enable-shared \
         --disable-static \
         --enable-version3 \
         --enable-libopenh264 \
         --disable-debug \
         --disable-doc \
         --disable-ffplay \
    && make -j"$(nproc)" \
    && make install \
    && ldconfig \
    && cd / \
    && rm -rf /tmp/ffmpeg*

WORKDIR /app
COPY server.mjs /app/server.mjs

# 中间件与成片都落在这里。⚠ 步骤级幂等靠「文件在不在」，所以这个目录**不能**是
# tmpfs 之外的什么每步都被清掉的东西。
RUN mkdir -p /work
ENV RENDER_WORK_DIR=/work
ENV PORT=8080
EXPOSE 8080

CMD ["node", "/app/server.mjs"]
