# public/homepage/v6 — 首页 v6 的素材

施工图：`docs/references/pages/home.md` §v6。讨论记录：`docs/design/home-v6.md`。

| 文件                                                                                            | 是什么                                                                  | 出处                                                                      |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `her.webp`                                                                                      | 她的头像原图，2000×2000，左边和下边是裁开的                             | 站内（第 3 轮前定稿）                                                     |
| `whale.webp`                                                                                    | 小鲸，1024×1024，透明底                                                 | owner 图库 图\_2075（gpt-image-2），白底从四边漫水抠掉                    |
| `models/gpt-*.webp`                                                                             | 模型名单 GPT Image 那一行展开的三张：街头人像 / 一周早餐图鉴 / 书店剖面 | 图\_2104 / 2103 / 2102（gpt-image-2）                                     |
| `models/gemini-*.webp`                                                                          | Gemini 那一行：面包师 / 骑车下坡 / 山谷木屋                             | 图\_2100 / 2095 / 2092（gemini-3-pro-image-preview）                      |
| `models/seedream-*.webp`                                                                        | Seedream 那一行：杂志封面 / 夏日祭海报 / 晚安咖啡                       | 图\_2108 / 2107 / 2098（seedream-5.0-pro）                                |
| `models/novelai-*.webp`                                                                         | NovelAI 那一行：三人同框 / 赛璐璐 / 水彩 / 厚涂 / 90 年代复古           | 图\_2090 / 2086 / 2084 / 2083 / 2089（nai-diffusion-5-full）              |
| `marks/novelai.svg` `marks/fishaudio.svg` `marks/minimax-color.svg` `marks/bytedance-color.svg` | 名单里的品牌标                                                          | `@lobehub/icons-static-svg`（MIT，https://github.com/lobehub/lobe-icons） |
| `marks/wan.png`                                                                                 | Wan 的标，64×64                                                         | 官网 wan.video 的 favicon（lobe-icons 没有这一家）                        |

图都从图库原图压到高 600px 的 webp（名单素材条电脑上最高 240px，两倍屏够用）。OpenAI / Gemini 的标用 `HomeV4ModelLogo.tsx` 里现成的路径。其余素材沿用 `public/homepage/production/`（quad、lora、voice、umbrella、models/video）。
