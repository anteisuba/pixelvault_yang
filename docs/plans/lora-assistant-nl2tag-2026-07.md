# LoRA 助手与自然语言→tag 转换 施工图（图四+图五）

> 状态：**v1.1 已拍板（2026-07-18，Fable；§7 五项当日过 owner——宿主 = A 右侧 dock）**，可交 Sonnet 按 §8 切片执行（F1→F2→F3 串行，F4 独立）。
> 来源：owner 2026-07-18 反馈图四（生成页加 LoRA 专属助手）+ 图五（自己搭配难用 / 像 NovelAI 那样生成 / 自然语言→LoRA 语言是攻克难题）。
> 页面：`/studio/lora?section=generate`。本轮只完成助手与自然语言→tag 业务，并按当前 v1 UI 做回归；暗房、灰阶、琥珀与去盒化不再是业务完成后的 LoRA 视觉约束。
> 姊妹文档：多参考图可行性调研 `docs/plans/lora-multi-reference-feasibility-2026-07.md`。

## 0. 核心判断

**「自然语言→LoRA 语言」不是从零攻克，底料已备齐 80%**：

| 已有资产                                | 位置                                                                                                                | 与本设计的关系                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `mode: 'lora'` 系统提示                 | `services/kernel/prompt-assistant.service.ts:78`（"LoRA prompt converter"）                                         | 转换引擎的种子——但**无词库 grounding、无挂载上下文、输出非结构化、触发词规则已过时**（详见 §2） |
| danbooru 词库 5.4 万定义 + 评分引擎     | `searchPromptTags` / `PROMPT_TAG_DEFINITIONS`（规范英文入库·中文检索）                                              | grounding 的词表与校验器，零新检索代码                                                          |
| 助手基建                                | `chatPromptAssistant` kernel（多轮/参考图/语言/研究）+ `use-prompt-assistant.ts` + `/api/prompt/assistant` 工厂路由 | 全复用，只加 LoRA 上下文入参                                                                    |
| S5 触发词 chips / S6 inline 补全 / tray | 2026-07-18 已进 main（`b3e1452d`）                                                                                  | 助手输出的落地面（正文/负向框），语义边界已定（拍板④：正文 vs tray 两个事实源不混）             |
| mined recipes                           | `useCivitaiMinedPrompts`                                                                                            | few-shot 素材与「建议挂载」数据源（v2）                                                         |

**缺的只有三件**：① 生成页助手宿主（UI 入口）；② 转换引擎 v2（grounding + 挂载上下文 + 结构化输出）；③ 输出落地 UX（预览→填入）。附带：④ 自己搭配面板重构（图五「难用」）。

## 1. 宿主与形态（图四）

### 1.1 宿主 = 右侧 dock（**owner 2026-07-18 拍板方案 A**，覆盖 Fable 原推荐 B）

复用 `StudioAssistantDock`（2026-07-07「助手宿主改右侧 dock」全局拍板的延续）：`/studio/lora?section=generate` 挂载同一 dock 组件，进入 LoRA 生成页时默认激活 **LoRA 人格**（`mode:'lora'` + `loraContext` 注入）。左列保持「推荐 / 自己搭配」两 tab 不变（自己搭配重构照 §3 做）。

- dock 开关入口：生成页顶栏助手按钮（与 studio 各页同位同形制）；打开时与监视器分摊右侧宽度（沿用 dock 现有布局行为，不另发明分栏）。
- 落败方案存档：B 左列第三 tab（就地转换语义好但 owner 判 dock 全局一致优先）；C 纸内 inline（列 v2 轻量入口候选，同一引擎）。

### 1.2 对话内结果卡（dock 消息流中渲染，去盒化）

助手回复不再是纯文本 code block，`mode:'lora'` 的回复渲染为**转换结果卡**（消息气泡内的结构化块）：

```
┌ 助手消息 ──────────────────────────────┐
│ 正向  [1girl ×] [silver_hair ×] [snowy_field ×]     │
│       [backlighting ×] [dusk ×]                     │
│       [ghibli atmosphere ×]（虚线灰=自由词）         │
│ 负向  [lowres ×] [bad_hands ×]                      │
│                                                     │
│ [填入正文] [追加到正文]                              │
│ muted 行：身份交给了 LoRA，只写了服装与光影；        │
│           触发词由 chips 行负责，不会重复写入         │
└─────────────────────────────────┘
```

- 结果 chips：**词库命中** = 正常 chip（title 显中文释义 + 类别；热度点沿用 S6 三档不透明度语言）；**词库未命中** = 虚线灰 chip 标「自由词」（不隐藏——失败大声暴露，用户可 × 删后再填入）。
- 「填入正文」= 替换正文（编译顺序不变：触发词 chips → tray → 正文）；「追加」= 逗号续接。负向结果落负向框。**不进 tray**（拍板④ 边界维持）。
- 多轮：dock 本身就是对话流（kernel multi-turn 现成），历史保留;「继续调」快捷 chips（换构图 / 加光影 / 更贴 LoRA 风格）挂在输入框上方。
- 空态（dock 首开、LoRA 人格）：一句引导 + 2 个示例 NL（点击填入输入框），复用 Studio 空态 chips 模式。
- dock 在非 LoRA 页的行为零改动；LoRA 人格只在 `/studio/lora` 生成页默认激活。

