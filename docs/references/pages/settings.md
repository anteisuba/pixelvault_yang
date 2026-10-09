# 设置整页施工图 — settings

> **状态：现行基准（2026-09-18 落地，进度表第 13 / 14 项）。**
> 范围：`/settings` 这一条路由树 —— 五个分区的职责、key 行的四态、「全站所有 key 入口最终去哪儿」，以及让外部 Claude 进来的令牌（§7）。
> 不管各业务域皮肤，也不管缺 key 时的**就地**配置（那是 `QuickSetupDialog`，Hard Rule 8）。

---

## 1 · 域定义

设置页是**通盘管理**的地方：一次看清所有渠道、这个月花了多少、偏好和助手人设。

| 负责                                                    | 不负责                                    |
| ------------------------------------------------------- | ----------------------------------------- |
| 通盘查看与修改账户级配置 · 退出登录 · 全站唯一 key 管理 | 生成、参数、缺 key 时的就地补录（走弹层） |

**全站只有这一个 key 管理界面。** 旧的两个抽屉（侧栏 `ApiKeyDrawerTrigger` + 画布 `ShellApiKeys`）与它们共用的 `ApiKeyManager` 已在同一轮整删。⛔ 不许再造第二份 key 界面——这正是上一形态的病：同一件事三个入口、三种长相。

---

## 2 · 路由

| 路由                  | 行为                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `/settings`           | 自身**没有内容**。桌面（`≥1024`）重定向到 `/settings/keys`；手机停在一级列表，点行进二级页               |
| `/settings/[section]` | 五个分区：`keys` · `usage` · `preferences` · `assistant` · `connections`；其余 section **404**，不是空页 |

- 分区词表与次序住 `src/constants/settings.ts`；**次序就是导航次序**，默认落点 = 第一项，⛔ 不另写一个字面量。
- 桌面的重定向判据是**挂载时读一次 `window.innerWidth`**，不是 `useIsMobile()`——后者首帧恒为 false，手机会被弹去 keys 再也回不到列表。读一次也意味着窗口后来被拉宽不该把人从列表里弹走。
- `?from=` 记的是「点设置之前站在哪儿」，让返回键回工作台而不是丢进历史栈。**只收站内绝对路径**：`//host` 会被浏览器当成协议相对的外链，一并拒掉。进出两侧共用 `settingsPath()` / `safeReturnPath()`（`src/constants/routes.ts`），⛔ 别在组件里各写一遍判据。
- 形态：桌面是灰底地台上一张白卡 = 左 200px 分区导航（最底一行「退出登录」）+ 右 720px 内容；手机没有导航列，二级页顶部一行「← 分区名」。
- 外壳挂在 `settings/layout.tsx`（`SettingsLayoutFrame` 按 URL 分区段决定套不套），⛔ 不在分区页里：`[section]` 页按参数整段重挂，外壳放页里每次换分区导航都是新的一份，选中灰块没法滑过去。一级列表与 404 的 section 不套外壳。

---

## 3 · keys —— 按 provider 一行

行的内容固定：健康点 · provider 名 · 解锁 N 个模型 · 状态一句 · 本月花费 · 一个动作。

### 3.1 四态与排序

| 态                | 含义                           |
| ----------------- | ------------------------------ |
| **健康**          | 这家至少有一把 key 校验通过    |
| **失效**          | 有 key 但校验失败（401 / 403） |
| **已配置·未校验** | 有 key，还没有校验结论         |
| **未配置**        | 这家没有启用中的 key           |

排序 **失效 → 已配置（健康与未校验同档）→ 未配置**，同档内按名字。让坏掉的排第一是这页存在的理由。

⚠ 设置页**没有「缺 key」这一态**——「缺」只在模型选择器的渠道面板里出现（那是「这个型号我现在跑不了」），设置页只有「未配置」。
⚠ 名单 = 能解锁内置模型或 LLM 能力的 adapter（`ACTIVE_API_KEY_ADAPTER_OPTIONS`），⛔ 不含 `runner`：它压根没有 BYOK 通道。
⚠ 停用的 key 不算「配过」；最后一把被删掉后该行自己塌回未配置。

### 3.2 展开与动作

