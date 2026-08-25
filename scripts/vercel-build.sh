#!/usr/bin/env bash
# Vercel Build Command（vercel.json 的 buildCommand 指向这里）。
#
# 为什么不再是一行 `prisma migrate deploy && next build`：
#   Preview 与 Production 在 Vercel 项目设置里共用同一个 Neon 库，而
#   `scripts/vercel-ignore-build.sh` 只按改动路径决定建不建、不按 VERCEL_ENV
#   分支。合起来的后果是：任何 feature 分支只要碰了 prisma/ 等受监视路径并
#   push，**在合并进 main 之前** schema 就已经改到生产库上了。
#
#   所以迁移只在 VERCEL_ENV=production 时跑。Preview 拿到的是「代码是新的、
#   schema 还是旧的」——带新迁移的分支在 Preview 上会在相关代码路径报错，
#   这是**期望行为**：它把「这条分支需要迁移」暴露出来，而不是偷偷改生产库。
#
#   ⚠ 生产路径的语义与原来完全一致：迁移仍先于 next build，迁移失败仍然
#   短路掉整个构建（set -e）。docs/checklists/database.md 的 expand-contract
#   理由、prisma/migration-safety.test.ts 防的那个失败模式，都不受影响。
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  # DIRECT_URL 必须是 Neon 的 direct 端点。若有人把 pooler 串粘了进来，
  # 迁移会继续跑在 PgBouncer 上——advisory lock 不可靠，正是上一笔改动要
  # 消灭的东西，且**没有任何症状**。宁可在这里大声炸掉。
  # 只判子串，绝不回显 URL 本身（含明文密码）。
  if [[ "${DIRECT_URL:-}" == *"-pooler"* ]]; then
    echo "DIRECT_URL 指向的是 pooler 端点（主机名含 -pooler），迁移不能跑在上面。" >&2
    echo "请在 Vercel 项目设置里把 DIRECT_URL 换成 Neon 里主机名不带 -pooler 的那条连接串。" >&2
    exit 1
  fi
  echo "VERCEL_ENV=production —— 执行 prisma migrate deploy"
  prisma migrate deploy
else
  echo "VERCEL_ENV=${VERCEL_ENV:-<unset>} —— 跳过 prisma migrate deploy（只有 production 才迁移）"
fi

next build
