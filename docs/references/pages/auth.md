# 登录注册施工图 — auth

> **状态：现行基准（owner 2026-10-08 定稿，原型 `5Uc2abc9KvKWGtpzM7HbFX`）。**
> 范围：首页弹窗 `AuthDialog` 与 `/sign-in` `/sign-up` 两条路由里的那张卡、Google 一键框、登进来之后的「已登录」黑条。
> 长相不在这里改：米色卡的颜色、几何与对比度都写在 `src/app/auth.css` 顶部（haivis.ai 实测值），Clerk 皮肤在 `src/lib/clerk-appearance.ts`。这一轮只加动效与功能，⛔ 不换色。

---

## 1 · 域定义

| 负责                                                                    | 不负责                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------- |
| 让访客用 Google / GitHub / Apple 或邮箱验证码进来；一扇门，登录注册不分 | 账户资料、退出登录（设置页 `settings.md`）、会话管理 |

- **一扇门**：输入邮箱后先按登录试，Clerk 说「没这个人」（`form_identifier_not_found`）就转注册。卡上只有一个标题，访客不用先想自己是登录还是注册。
- **登录方式只有两类**：三家社交 + 邮箱验证码。Clerk 免费版社交上限 3 个；手机号登录、通行密钥要付费版，不加。
- ⛔ **密码**：owner 在 Clerk 后台关掉了密码（密码登录会触发 Device Trust 二次验证码）；代码、皮肤与文案里都不出现密码步骤。

## 2 · 载体

| 载体                              | 跑什么                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 首页弹窗 `AuthDialog`             | `AuthFlow`（自建）。弹窗从「登录」键长出来、关上缩回那颗键（`DialogContent growFromPointer`，与 `QuickSetupDialog` 同一招） |
| `/sign-in`、`/sign-up` 根路由     | 同一个 `AuthFlow`，同一张 `AuthCard`                                                                                        |
| `/sign-in/*`、`/sign-up/*` 子路由 | Clerk 预制 `<SignIn>` / `<SignUp>`（`routing="path"`，皮肤 `clerkAuthAppearance`）                                          |

子路由留给预制组件，因为它们接得住**进行中**的那次尝试：`sso-callback`（三家社交跳回来、含「没账号转注册」）、`factor-two`（万一要二次验证）、`continue`（后台要求额外必填项时）、邮件里的链接。`AuthFlow` 遇到 `needs_second_factor` / `missing_requirements` 就带着 `redirect_url` 交给这些子路由。

## 3 · 为什么自建（而不是只调 Clerk 皮肤）

定稿要的验证码步（「验证码已发到 xxx · 换邮箱」、输错变红清空回第一格、红点一行、60 秒滚动倒计时）、键上「字 → 转圈 → ✓」、换步时卡高弹簧加内容一糊，Clerk 预制组件都给不了：它的重发倒计时是 30 秒纯文字，错误态自带晃动，步骤与按钮内部也没有可挂动效的口子。可选的三条路：

1. 只改 `appearance` —— 改得了颜色与结构类名，改不了行为。不够。
2. `@clerk/elements` —— 没装，且仍是 beta，要多一个依赖。
3. **已装的 `@clerk/nextjs` 6.39 自带的 `useSignIn` / `useSignUp`（custom flow）** —— 零新依赖，只替换「起手 + 验证码」两步，其余全部仍走预制组件。

选 3，侵入最小：自建的只有 `src/hooks/use-email-code-auth.ts`（流程）与 `src/components/business/auth/AuthFlow.tsx`（两步的界面），类名沿用 `auth.css` 里给 Clerk 写的那套（`.auth-social` `.auth-input` `.auth-primary` 分隔线），所以卡还是那张卡。注册那一下需要的人机校验挂点 `#clerk-captcha` 放在 `AuthFlow` 底部。

## 4 · 第一步：三家 + 邮箱

