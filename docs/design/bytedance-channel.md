# 字节模型收成一个渠道（定稿并施工 2026-11-11）

owner 2026-11-11 定：**fal 转售去掉，火山（cn）与 BytePlus（intl）合成一个「字节」渠道，用户只填一种「字节 key」**。长期方向：所有 provider 先接官方 key，之后再支持中转 key（另立项）。

## 现状（2026-11-11 main）

- 选择器已有「型号 → 渠道」两层（`MODEL_VARIANTS` + `foldChannels` + `resolveModelChannel`），owner 2026-09-17 定「没有自动」：多渠道型号要用户手选一条。渠道行的折叠键是 `adapterType + keyId`（`channelKeyOf`）。
- 字节型号三条渠道并排，`available: true` 的条目 27 个：

| 型号                                                 | fal | 火山 cn                           | BytePlus intl                  |
| ---------------------------------------------------- | --- | --------------------------------- | ------------------------------ |
| Seedream 5.0 Pro                                     | ✓   | `doubao-seedream-5-0-pro-260628`  | `dola-seedream-5-0-pro-260628` |
| Seedream 5.0 Lite                                    | ✓   | `doubao-seedream-5-0-lite-260128` | `seedream-5-0-lite-260128`     |
| Seedream 5.0（基础款）                               | —   | `doubao-seedream-5-0-260128`      | 无                             |
| Seedream 5.5（2026-11-13 接入）                      | —   | `doubao-seedream-5-5-261028`      | `dola-seedream-5-5-261028`     |
| Seedance 2.0 / 2.0 Fast / 2.5（各含 reference 端点） | ✓   | ✓                                 | ✓                              |

- 火山与 BytePlus 同一套 Ark 协议，Worker 共用 `providers/volcengine`；key 都是 `ark-...` 但不通用。验证都是 `GET {baseUrl}/models`（`apiKey.service.ts`）。
- key 存 `UserApiKey`（`adapterType` + `providerConfig` JSON），同一 adapter 取最新一把（`findActiveKeyForAdapter`）。

## 定下的做法

1. **一种「字节 key」**：设置里只有一个「字节」格。保存时先打国内站 `/models`，不通再打海外站，哪个通就记成哪个站。内部仍存为 `VOLCENGINE` / `BYTEPLUS` 两种 adapter —— 已有的 key 行一行不改，不做数据迁移。
2. **默认站点**：同时有国内、海外两把字节 key 时，key 设置里把其中一把设为默认（owner 选画法 A：「默认」小标 + 「设为默认」）。存在服务端（`UserApiKey` 加一列默认标记，迁移只加列），因为生成与助手都在服务端取 key；以后中转 key 一家多把时复用同一列。只有一把时它就是默认，不出这个开关。
3. **选择器一行「字节」**：目录这一层（`withProviderKeyCoverage` → `foldBytedanceStations`）同款只留默认站那条，跑哪站与显示哪站同一份，服务端路由不用改；渠道行写 ByteDance。存下来的旧站选择、助手点名、重跑旧生成都按同款落回（`findOptionById` / `findOptionByModelId`）。
4. **只有一站有的型号**（Seedream 5.0 基础款只在国内站）：仍挂在「字节」下；默认 key 是海外站时，点它提示「这个型号只在国内站」。
5. **fal 字节条目下架**：`available: false` 并进 `RETIRED_MODEL_IDS`，历史生成照样解析标签。只配了 fal key 的人需要改配字节 key（owner 已接受）。记住过 fal 渠道的型号回到「未选」；记住过火山或 BytePlus 的映射到「字节」。

## 施工片（一个 PR）

1. **key**：设置页「字节」格 + 保存时探测站点 + 默认标记列与开关（三语文案）。
2. **路由与选择器**：两站折成一行、按默认 key 选条目、单站型号提示；助手 `set_model` 同步。
3. **fal 下架**：8 个 fal 字节条目退役，改掉引用它们的推荐、model-strengths、首页素材与 e2e 出图主流程（现用 fal `seedream-5.0-lite`）。

## 顺带发现（官网 2026-11-11 核实）

- 两站都已上线、项目还没接：Seedream 5.0 Flash（`doubao-seedream-5-0-flash-260915` / `dola-seedream-5-0-flash-260915`）、Seedance 2.0 mini（`doubao-seedance-2-0-mini-260615` / `dreamina-seedance-2-0-mini-260615`）。
- Seedream 5.5：Seed 官方 2026-11-09 发布，2026-11-13 两站模型列表已上架，同日接入（`SEEDREAM_55_VOLCENGINE` / `SEEDREAM_55_BYTEPLUS`）。
