# 生成方向图画布 · 源码与调研稿

线上画布：https://claude.ai/artifact/AGugEALDdyBLHMqDeNjaTD （Claude Design 画布，12 页，实时更新；owner 在画布上批注 / 删改，AI 每轮先 extract 再合并）。

这里是让**任何 AI 或人**都能重生成、续写那份画布的全部源码。画板是静态 `.dc.html`（内联样式，可在画布里直接编辑），由 `gen/build-*.mjs` 生成；调研稿在 `research/`。

## 目录

| 路径                                                        | 内容                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `gen/build.mjs`                                             | 第 1 页 生成方向（四模态树 + 总览 + 路线）                                                             |
| `gen/build-flow.mjs` + `flow-data.mjs` + `measure-flow.mjs` | 第 2 页 整站画面地图（两遍：先自然流测量，再绝对定位烤连线）                                           |
| `gen/build-ux.mjs`                                          | 第 3 页 UI/UX 总结（全体 / 用户 / 设计师 / 首页滚动）                                                  |
| `gen/build-research.mjs` + `build-research-map.mjs`         | 第 4 页 七路调研 + 待拍板 + 调研总图                                                                   |
| `gen/build-shared*.mjs` + `build-design3.mjs`               | 第 5 页 共享组件 · 第 6 页 助手 / 画布 / 卡片设计                                                      |
| `gen/build-progress.mjs`                                    | 第 7 页 改进进度表 · 第 8 页 语音方案                                                                  |
| `gen/build-master.mjs` + `build-d1.mjs`                     | 第 9 页 总清单 · 设计流程 · 美术方法 · D1 思维导图                                                     |
| `gen/build-ui-inventory.mjs`                                | 第 10 页 UI 全清单（渲染 `research/ui-inventory.md`）                                                  |
| `gen/build-d2.mjs` + `build-d2-ui.mjs`                      | 第 11 页 D2 反问对照 · 思维导图 · ④ 选择器 / 表单 / 规格 chip 画板                                     |
| `gen/build-d3.mjs`                                          | 第 12 页 D3 ① 反问（key 门 / settings / 胶囊）                                                         |
| `gen/canvas-live.json`                                      | 画布布局（页 · 画板位置尺寸 · owner 便签）。**重生成前先从线上 extract 覆盖它**，否则会丢 owner 的批注 |
| `gen/live1/Artboard*.dc.html`                               | owner 手绘的三张板（助手 / 卡片 / 画布），原样保留                                                     |
| `research/*.md`                                             | 一手调研稿（图片 / NAI / 视频 / 语音 ×3 / LLM / Runner / 卡片 / 人声提取 / UI 全清单）                 |
| `whitebox/compare.jpg`                                      | 视频转白模试验对比帧（进度表引用）                                                                     |

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
# 3. 按 canvas-live.json 生成 args（Artboard*.dc.html 前缀 live1/），seed，发布前必 extract 核对页数
python3 - <<'PY'
import json;c=json.load(open('canvas-live.json'));live={'Artboard.dc.html','Artboard2.dc.html','Artboard3.dc.html'}
open('args.txt','w').write(''.join('--artboard\n'+(('live1/' if a['file'] in live else '')+a['file'])+'\n' for a in c['artboards']))
PY
tr '\n' '\0' < args.txt | xargs -0 node $S/seed-canvas.mjs --template $S/payload.template.html \
  --out pixelvault-generation-roadmap.html --title "PixelVault 生成方向图" --canvas canvas-live.json
node $S/seed-canvas.mjs --extract pixelvault-generation-roadmap.html --to selfchk   # 核对 pages / artboards / annotations 数
# 4. 用 Artifact 工具以 url=https://claude.ai/artifact/AGugEALDdyBLHMqDeNjaTD、contract 0.1.31 重发
```

约定：画板内联样式、不带脚本；owner 批注用 `reply(n, 问, [答…])` 黄框、已落地用 `done(...)` 绿框追加在板底；进度表状态用「已完成 · <commit>」。设计流程与队列见画布第 9 页。