- 已配置的行行尾是折叠箭头，**展开**才逐把列 key（遮码标签 · 健康 · 上次校验时间戳 + 「再加一把」）。校验时间戳是**不过期**的一枚印，与 5 分钟健康缓存是两回事——行要能说出「上次是什么时候查的」。
- 未配置行的「**配置**」与失效行的「**换一把**」打开的都是 `QuickSetupDialog`，从按下的那颗键长到正中（§8）。⛔ 这一页**不自带第二个录入表单**：录入的长相全站只有弹层那一份。
- 反过来，`QuickSetupDialog` 底部虚线上留了一行灰字「管理全部 key →」指向 `/settings/keys`——**这是设置页唯一一个从弹层进来的入口**，弹层本体一律不动。

---

## 4 · usage —— 只显数字

provider · 本月请求次数 · 估算花费，末行合计；runner 另有一行月额度。⛔ 不画环、⛔ 不设预算。

- 数据源 `GET /api/usage/by-model`：服务端**只数次数**（`apiUsageLedger.groupBy`，UTC 自然月）。
- **单价留在 `constants/models/unit-prices.ts`，花费在客户端按「次数 × 单价」累加**，表头把「估算」写在脸上。服务端算一遍等于给单价开第二个家，而两个家一定会漂。
- 没有可信单价的 provider 那一格**留空，只显次数**，不编一个数出来。
- 月界与 runner 额度共用同一个 `startOfMonthUTC()`：两张表说的必须是同一个「本月」。

---

## 5 · preferences

| 项         | 接的是哪条现成的路                                 |
| ---------- | -------------------------------------------------- |
| 语言       | `LocaleSwitcher`（从侧栏迁来的那一个）             |
| 显示名     | `updateProfileAPI`                                 |
| 默认工作台 | 本地偏好，值**就是路由**                           |
| 完成通知   | 本地偏好                                           |
| 减少动效   | 本地偏好，与系统 `prefers-reduced-motion` 是**或** |

后三项没有服务端形状，骑在既有的 `useLocalPreference` 上；键住 `src/constants/settings.ts`。⛔ 不为它们新开一张表，⛔ 不做第二张 id → 路由的映射。

---

## 6 · assistant

- **人设三档**写穿到已有的 `AssistantPersona.verbosity`，不是这一页自己的新字段。
- **记忆区是全站唯一能管记忆的地方**（56a 落地，2026-09-20）。一条记忆 = **一行字**，由助手每轮结账时写进 `AssistantMemory`；这一页负责看、改、删。

### 6.1 记忆总览 —— 一张平铺列表

| 元素     | 行为                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 列表     | **一张平铺表**按 `updatedAt` 倒序，每条一行字 + 一枚时间（今天 HH:mm · 昨天 · M/D）                                                                                                                                 |
| 筛选     | 顶部一排 chip：全部 · 图片 · 视频 · 画布 · LoRA，默认全部，**纯前端过滤**（一次全取）                                                                                                                               |
| 改       | **点那行字就地改**，回车保存 · Esc 取消。⛔ 不弹层                                                                                                                                                                  |
| 项目     | 只属于一个画布项目的那条，范围标签写「画布 · 项目名」；就地改时下拉第一格是它，选别的范围（含「所有画布」）就离开项目（2026-10-09）                                                                                 |
| 删       | hover / focus 时行尾出现**唯一**动作「删」；能撤销的小删除 → `ConfirmDeleteButton` 拉长成红「确认删除」再点才删，底部黑条「已删除一条记忆 · 撤销」，5 秒后才落库（`lib/undoable-action.ts`）。触屏常显（`coarse:`） |
| 全部清空 | 右上一行字，删了找不回 → 正中 `ConfirmDialog`，从那行字长出来                                                                                                                                                       |
| 空态     | 一句话说清会记什么 + 一颗隐身入口                                                                                                                                                                                   |

⚠ `global` 那一档**不单独出 chip**：它跟着「全部」出现。用户脑子里没有「全局记忆」这个类目。
⛔ **这一页没有**：分组 · 时间线分段 · 容量表 · 负规则 · 「存为卡」· 导出 · 新建。owner 2026-09-19 打回过一版更复杂的形状（「太复杂，Claude 不会这么设计」）。
⛔ **也没有「新建一条」**：记忆唯一的写入口是服务端结账，API 上根本没有 POST。

### 6.2 隐身与「不记的类目」

- **隐身**分两处，⚠ 它们不是同一件事：面板 ⋯ 菜单里那颗作用于**当前会话**（住操作员 store，不落库）；这一页空态里那颗写本地偏好 `assistantIncognito`。
- **「不记的类目」那一块已整删**（2026-09-19 owner 定「负规则不做」）：它曾是一份只活在 localStorage、服务端从没读过的清单。现在「不记什么」是服务端的**敏感类目**确定性闸（`src/constants/assistant-memory.ts`：身份证件 · 账号密码 / API key · 健康与医疗 · 私密关系 · 财务账户 · 未成年人信息），命中的候选静默跳过——⛔ 不写库、不进回执计数、不留日志明文、不提示。

