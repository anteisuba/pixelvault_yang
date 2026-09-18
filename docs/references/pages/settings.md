# 设置整页施工图 — settings

> **状态：现行基准（2026-09-18 落地，进度表第 13 / 14 项）。**
> 范围：`/settings` 这一条路由树 —— 四个分区的职责、key 行的四态、以及「全站所有 key 入口最终去哪儿」。
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

| 路由                  | 行为                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `/settings`           | 自身**没有内容**。桌面（`≥1024`）重定向到 `/settings/keys`；手机停在一级列表，点行进二级页 |
| `/settings/[section]` | 四个分区：`keys` · `usage` · `preferences` · `assistant`；其余 section **404**，不是空页   |

- 分区词表与次序住 `src/constants/settings.ts`；**次序就是导航次序**，默认落点 = 第一项，⛔ 不另写一个字面量。
- 桌面的重定向判据是**挂载时读一次 `window.innerWidth`**，不是 `useIsMobile()`——后者首帧恒为 false，手机会被弹去 keys 再也回不到列表。读一次也意味着窗口后来被拉宽不该把人从列表里弹走。
- `?from=` 记的是「点设置之前站在哪儿」，让返回键回工作台而不是丢进历史栈。**只收站内绝对路径**：`//host` 会被浏览器当成协议相对的外链，一并拒掉。进出两侧共用 `settingsPath()` / `safeReturnPath()`（`src/constants/routes.ts`），⛔ 别在组件里各写一遍判据。
- 形态：桌面是灰底地台上一张白卡 = 左 200px 分区导航（最底一行「退出登录」）+ 右 720px 内容；手机没有导航列，二级页顶部一行「← 分区名」。

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
- 未配置行的「**配置**」与失效行的「**换一把**」打开的都是 `QuickSetupDialog`。⛔ 这一页**不自带第二个录入表单**：录入的长相全站只有弹层那一份。
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
- **记忆区只有 UI 与空态**；隐身与「不记的类目」只**存**状态。行为接入等进度表第 56 项定了数据形状再做——⚠ 现在把它当成「已经会记 / 已经会忘」是错的。

---

## Source of Truth

- 路由 `src/app/[locale]/(main)/settings/{page.tsx,[section]/page.tsx}` · 组件 `src/components/business/settings/`
- 词表与本地偏好键 `src/constants/settings.ts` · 深链 `src/constants/routes.ts`（`settingsPath` / `safeReturnPath`）
- key 行数据 `src/hooks/use-provider-key-rows.ts` · 用量 `src/hooks/use-monthly-usage.ts` + `src/services/usage.service.ts`
- 入口收口 `src/hooks/use-open-key-settings.ts` · 画布侧 `shell/ShellKeySettings.tsx`

## Last Verified

**2026-09-18 · 实现落地。** 路由、四分区、key 四态与排序、用量口径、入口收口逐条对照源码核验；`SettingsIndexView` / `SettingsKeysSection` / `SettingsUsageSection` 带单测。
**未验**：真机 1440 / 820 / 375 已登录态目检待 owner；助手记忆区的真实行为（等第 56 项）。
