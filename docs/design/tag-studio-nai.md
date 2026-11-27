# 标签台与 NAI：待做清单

施工单 `p-tag-studio-opt`（UI 交互那三条在 `u-tag-studio-ui`）。NAI 目标（10-23 owner）：**NAI 网页端能做的，我们都能做**，助手也要适配。owner 是 NAI 无限档，NAI 出图实测不用先问。

来源（云端，已停更，以本文为准）：NAI5 调研 https://claude.ai/artifact/UmxGU2pkiCrZ7RkWY6KSR4 · NAI Launcher 对照 https://claude.ai/artifact/F2EdTFRkhevoVwzBCgDGpz · PixAI Tagger 调研 https://claude.ai/artifact/D3PQyuPax7gnT4Js5DryvN

## 调研结论（10-22～10-23）

- NAI 官方**没有**任意图反推标签 / 画师。最准是读 NAI 原图 PNG 元数据（已做：「从图读串」#435 #438）；任意图拿画风用 V4.5 精确参考「画风」模式；任意图认画师 / 角色用 PixAI Tagger（已接进助手 #427，CPU 一张约 5 秒）。
- 对照基准：Aaalice233/Aaalice_NAI_Launcher（请求体照网页端实测）。社区 SDK LlmKira/novelai-python 可作接口字段参考。
- 请求体对齐（Curated 重绘回落、预设发名字、V5 默认 CFG 4 / 28 步、seed−1、精确参考 1−忠实度等）#358 已做；人数上限 22 不改（Launcher 也是 22）。

## 待做（按建议顺序）

| #   | 事项                                    | 备注                                                                                                                                                                                                    |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | 小修                                    | ✅ #358                                                                                                                                                                                                 |
| ②   | 读回 NAI 图提示词                       | ✅ #435                                                                                                                                                                                                 |
| ③   | 标签台补 NAI5 写法                      | ✅ 原生 `weight::tag::` / `-2::tag::`、复杂度与 V5/V5 Medium 助手指南（Slice 2 / 4）                                                                                                                    |
| ④   | 精确参考画风模式                        | ✅ Slice 0–4 已做：默认 `character&style`、三档比例黑边（1024×1536 / 1536×1024 / 1472²）、多张参考（V5 含 `outfit` + `preferSameOutfit`）、画布 v4 与助手 v3 全接管                                     |
| ⑤   | Effort 档 + 透明背景                    | ✅ V5 Full Medium（`nai-diffusion-5-full-medium`）已接                                                                                                                                                  |
| ⑥   | Director / 放大 / 增强                  | `/ai/augment-image`（去背景 / 线稿 / 草图 / 上色 / 换表情 / 去杂物）、`/ai/upscale`；放编辑域（不在本轮范围）                                                                                           |
| ⑦   | NAI 认知度标记                          | ✅ Slice 5A：补全行与聚焦微调条展示认知度圆点、`冷门` / `未收录` 标记与样本热度                                                                                                                         |
| ⑧   | 社区资料                                | 元素法典、nai-bot 图鉴；V5 要实测（待定）                                                                                                                                                               |
| ⑨   | Gelbooru / AIBooru / e621 标签          | 待定                                                                                                                                                                                                    |
| ⑩   | Vibe 迁移、重绘强度滑块、读回元数据     | 重绘强度滑块与读回元数据 ✅ 已做；**Vibe 迁移跳过**（2026-11-27 实查 `novelai.net/image` 确认 V5 全系无 Vibe Transfer，V4.5 与精确参考/重绘互斥，owner 定跳过）                                         |
| ⑪   | 中英文词库                              | ✅ Slice 5A：复用 MIT 许可的 `DanbooruTagName` 表，支持中文/日文 1 字起查并在补全行展示英文 + 中文名 + 热度 + 认知度                                                                                    |
| ⑫   | 用意思找标签                            | ✅ Slice 5A：`workers/semantic-index` 语义检索已接进 NAI 与非 NAI 标签台补全（含 `语义` 来源标）                                                                                                        |
| ⑬   | 对照 W.O.F_NAI_Launcher                 | ✅ Slice 5B：原位中文对照芯片带（方案 A）、画风块保存（含负面与采样参数）与一键叠加、行内动态语法（`{a\|b}` / `{>a\|b}`）+ 积木舞台宽面板（固定/顺序/随机 + 锁定 + 独立权重）、`Ctrl/⌘+拖选` 查共现标签 |
| —   | PixAI Tagger 的标签台按钮、画廊自动打标 | 标签台入口 ✅ 已在「从图读串」里自动回落 PixAI Tagger；画廊自动打标另议                                                                                                                                 |

刷新后提示词仍在是现有行为，不用改。

## UI 部分（`u-tag-studio-ui`）

✅ 全部完成：① 切换条滚轮切整体 / 角色 N ② 大加角色按钮（`StudioTagAddCharacter`）③ 负面紧挨正面（方向 1「左编右画」满高双栏，Slice 2）④ 纯文本 #436。长相以 `references/ui-spec.md` 为准。