- 三家按 `AUTH_SOCIAL_PROVIDERS`（`src/constants/auth.ts`）的顺序：Google · GitHub · Apple，文案「使用 X 登录」，品牌标 `AuthProviderLogo`（Google 四色 G，GitHub / Apple 跟字色）。点下去键里转圈，`authenticateWithRedirect` 整页跳走；回跳落在 `/sign-in/sso-callback`。
- 后台还没打开 Apple 时点 Apple → 红点一行「这个登录方式暂时用不了」，不卡死。
- 邮箱框 + 黑键「继续」。明显不是邮箱（没有 @）当场说「邮箱格式不对」，不打 Clerk。
- **「上次用的」**：读 Clerk 自带的 `client.lastAuthenticationStrategy`（这个版本已有），⛔ 不自己存、⛔ 不记邮箱地址。折成卡上的四种方式之一（`authMethodFromStrategy`），对应那一行右端挂一颗小黑丸「上次用的」（底色 `--auth-input-ink`），那一行的细边换成同一色。上次是验证码 → 标在邮箱框上。卡上没有的方式（密码等）不标。

## 5 · 第二步：验证码

| 场合          | 做法                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 进来          | 一行「验证码已发到 **a@b.co**」+ 链接「换邮箱」（回第一步，邮箱留在框里）；焦点在第一格                                        |
| 输入          | 6 格（42×48，手机 36×44），打一位跳下一格；退格在空格上回上一格并清掉；←/→ 走格                                                |
| 粘贴 / 自动填 | 一串数字六格一起填满（哪一格粘都从头填）；手机键盘「来自邮件的验证码」走 `autocomplete="one-time-code"` 同样分格               |
| 填满          | 自己提交，⛔ 没有「验证」键（与原型一致）；最底那一行糊成「转圈 验证中」，通过后糊成「✓ 已登录」                               |
| 输错          | 六格变红、清空、焦点回第一格，下面一行红点「验证码不对，再试一次」；⛔ 不晃。再开始输红就退                                    |
| 过期 / 太多次 | 同一行红点，分别「验证码过期了，重新发一个」「试太多次了，稍等一会儿再试」                                                     |
| 重发          | 「没收到？60 秒后可重新发送」，秒数逐位滚（`RollingNumber`）；到 0 变成「没收到？重新发送」，点了「转圈 发送中」、重新计 60 秒 |

红点那一行字是墨色不是红色：`--destructive` 在米色卡上只有约 4.2:1，不够正文 4.5；红点与格子红边是图形，过 3:1。

## 6 · 动效

- 卡从「登录」键长出来（弹窗才有；整页卡没有可长出来的键）。
- 换步：外层量当前一步的高（`ResizeObserver`），高度走 `SPRING.slot`（几乎不过冲）；新一步的内容由糊变清进来（`useBlurSwapIn`）。外层裁切留 5px 出血，焦点环与细边不被裁。
- 黑键「继续」：字糊成「转圈 发送中」（`AuthSubmitButton`，`BlurSwap`）；社交行糊成「转圈 正在跳转 Google」；验证码步最底一行糊成「验证中」再糊成「✓ 已登录」，✓ 停 600ms 再走。
- `prefers-reduced-motion`：高度直接跳、不糊、格子边色不过渡。
- ⛔ 发光、渐变、晃动。只用 `motion/react`。

## 7 · Google 一键框

`AuthOneTap`（Clerk `<GoogleOneTap />`）挂在 `AuthDialogProvider` 里，也就是只在营销首页。

- 只给**确定未登录**的访客：Clerk 解析出来之前不挂，已登录不挂。
- 一次访问只出一次（sessionStorage `pv-auth-one-tap-shown`）。Clerk 的组件没有「被关掉」回调（FedCM 下那个框是浏览器自己的界面），所以出过一次就当看过了；Google 自己对连续关掉也有冷却。

## 8 · 登进来之后：「已登录」黑条

登录发生在首页弹窗 / 整页卡 / 社交跳转 / 一键框，落地都在工作台，而黑条的 `<Toaster />` 只在应用壳里。所以发起登录时记一笔（sessionStorage `pv-auth-arrival`，10 分钟内有效），`AuthArrivalToast`（挂在 `(main)/layout.tsx`，排在 `<Toaster />` 后面）在确认已登录时消费它，弹 `toast.success(Toasts.signedIn)`——§7.1 那条底部黑条。未登录时（取消了 OAuth）记号留着。

## 9 · 文件

