# 设计总图 · 画布源码与调研稿

线上画布：https://claude.ai/artifact/AGugEALDdyBLHMqDeNjaTD —— **以画布为准**。2026-09-23 由原 19 页 / 86 张画板浓缩为 5 页 / 20 张（Version 119），owner 便签与手绘板的内容已并入各页后删除。

| 页           | 内容                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| 1 · 总览     | 产品是什么 · 业务地图与依赖层（层 0 底座 → 层 1 并行 → 层 2 画布 → 层 3 收尾）· 设计流程与原则 |
| 2 · 业务设计 | 10 个业务各一张：已定的设计 · 现状 · 待决 · 依赖                                               |
| 3 · UI 总纲  | 视觉语言 · 交互原则与共享组件 · 页面清单与仍存在的不一致                                       |
| 4 · 进度表   | 按业务分组、业务按依赖排序；已完成压在最后一段                                                 |
| 5 · 厂商速查 | 图片 · 视频 · 语音 · 文字 · Runner 的一手事实                                                  |

## 目录

| 路径                    | 内容                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `gen/build-digest.mjs`  | **唯一内容源**：五页全部文字都在这里；跑一次写出 `gen/digest/*.dc.html` 与 `digest/*.md` |
| `gen/digest-render.mjs` | 渲染层（画板样式、状态胶囊、Markdown 镜像）                                              |
| `gen/layout-digest.mjs` | 量画板高度，写 `gen/canvas-live.json`（页 · 位置 · 尺寸）与 `gen/args.txt`               |
| `digest/page-*.md`      | 画布的 Markdown 镜像，给 AI 与人直接读；生成物，不要手改                                 |
| `research/*.md`         | 一手调研全文与来源链接（厂商速查页引用）                                                 |

## 改画布的步骤

```bash
S=<design skill 目录，含 seed-canvas.mjs 与 payload.template.html>
cd docs/design/roadmap-canvas/gen
# 0. owner 若在画布上改过：先 read 线上 → extract，把改动并回 build-digest.mjs（便签 / 手改都要合并，不能被覆盖）
node $S/seed-canvas.mjs --extract <下载的线上 html> --to live
# 1. 改 build-digest.mjs 后生成画板与 Markdown（Markdown 再过一遍 prettier，与提交钩子一致）
node build-digest.mjs && npx prettier --write ../digest
# 2. 排版（量高度 → canvas-live.json + args.txt）
node layout-digest.mjs
# 3. 组装，发布前 extract 自检页数 / 画板数
tr '\n' '\0' < args.txt | xargs -0 node $S/seed-canvas.mjs --template $S/payload.template.html \
  --out pixelvault-digest.html --title "PixelVault 生成方向图" --canvas canvas-live.json
node $S/seed-canvas.mjs --extract pixelvault-digest.html --to selfchk
# 4. Artifact 工具以 url=https://claude.ai/artifact/AGugEALDdyBLHMqDeNjaTD 发布（不传 contract / capabilities），再 read + extract 回读逐文件核对
```

约定：画板内联样式、不带脚本；状态只用 `digest-render.mjs` 里的词表；进度表的 # 沿用原编号，已完成写 commit。原 19 页的生成脚本与画板已删除，需要时从 git 历史取（最后一版在 `9529fe87`）。