### 6.3 上限与淘汰

每域 200 条，超了按 `lastUsedAt` 最旧的**静默**删。⛔ 界面上一个字都不提。

---

## 7 · connections —— 让 Claude 进来

与 keys 方向相反：keys 是你去用别家的模型，这一页是让外部 Claude 经 MCP 进来读写你的画布项目（契约见 `mcp.md`）。owner 2026-10-07 照小样定（artifact `DqB6AofEnuSAc3uLAPMdqG`）。

- 一块「Claude Code」：一句话说清能做什么（读项目、剪片、出小样）与不能做什么（花积分的生成仍由你点）+ 右上「生成令牌」。
- **生成**：列表顶上长出一行虚线框，名字预填「Claude Code」；精确指针下自动聚焦并全选，触屏不自动聚焦（会弹键盘）。回车生成，Esc 取消。
- **刚生成那张卡**（黑框）：令牌明文 + **已经填好令牌**的 `claude mcp add` 命令，各带复制键，标「只显示这一次」；「我复制好了」后收成普通一行。⚠ 明文只活在这张卡里，hook 的列表里永远只有名字与末 4 位。复制成功那颗键自己拉长变黑写「✓ 已复制」（`FeedbackButton`，`COPIED_ACK_MS`），⛔ 不弹 toast；剪贴板被拒时把那一串选中。
- **行**：绿点 + 「Claude 在用」= 令牌 `MCP_ACTIVE_WINDOW_MS` 内用过；其余写多久前用过 / 从未使用 · 哪天生成；末 4 位走等宽。「吊销」过 `ConfirmDialog`，立即生效；那一行收起，底部黑条「已吊销「名字」」（没有撤销：吊销找不回）。
- 满 `MCP_MAX_ACTIVE_TOKENS` 个时生成键变灰，下面一行说原因；服务端 409 同样落成这句。
- ⛔ 不放 Claude.ai 连接器的占位：OAuth（`mcp.md` S7）做出来才出现在这一页。

## 8 · 动效（owner 2026-10-08 设置页原型 v1 `Scp29Uk4yzuMG2foDn6y76` 定稿）

结构一格不动（灰底白卡 · 左 200 导航 · 开关 + 下拉 · 五个分区照旧），只换皮加动效。弹簧只用 `SPRING` 预设（最多一丝过冲），同一下的几件事同时起；⛔ 发光 / 渐变；`prefers-reduced-motion` 下全部直接到终态。

| 哪里        | 怎么动                                                                                                                                                                                                                                                                                                                                                         | 实现                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 左栏        | 一块 `bg-muted` 选中灰块在行间弹簧滑（`SPRING.slot`），一块更浅的悬停块跟着鼠标（`SPRING.press`，划过当前行让位，触屏没有）；↑ / ↓ 在行上直接换分区（首尾循环，`?from=` 带着）                                                                                                                                                                                 | `SettingsShell` 的 `SettingsNav`                                      |
| 换分区      | 右边内容糊一下再清（5px · 160ms，首次进来不糊）                                                                                                                                                                                                                                                                                                                | `useBlurSwapIn(section, SETTINGS_SECTION_SWAP)`                       |
| 退出登录    | 按下键里转圈写「正在退出」，直到页面被带走                                                                                                                                                                                                                                                                                                                     | `SettingsSignOutButton`（`FeedbackButton` 的 `progress` 档）          |
| keys        | 展开 / 收起走高度弹簧；「配置 / 换一把 / 加一把」弹窗从键长到正中；保存键「检查中」→「✓ 已保存」→ 自己关；这一行 FLIP 滑到新的排序位（`layout="position"`），健康点由灰变绿；删一把 key 过正中弹窗，那一行收起。名单还没回来：每家一条静止灰条（形状 = 真行，⛔ 转圈），回来后一行行短暂一糊变清；等过 6 秒底部黑条「网有点慢，还在加载」（加载中 2026-10-08） | `SettingsKeysSection` · `QuickSetupDialog growFromPointer`            |
| usage       | 只显数字（§4），进来时每格从 0 弹簧数到本月值；读屏只念终值                                                                                                                                                                                                                                                                                                    | `CountUp`（`COUNT_UP_SPRING`）                                        |
| preferences | 下拉从触发器弹簧放大、关着那一拍不吃指针；开关拨子 `--spring-slot`；显示名失焦即存，框边先转圈再闪「✓ 已保存」，⛔ 不弹 toast（失败仍走底部黑条）                                                                                                                                                                                                              | `SelectContent motionPreset="spring"` · `Switch` · `DisplayNameField` |
| assistant   | 「说话风格」照旧是分段条；记忆筛选的黑丸在 chip 间滑；就地改回车存后时间那一格闪「✓ 已保存」；删一条见 §6.1（键上确认 + 收起糊掉 + 撤销黑条）；全部清空正中弹窗；空态是统一 `EmptyState`                                                                                                                                                                       | `AssistantMemoryPane`                                                 |
| connections | 虚线「填名字」那一行长高出来；回车后**同一格**长成黑框卡（糊一下换进来）；复制键变「✓ 已复制」；「我复制好了」同一格收回普通一行；吊销过正中弹窗，那一行收起 + 底部黑条                                                                                                                                                                                        | `SettingsConnectionsSection` 的 `GrowingSlot`（一个 key 传到底）      |

