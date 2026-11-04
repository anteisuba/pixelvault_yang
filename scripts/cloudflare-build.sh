#!/usr/bin/env bash
# Cloudflare（OpenNext）构建：open-next.config.ts 的 buildCommand 调它。
#
# 1. Prisma 客户端按 workerd 运行时重新生成：默认（Node）版本用 base64 字符串现场编译
#    查询引擎 wasm，Workers 禁止运行时编译 wasm（"Wasm code generation disallowed"），
#    workerd 版本改成直接 import .wasm 文件。只改生成物，schema 文件不动。
# 2. next build 用 webpack（Turbopack 产物超 Workers 64 MiB 上限），并打开
#    ANTEI_CLOUDFLARE_BUILD（next.config.ts：服务端 Sentry 换 Cloudflare 版）。
#
# ⚠ 跑完后本地 src/lib/generated/prisma 是 workerd 版；回到 next dev / Vercel 前跑一次
#    `npx prisma generate` 换回来。
set -euo pipefail

schema_dir="$(mktemp -d)"
trap 'rm -rf "$schema_dir"' EXIT
sed 's|^  provider = "prisma-client"$|  provider = "prisma-client"\n  runtime  = "workerd"|' \
  prisma/schema.prisma > "$schema_dir/schema.prisma"
sed -i "s|^  output   = \"../src/lib/generated/prisma\"$|  output   = \"$PWD/src/lib/generated/prisma\"|" \
  "$schema_dir/schema.prisma"
grep -q 'runtime  = "workerd"' "$schema_dir/schema.prisma"
npx prisma generate --schema "$schema_dir/schema.prisma"

ANTEI_CLOUDFLARE_BUILD=1 npx next build --webpack