| 文件                                                | 角色                                                  |
| --------------------------------------------------- | ----------------------------------------------------- |
| `src/constants/auth.ts`                             | 三家、6 位、60 秒、存储键、停留时长                   |
| `src/lib/auth-marks.ts`                             | sessionStorage 记号（全部 try/catch）+ 上次方式的映射 |
| `src/hooks/use-email-code-auth.ts`                  | 一扇门流程：发码 / 验证 / 重发 / 换邮箱 / 社交跳转    |
| `src/components/business/auth/AuthFlow.tsx`         | 两步界面 + 卡高弹簧                                   |
| `src/components/business/auth/AuthCodeInput.tsx`    | 6 格                                                  |
| `src/components/business/auth/AuthSubmitButton.tsx` | 字 → 转圈 → ✓                                         |
| `src/components/business/auth/AuthOneTap.tsx`       | 一键框                                                |
| `src/components/business/auth/AuthArrivalToast.tsx` | 「已登录」黑条                                        |
| `src/app/auth.css`                                  | 卡的皮肤；「our own flow」一节是自建部分的结构        |

文案在 `Auth` 命名空间（只在 `(main)` 之外消费，新消费者要登记 `src/i18n/messages-split.test.ts`）；「已登录」在 `Toasts.signedIn`（应用壳里用）。

## 10 · Clerk 后台（owner 操作，Dev 与 Production 都要）

1. **User & authentication → Email**：打开 Email address 作为登录标识；验证方式勾 **Email verification code**（sign-up 验证与 sign-in 第一因子都用验证码）。
2. **Password**：关掉 **Sign-up with password** 与 **Add password to account**（整项关闭）。
3. **SSO connections**：Google、GitHub、Apple 三个（免费版上限 3）。Production 下三家都要填自己的 OAuth 凭据；Apple 要 Services ID / Team ID / Key ID / 私钥。
4. **Google One Tap**：只在 Google 用**自定义凭据**时可用（共享开发凭据不支持）；在 Google Cloud 的 OAuth 客户端里把站点域名加进 Authorized JavaScript origins。
5. **Paths**：Sign-in / Sign-up URL 保持 `/sign-in` `/sign-up`（`ClerkProvider` 已传）；OAuth 回跳落 `/sign-in/sso-callback`，在 allowlist 里就行。
6. 「上次用的」用的是 Clerk 自带的 `lastAuthenticationStrategy`，不用开关；如果后台有 _Last used_ 相关设置，保持开启。

## 11 · 测试

- `src/hooks/use-email-code-auth.test.ts` —— 一扇门（已知邮箱登录 / 未知邮箱转注册、全程无密码参数）、输错计数、成功 ✓ 后才走、缺字段交给 `continue`、60 秒重发、换邮箱、社交回跳地址、未开通的方式就地报错。
- `src/components/business/auth/AuthCodeInput.test.tsx` —— 打字跳格、粘贴填满并提交、一次性验证码自动填、退格回格、输错清空回第一格。
- `src/components/business/auth/AuthFlow.test.tsx` —— 三家 + 邮箱且无密码、「上次用的」小黑丸、转圈、「验证码已发到」与「换邮箱」、滚动倒计时、红点一行（真 zh 文案渲染）。
- `src/components/business/auth/AuthOneTap.test.tsx` —— 一键框只给未登录、一次访问一次；「已登录」黑条只在发起过登录后弹一次。
- `src/lib/auth-marks.test.ts` —— 方式映射、存储被拦时不抛。

## 已知缺口

- **没有真机验证**：云端环境没有 Clerk key，整套流程只经类型与单测。上线前要在 3000 上实走：Google / GitHub / Apple 各一次（含新账号转注册）、邮箱老用户 / 新用户、输错、过期、重发、一键框、`redirect_url` 带回原页。
- 后台若开了「法律条款勾选」或姓名必填，注册会在验证码之后跳到 `/sign-up/continue` 的预制页补填，那一页是 Clerk 皮肤，没有这一轮的动效。

## Last Verified

- 2026-10-08 · 登录注册批落地（本地提交，未推送）：tsc、lint、定向与全量 Vitest；未做浏览器实测（无 Clerk key）。