## 2. 转换引擎 v2（`mode: 'lora'` 强化，核心攻克点）

现状 `mode:'lora'` 的四个不足与对策：

### 2.1 词库 grounding（双向）

- **入参侧**：服务端把用户 NL 做关键概念切分（LLM 自身负责语义切分，不写分词器），同时预检索：对 NL 全文跑 `searchPromptTags({ query, limit: 30 })`（中文检索已支持），把 top 候选以 `AVAILABLE TAGS（优先使用这些精确形式）` 附进系统提示——LLM 倾向抄现成规范形，命中率大幅提升。
- **出参侧**：LLM 输出的每个 tag 过规范化管线：`searchPromptTags` 精确命中 → 用词库规范形（含 underscore 形制）；模糊命中（评分过阈值）→ 替换为最近规范形并在 UI 标注「已规范化」；未命中 → 保留原文标「自由词」。管线为纯函数进 `src/lib/`（可单测）。
- 阈值/上限全部进 `src/constants/`（no magic values）。

### 2.2 挂载上下文注入

服务端入参扩展（`PromptAssistantRequestSchema` 加法式可选字段 `loraContext`）：

```
loraContext: {
  mounts: [{ name, triggerWords, family }],   // 脊柱条现挂
  baseFamily,                                  // 当前底模家族
  trayTags: string[],                          // tray 已选（避免重复输出）
  currentPrompt,                               // 已有（正文现状）
}
```

系统提示新规则（**替换现有过时的触发词规则**）：

- 触发词由客户端 chips 行管理，**输出禁止包含任何触发词**（现有规则"place them first"在 S5 后已错误）。
- 人物类 LoRA 挂载时：身份词（发色/瞳色/脸型等）**默认不输出**——身份由 LoRA 负责，输出反而漂移；用户显式要求改身份时例外并提示「可能与 LoRA 打架」。
- 底模家族感知：Illustrious/Pony/SDXL/Anima 系 → danbooru tag 串；（未来云端家族 → 自然语句，从 `getModelEnhanceHint` 现成读取）。
- tray 已有 tags 不重复输出。

### 2.3 结构化输出

现状 code block 纯文本 → v2 改结构化（`llm-output-validator` 惯例，Zod schema + 失败重试一次 + 大声报错）：

```
{ positive: string[], negative: string[], note?: string }
```

`note` = 一句人话说明取舍（如「身份交给了 LoRA，只写了服装与光影」），渲染在结果区底部 muted 行。

### 2.4 建议挂载（v2，本批不做）

意图关键词 → civitai 检索建议 LoRA（复用 S2 类型检索）+ mined 共挂信号。列切片 F5 不阻塞主线。

## 3. 自己搭配面板重构（图五「比较难用」）

现状 `LoraTagPicker`（LoraWorkbench.tsx:1863）痛点拆解：

| #   | 痛点                                                       | 对策                                                                                                                                  |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | 搜索结果 60 条单列平铺，扫描成本高                         | **按类别分节**（节标 = 现状类别 chips 的值，uppercase text-2xs muted），节内**热度降序**；无搜索词时默认展示每类 top 6 + 「更多」展开 |
| P2  | 加号点击后无去向反馈（进了 tray 但 tray 在视口外时无感知） | 选中行内联反馈（√ + 行高亮 `bg-primary/10`）；tray 计数徽标钉在面板头部（「已选 N」，点击滚动到 tray）                                |
| P3  | 无热度信号                                                 | 每行加 S6 同款三档不透明度中性热度点（同一视觉语言，零新颜料）                                                                        |
| P4  | 中文释义层级弱                                             | 行内主文案 = label（英）+ promptText mono 小字；title/副行给中文释义（词库已有中文检索字段，露出到展示层）                            |
| P5  | 正/负极性切换是两枚小圆钮，可发现性差                      | 换紧凑 segmented（「正向/负向」文字型，与库区 segmented 同形制）                                                                      |

**边界不动**：面板 → tray（结构化标签）的语义保持（拍板④）；「说人话」需求由助手 tab 承接，面板专注「浏览词库、精选入 tray」。两个入口在 tab 行并列，各司其职。

## 4. NovelAI 对标差距表（图五「像 NovelAI 那样生成」）

| NAI 能力                          | 我们现状                         | 差距处置                                                     |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| inline tag 补全 + 热度            | S6 已上（含热度点）              | ✅ 无差距                                                    |
| tag 自动规范化（空格→underscore） | S6 插入即规范形                  | ✅                                                           |
| 自然语言理解                      | 无                               | **本施工图 §2**                                              |
| 角色/画师预设词                   | 触发词 chips（S5）+ 配方一键同款 | 形态不同但覆盖；角色卡三层聚合另有主线                       |
| 多参考图（Vibe Transfer）         | 单参考图                         | 姊妹调研文档，独立立项                                       |
| 词权重语法 `{tag}` / `[tag]`      | 无                               | 列 v2 候选（编译管线支持 `(tag:1.2)` 语法透传即可，UI 后置） |

