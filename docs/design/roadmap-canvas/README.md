# 生成方向图画布 · 源码与调研稿

线上画布：https://claude.ai/artifact/AGugEALDdyBLHMqDeNjaTD （Claude Design 画布，2026-09-23 为 19 页 / 86 张画板 / 43 条便签；owner 在画布上批注 / 删改，AI 每轮先 extract 再合并）。

这里是让**任何 AI 或人**都能重生成、续写那份画布的全部源码。画板是静态 `.dc.html`（内联样式，可在画布里直接编辑），由 `gen/build-*.mjs` 生成；调研稿在 `research/`。

2026-09-23 核对：以生产代码 `5e422f97` 为准校对后，经 Artifact 工具重发（Version 115），回读逐文件一致；改动限于第 7 页进度表 · 第 8 页语音（状态胶囊换行）· 第 1 页总览 / 图片 / 文字 · 第 18 页账号菜单（删「外观」）。09-20 的逐项结论见 [验收报告](research/audit-18-pages-2026-09-20.md)（当时在画布里点 Save 未能持久化，改用 Artifact 工具发布即可）。总逻辑与差异依据见 [项目逻辑图](../../references/project-map.md)，当前进度见 [项目状态](../../status.md)。

## 目录

| 路径                                                        | 内容                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `gen/build.mjs`                                             | 第 1 页 生成方向（四模态树 + 总览 + 路线）                                                                            |
| `gen/build-flow.mjs` + `flow-data.mjs` + `measure-flow.mjs` | 第 2 页 整站画面地图（两遍：先自然流测量，再绝对定位烤连线）                                                          |
| `gen/build-ux.mjs`                                          | 第 3 页 UI/UX 总结（全体 / 用户 / 设计师 / 首页滚动）                                                                 |
| `gen/build-research.mjs` + `build-research-map.mjs`         | 第 4 页 七路调研 + 待拍板 + 调研总图                                                                                  |
| `gen/build-shared*.mjs` + `build-design3.mjs`               | 第 5 页 共享组件 · 第 6 页 助手 / 画布 / 卡片设计                                                                     |
| `gen/build-cards-tavern.mjs`                                | 第 6 页 卡片 · 酒馆（SillyTavern）对照板（借 / 不借 / 独有 / 拍板 / 字段草案）                                        |
| `gen/build-progress.mjs`                                    | 第 7 页 改进进度表 · 第 8 页 语音方案                                                                                 |
| `gen/build-master.mjs` + `build-d1.mjs`                     | 第 9 页 总清单 · 设计流程 · 美术方法 · D1 思维导图                                                                    |
| `gen/build-ui-inventory.mjs`                                | 第 10 页 UI 全清单（渲染 `research/ui-inventory.md`）                                                                 |
| `gen/build-d2.mjs` + `build-d2-ui.mjs`                      | 第 11 页 D2 反问对照 · 思维导图 · ④ 选择器 / 表单 / 规格 chip 画板                                                    |
| `gen/build-d3.mjs` + `build-d3-ui.mjs`                      | 第 12 页 D3 ① 反问（key 门 / settings / 胶囊）+ ④ 画板                                                                |
| `gen/build-d4.mjs` · `build-d7*.mjs` · `build-d56*.mjs`     | 第 13 页 D4 · 第 14 页 D7 助手 · 第 15 / 16 页 D56a / D56b                                                            |
| `gen/build-d10*.mjs` · `build-d11.mjs`                      | 第 17 页 D10 标签台 · 第 18 页 D11 账号入口                                                                           |
| `gen/canvas-live.json`                                      | 画布布局（页 · 画板位置尺寸 · owner 便签）。**重生成前先从线上 extract 覆盖它**，否则会丢 owner 的批注                |
| `gen/live1/Artboard*.dc.html`                               | 直接在画布上写的板，原样保留：Artboard 1–3 = owner 手绘（助手 / 卡片 / 画布）；Artboard4 = 第 19 页 09-21–23 会话记录 |
| `research/*.md`                                             | 一手调研稿（图片 / NAI / 视频 / 语音 ×3 / LLM / Runner / 卡片 / 人声提取 / UI 全清单 / 酒馆角色卡）                   |
| `whitebox/compare.jpg`                                      | 视频转白模试验对比帧（进度表引用）                                                                                    |

## 重生成步骤（Claude Code · design skill）

```bash
S=<design skill 目录，含 seed-canvas.mjs 与 payload.template.html>
cd docs/design/roadmap-canvas/gen
# 0. 取线上最新布局（保住 owner 便签）
node $S/seed-canvas.mjs --extract <下载的线上 html> --to live && cp live/canvas.json canvas-live.json
# 1. 重建画板（改哪页跑哪个）
node build.mjs && node build-ux.mjs && node build-research.mjs && node build-research-map.mjs \
 && node build-shared.mjs && node build-shared2.mjs && node build-shared3.mjs && node build-design3.mjs \
 && node build-progress.mjs && node build-master.mjs && node build-d1.mjs && node build-ui-inventory.mjs
rm -f flow-layout.json && node build-flow.mjs && node measure-flow.mjs && node build-flow.mjs
# 2. 量高度（改了内容的板）并回填 canvas-live.json 的 h
node measure-new.mjs Progress MasterList
#    ⚠ 只替换改过的板：先 cmp 线上 extract 版与本地生成版，不同 = owner 在画布上手改过，先把改动并回源码
# 3. 按 canvas-live.json 生成 args（Artboard*.dc.html 前缀 live1/），seed，发布前必 extract 核对页数
python3 - <<'PY'
import json;c=json.load(open('canvas-live.json'));live={'Artboard.dc.html','Artboard2.dc.html','Artboard3.dc.html','Artboard4.dc.html'}
open('args.txt','w').write(''.join('--artboard\n'+(('live1/' if a['file'] in live else '')+a['file'])+'\n' for a in c['artboards']))
PY
tr '\n' '\0' < args.txt | xargs -0 node $S/seed-canvas.mjs --template $S/payload.template.html \
  --out pixelvault-generation-roadmap.html --title "PixelVault 生成方向图" --canvas canvas-live.json
node $S/seed-canvas.mjs --extract pixelvault-generation-roadmap.html --to selfchk   # 核对 pages / artboards / annotations 数
# 4. 用 Artifact 工具以 url=https://claude.ai/artifact/AGugEALDdyBLHMqDeNjaTD 重发（不传 contract / capabilities 即沿用 0.1.31），再 read + extract 回读核对
```

约定：画板内联样式、不带脚本；owner 批注用 `reply(n, 问, [答…])` 黄框、已落地用 `done(...)` 绿框追加在板底；进度表状态用「已完成 · <commit>」。设计流程与队列见画布第 9 页。