⚠ `AssistantMemoryPane` 是工作台 ⋯「助手设置」弹窗与本页**同一份内容**，以上记忆区的动效两个入口一起变。

## Source of Truth

- 路由 `src/app/[locale]/(main)/settings/{layout.tsx,page.tsx,[section]/page.tsx}` · 组件 `src/components/business/settings/`
- 词表与本地偏好键 `src/constants/settings.ts` · 深链 `src/constants/routes.ts`（`settingsPath` / `safeReturnPath`）
- 记忆 `src/services/assistant-memory.service.ts` · `src/constants/assistant-memory.ts` · `src/hooks/use-assistant-memories.ts` · `src/app/api/assistant-memories/**`
- key 行数据 `src/hooks/use-provider-key-rows.ts` · 用量 `src/hooks/use-monthly-usage.ts` + `src/services/usage.service.ts`
- 入口收口 `src/hooks/use-open-key-settings.ts` · 画布侧 `shell/ShellKeySettings.tsx`
- 连接 `SettingsConnectionsSection.tsx` · `src/hooks/use-mcp-tokens.ts` · 命令与上限 `src/constants/mcp.ts` · 接口 `src/app/api/mcp/tokens/**`

## Last Verified

**2026-10-08 · 加载中（`loading.md`「页面 / 列表加载」）。** keys 名单加载改为静止灰条 + 到达时 `LoadReveal` 逐行一糊变清 + `useSlowLoadingNotice`。**未验**：真机目检。

**2026-10-08 · 设置页换皮加动效（§8，原型 `Scp29Uk4yzuMG2foDn6y76`）。** 外壳移到 `settings/layout.tsx`；左栏滑块 / ↑↓ / 退出转圈（`SettingsShell.test`）、用量从 0 数上来（`SettingsUsageSection.test`）、显示名框边「已保存」不弹 toast（`SettingsPreferencesSection.test`）、记忆删一条可撤销 · 全部清空正中弹窗 · 改完闪「已保存」（`AssistantMemoryPane.test`）、复制键结果写在键上 · 吊销后黑条（`SettingsConnectionsSection.test`）带单测。**未验**：真机 1440 目检（弹簧手感、FLIP 滑位、弹窗从键长出）待 owner。
**2026-10-07 · 连接分区落地（剪辑台 v2 第 0 片）。** §7 对照 `SettingsConnectionsSection.tsx` 核验，带单测（列表只露末 4 位 · 明文与命令只出现一次后收起 · 吊销须确认 · 满额变灰 · 读取失败可重试）；本地 dev 真机只读核过导航、空态、填名字那一行与取消（⛔ 没真生成令牌：本地连的是生产库）。
**2026-09-20 · 助手记忆区落地（56a，owner 拍板最简版）。** §6 逐条对照 `SettingsAssistantSection.tsx` 与 `assistant-memory.service.ts` 核验；列表 / 筛选 / 就地改 / 删 / 全部清空 / 空态带单测，四条 API 各自有 ownership 用例。
**2026-09-18 · 实现落地。** 路由、四分区、key 四态与排序、用量口径、入口收口逐条对照源码核验；`SettingsIndexView` / `SettingsKeysSection` / `SettingsUsageSection` 带单测。
**未验**：真机 1440 / 820 / 375 已登录态目检待 owner（记忆区的 hover「删」与就地改也在内）；迁移 `20260920120000_assistant_memory` **尚未对数据库执行**。