## 5. i18n 键（LoraWorkbench ns 增量，三语）

`assistantTab`（助手）/ `assistantPlaceholder` / `assistantConvert`（转换）/ `assistantApply`（填入正文）/ `assistantAppend`（追加到正文）/ `assistantClear` / `assistantFreeWord`（自由词）/ `assistantNormalized`（已规范化）/ `assistantTriggerNote`（触发词说明行）/ `assistantEmptyHint` + 2 示例键 / `tagPickerSelected`（已选 {n}）。

## 6. 状态规范

| 状态                         | 处理                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| 转换中                       | 输入框右侧 Spinner（`ui/spinner.tsx` 共享件）+ 转换钮禁用；不清空上次结果 |
| 引擎失败                     | 结果区一行琥珀错误文字 + 重试文字链（失败大声暴露，不静默降级）           |
| 输出验证失败（重试后仍非法） | 同上，附「切到自己搭配」逃生口                                            |
| 无挂载                       | 助手可用（纯底模也能转换）；`loraContext.mounts` 空数组                   |
| API key 缺失                 | 沿用 `QuickSetupDialog` 内联配置（Hard Rule 8）                           |

## 7. 拍板记录（2026-07-18 owner）

| #   | 分叉              | 拍板                                                                                             |
| --- | ----------------- | ------------------------------------------------------------------------------------------------ |
| ①   | 宿主形态          | **A 右侧 dock**（owner 选定，覆盖 Fable 推荐 B；与 2026-07-07 dock 全局拍板一脉）——§1 已按此改写 |
| ②   | 触发词/身份词规则 | 按建议默认执行：助手输出**不含触发词、默认不写身份词**（§2.2，与 S5 架构对齐）；owner 未表异议   |
| ③   | 结果落地          | 按建议默认执行：结果卡 chips → 填入/追加**正文**，不进 tray（拍板④延续）；owner 未表异议         |
| ④   | 自己搭配重构范围  | **P1–P5 全做**（owner 拍板，一次收口图五）                                                       |
| ⑤   | 建议挂载          | 按建议列 v2（切片 F5），首发不做                                                                 |

## 8. 切片（拍板后交 Sonnet；F1→F2→F3 串行，F4 独立可并行）

| 片                    | 内容                                                                                                             | 验收                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 引擎 v2            | §2.1–2.3：grounding 管线（纯函数+单测）+ `loraContext` schema/贯通 + 系统提示改写 + 结构化输出/验证              | 单测：命中规范化/模糊替换/自由词标记/触发词绝不出现在输出/tray 重复剔除；API 实测中文 NL → 规范 tag JSON                                            |
| F2 dock 挂载 + 结果卡 | LoRA 生成页挂 `StudioAssistantDock`（LoRA 人格默认激活）+ §1.2 结果卡（chips/填入/状态/空态）；dock 其他页零改动 | 真机：LoRA 页开 dock→中文描述→结果卡 chips（命中带类别热度、自由词虚线灰）→填入正文→出图请求 prompt 正确；studio 图像页 dock 行为零回归；失败态大声 |
| F3 落地联动           | 填入/追加与 S6 补全、S5 chips 行、tray 的编译顺序回归                                                            | 出图请求 prompt = 触发词+tray+正文序不变；多轮「继续调」保留上下文                                                                                  |
| F4 自己搭配重构       | §3 P1–P5                                                                                                         | 真机：分节+热度点+选中反馈+已选徽标+segmented；tray 语义零回归                                                                                      |
| F5 建议挂载（v2）     | §2.4                                                                                                             | 另批                                                                                                                                                |

每片收尾：lint + 全量 tsc + 全量 vitest（--maxWorkers=4）+ claude-in-chrome 实跑 + i18n-check 三语；不提交等 owner 点头。

## Source of Truth

- 助手基建：`services/kernel/prompt-assistant.service.ts` · `hooks/kernel/use-prompt-assistant.ts` · `/api/prompt/assistant`（工厂路由）· `types/index.ts` `PromptAssistantModeSchema/RequestSchema`
- 词库引擎：`lib/prompt-tag-search.ts` · `constants/prompt-tags.*` · `lib/prompt-tag-autocomplete.ts`（S6）
- 生成页现状：`LoraWorkbench.tsx` GenerateBranch（推荐/自己搭配 tab 行 :1334 附近 · LoraTagPicker :1863）· `TriggerChipRow.tsx`（S5）
- 上游：`docs/references/pages/lora-workbench.md`（v1.1 + §12）· 拍板④（inline 写正文/tray 边界）

## Last Verified

- 2026-07-18 · 逐文件核实上表锚点（mode:'lora' 现状系统提示全读 · LoraTagPicker 全读 · 助手路由/schema 核实）；未改产品代码。
