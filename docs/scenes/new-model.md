# Scene · 接入新模型 / provider（new-model.md）

> 覆盖：新增模型、升级模型版本（如 Seedream 4.5→5.0）、接入新 provider、调整模型配置。**本场景全程受联网核验义务约束**——endpoint / model id / payload / 参数 / 限制不允许凭记忆。对应 checklist：`checklists/backend.md`。

## 专属 5 问（开工硬门）

1. **模型身份与官方依据？**——官方模型页 + API reference 链接（先查 `references/model-catalog.md` 本月发现）；`externalModelId` 精确值；payload 字段逐个从官方文档核。
2. **走哪个通道？**——直连官方优先，FAL 只在无直连或 FAL 唯一/更优时；国内模型按 additive 双版本原则（火山直连与 fal 并存，不互替）。已有 adapter 只加配置；新 provider 才写新 adapter。
3. **能力契约是什么？**——模态 / 参考图（几张、什么格式）/ 时长 / 分辨率 / duration 是否支持 `'auto'`——capability 决定 UI chip 渲染（不支持不渲染，别留死按钮）。
4. **执行路径通吗？**——Worker-only：对应 Worker handler 存在吗？没有 = 该路径会 fail，先补 handler。平台 key 有 `getSystemApiKey` 映射吗？`freeTier` 给不给（= 平台额度决定，问 owner）？
5. **错误与计费怎么映射？**——该 provider 的错误码/message 特征 → 标准 errorCode 表 + 三语文案；`cost` 定多少（平台额度单位，不是 provider 计费真值）。

## 本场景工作流

1. 问 5 问。
2. **联网核官方**（优先级：官方 API 文档 > SDK/changelog > model card > 公告）；官方与代码现状冲突 → 停下问 owner。
3. 读规矩：`references/providers.md`（Hard rules + 错误机制 + 逐 provider 表）→ `references/model-catalog.md` → `references/backend.md` → `src/constants/CLAUDE.md`。
4. **四件套一次到位**：`AI_MODELS` enum → 模型配置（externalModelId / capability / cost / officialUrl 指向精确 API 文档页）→ i18n ×3（label/description）→ adapter（仅新 provider）。
5. Worker handler 确认或补齐；错误映射补齐（raw 错误不直达用户）。
6. 测试：model constants / adapter 测试 + **全量 vitest**——⚠ 历史教训：改/删模型会波及 prompt、adapter、route 的跨文件测试，定向子集必漏。
7. 端到端实测：dev 环境用**一次性 dev key** 真生成一次（严禁生产 key）。
8. 收尾同步：`references/model-catalog.md` 现役表更新 + `status.md`。
9. 交付报告：官方依据链接 + 四件套清单 + 测试与端到端结果 + 手动验证步骤。

## 必读清单

`references/providers.md` · `references/model-catalog.md` · `references/backend.md` · `forbidden.md`（后端/CI 节）· `src/constants/CLAUDE.md`

## 禁改范围默认值

不顺带动其他模型的配置 · 不动 credit/计费逻辑 · **模型下架/availability 翻转 = owner 决定**（走 model-catalog 建议表拍板，不擅自退役）· 不动 BYOK 路由顺序。

## 验证命令

全量 vitest + 全量 tsc → i18n-check（completeness 测试会抓漏译）→ dev 端到端生成实测 → `npm run models:check-docs` 本地跑一次确认 officialUrl 可达。
