# 首页施工图 — marketing home（v4 翻页站）

> **当前基准：v4「翻页站」，2026-08-28 上线。** 旧的 v3 单页滚动站已于同日整体退役（组件 / 皮肤 / 常量 / 专属 message 键全删，历史见 git）。
> 改首页只看本文。**⛔ 不要照 §「已退役」以外的旧文档施工。**

## 结构：13 竖页 × 5 横向站

页面不滚动。整站是一叠竖直翻页，一次一页，键盘 / 滚轮 / 触摸各算一步。

| #    | 页         | 组        | 说明                                                                        |
| ---- | ---------- | --------- | --------------------------------------------------------------------------- |
| 1    | `opening`  | `opening` | 口径行 + 两行标题 + 10 张真实归档结果 + 供应商跑马灯                        |
| 2–7  | 六个功能页 | `feature` | `image` 01 / `lora` 02 / `audio` 03 / `video` 04 / `canvas` 05 / `vault` 06 |
| 8–12 | 五个模型站 | `models`  | `modelsImage` / `modelsLora` / `modelsVideo` / `modelsAudio` / `models3d`   |
| 13   | `finale`   | `finale`  | CTA + 页脚三链                                                              |

**五个模型站是横向的**：进站后左右翻模型，翻完最后一个才把竖轴放开继续下一页。每站的模型数不等——图片 7 / LoRA 6 / 视频 6 / 音频 2 / 3D 4，合计 **25 个**（`HOME_V4_STATIONS`）。

⚠ **曾经有第 14 页「价目清单」**（四栏列全目录与单价），2026-08-28 owner 看实物后整页删除（「这个页面不需要。之前的设计页面也没有这个」）。随它一起退役的还有 topbar 的「定价」跳转——**目标页没了就不留链接**。要恢复得先有页面。

## 事实出处

| 东西                      | 唯一出处                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| 引擎参数 / 页表 / 站表    | `src/constants/homepage-v4.ts`                                     |
| 皮肤                      | `src/app/home-v4.css`（全部规则挂 `.home-v4` 下）                  |
| 组件                      | `src/components/business/home-v4/`                                 |
| 图片资产                  | `public/homepage/v4/`（清单见同目录 `_manifest.md`）               |
| 文案                      | `src/messages/{en,ja,zh}.json` 的 `Homepage.v4.*` + 6 个顶层键     |
| 口径数字（模型/供应商数） | `HOMEPAGE_MODEL_COUNTS`（`src/constants/homepage.ts`，实时数目录） |

**动效时钟只有一份。** `HOME_V4_ENGINE`（`PAGE_MS: 850` / `LOCK_MS: 900` / `WHEEL_THRESHOLD: 46` / `TOUCH_THRESHOLD_PX: 52`）与 `HOME_V4_PARALLAX` 由 `HomeV4Shell` 作为 CSS 自定义属性推到域根；`home-v4.css` 里的同名值只是 fallback。**改时长改常量，不要改 CSS**，否则两个钟会漂。

## 硬约束

1. **服务端优先**：`page.tsx` → `HomeV4Shell`（server）→ `HomeV4Deck`（唯一 client 边界）。标题、模型名、页表都在首个 HTML 响应里，页面保持 `revalidate = 3600` 可边缘缓存。
2. **域内自足**：`.home-v4` 之外不声明域 token。画布皮肤曾经这样漏进两个助手 dock。
3. **CJK 选面用 `.home-v4[data-locale='ja']`，不要用 `:root[lang^='ja']`**——`<html lang>` 由根 layout 写，客户端导航时不重渲染，切到日文后 `lang` 还停在旧值，日文会被 Noto Sans SC 的简体字形画出来。域根自己带 `data-locale`，随语段重渲染，零脚本就对。（`<html lang>` 本身的陈旧影响读屏，由 `src/components/layout/LocaleHtmlSync.tsx` 单独补。）
4. **模型阵容走真目录**，不手抄清单：名称 `MODEL_MESSAGE_KEYS`，供应商 `getProviderLabel`。首页宣传产品跑不了的模型是硬伤，而手抄的清单必然腐烂。
5. **动画库**：首页域是全项目唯一允许 GSAP 的地方，且必须动态导入不进主 chunk；app 内部一律 `motion`（见 CLAUDE.md 动画库分工）。
6. **中文排版三条**（都踩过）：标题行高 ≥1.14（1.0 会重叠，CJK 字身满高）；`max-width: Nem` 按容器自己字号算，别拿它约束大标题；必须 `word-break: keep-all; line-break: strict`，否则中文会在任意两字间断行。判断行距**不要看 `getClientRects`**——它算回退字体的完整 ascent+descent，会误报重叠。

## 功能页 01 · 图片

- 桌面端工作台保持 860px 外宽，结果四宫格固定 500px；扣除 13px 栏间距后，输入列与结果列约为 **39:61**。输入区只承担提示词与生成动作，图片是页面主对象。
- 四宫格仍为 2×2 方图，单格在 1920×855 实测为 245×245px；`next/image` 的桌面 `sizes` 与该槽位同步为 250px。
- `≤768px` 改为输入区在上、四宫格在下，四宫格宽度回落到 100%，不得沿用桌面 500px 固定宽度造成横向溢出。

## 测试

- `src/components/business/home-v4/home-v4.test.ts` —— 页表形状（13 页、id 唯一、opening 首 finale 末、站序）、资产存在性、三语键齐（含模板字面量拼出来的那批：`completeness.test.ts` 只看写死的字符串，看不见它们）。
- `HomeV4Deck.test.tsx` / `HomeV4Fn.test.tsx` / `HomeV4Model.test.tsx` —— 翻页引擎与锁、功能页时间线、模型页与详情面板。
- `src/i18n/messages-split.test.ts` —— `Homepage` / `Auth` 命名空间的消费者白名单。**新增读这两个命名空间的组件必须登记**，否则 `(main)` 的 provider 会把字串丢掉，线上直接渲染出 key。

## 相邻域

登录页（`/sign-in` `/sign-up`）**不共享**本域皮肤：它有自己的 `src/app/auth.css`（`.auth-surface`），文案挂自己的 `Auth` 命名空间，载体 `AuthCard.tsx` 与 `AuthDialog` 是同一张卡。首页顶栏的登录按钮登录前后长得一样、只换目标，为的是边缘缓存的页面不必等 Clerk 才能画。

## 已知缺口

- 页脚「资源 / 公司」类链接在 v3 时代是 `#` 死链；v4 页脚只保留 tagline + 条款 + 隐私三条真链，那批占位**已随 v3 删除**，没有恢复计划。
- 音频站只有 2 个模型，与图片站的 7 个并排时横轴明显短；等音频域把模型接上，不为此改版式。
- 英 / 日排版未逐页真机复核过（三语文案齐全，键有测试守）。

## Last Verified

- 2026-08-30 · 图片功能页收窄输入列、放大四宫格；Chrome 1920×855 实测工作台 860px、输入 315px、结果 500px、单格 245px，无页面横向溢出。
- 2026-08-28 · v4 上线；v3 整体退役；价目页按 owner 拍板删除，站结构回到 13 页。
