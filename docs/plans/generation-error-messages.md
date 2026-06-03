# 生成失败错误提示统一 Spec

## 目标与背景

让**所有**生成失败场景（图片 / 角色图 / 节点媒体 / 视频 / 音频 / 3D）都显示**具体、分类、人能看懂**的失败原因，而不是千篇一律的"生成失败"。

**为什么做**：错误码分类系统其实已经建好（14 个 `GENERATION_ERROR_CODES` + 三语 `generationError.reasons` 字典），但只有 Studio 主图一个入口接上了。其余路径全部 fallback 到笼统文案。用户感知是"只有一个生成失败提示"。

## 关键事实（已核实）

- **`getApiErrorMessage(tErrors, payload, fallback)`**（[api-error-message.ts](../../src/lib/api-error-message.ts)）是 ~10 文件、几十处调用的统一错误展示入口，但**只消费 `i18nKey`，不消费 `errorCode`**。升级它是最大杠杆点。
- API 错误响应 payload **已携带 `errorCode`**（`GenerationError.toJSON()` + legacy service error 都有），只是前端展示层把它丢了。
- i18n 顶层命名空间是 **`Errors`（大写）**，`tErrors = useTranslations('Errors')`。后端结构化错误的 `i18nKey`（形如 `errors.provider.timeout`）经 `normalizeI18nKey` 去前缀后落在 `Errors.*`。
- 错误码分类提示现状在 `StudioV2.generationError.reasons.*`（13 个，缺 `provider_insufficient_balance`），只有 [StudioGenerationErrorDialog](../../src/components/business/image/StudioGenerationErrorDialog.tsx) 用，靠 `parseGenerationErrorCode(message)` 反推 code。
- **errorCode 两套命名**：后端 `GenerationError` 子类用大写（`PROVIDER_TIMEOUT`、`SAFETY_FILTER_BLOCKED`…），前端分类用小写 snake_case（`provider_timeout`…）。传错查不到。

## 根因（三条）

1. **数据流断裂**：payload 有 `errorCode`，但 hook 的 error state 是纯 `string`（[use-unified-generate.ts:103](../../src/hooks/use-unified-generate.ts)），大量分支直接 `setError(tStudio('generateFailed'))`，code 丢失。
2. **`getApiErrorMessage` 不认 errorCode**：只读 `i18nKey`，而后端 `getGenerationErrorI18nKey` 只对 6/14 类错误返回 key，其余 8 类拿不到友好提示。
3. **分类字典只接了一个入口**：`reasons` 只被主图 Dialog 用；其余路径各用各的 `errorFallback`/`generateFailed`。

## 方案

**核心**：把"errorCode → 友好提示"做成**单一事实源**，新增**生成专用**解析器 `getGenerationErrorMessage`，再把仍在用笼统 fallback 的生成分支改用它；主图 Dialog 改为消费传入的 code。

> **为什么不直接升级通用 `getApiErrorMessage`**（已核实）：它也被下载/profile 等**非生成**场景调用。下载失败返回 `{ error: 'Upstream returned 502' }`（无 i18nKey/errorCode），若做 message 分类会把 `502` 误判成 `model_unavailable`→"模型暂时不可用"。所以 `getApiErrorMessage` 保持通用原行为（i18nKey → raw → fallback），分类逻辑只放进 `getGenerationErrorMessage`，生成调用方显式改用。

解析优先级（`getGenerationErrorMessage`）：

```
1. i18nKey 命中 Errors.* → 用（后端针对具体 provider 的精准提示，如参考图格式）
2. code = normalizeErrorCode(payload.errorCode) ?? parseGenerationErrorCode(payload.error)
   if code !== unknown && Errors.generation.{code} 存在 → 用
3. payload.error（provider 原文）?? fallback（笼统兜底）
```

`normalizeErrorCode` 映射表（后端大写 → 前端小写）：
| 后端 code | 前端 code |
| --- | --- |
| `PROVIDER_TIMEOUT` | `provider_timeout` |
| `RATE_LIMIT_EXCEEDED` | `provider_rate_limit` |
| `SAFETY_FILTER_BLOCKED` | `content_filtered` |
| `FREE_LIMIT_EXCEEDED` | `insufficient_credits` |
| `INVALID_API_KEY` / `MISSING_API_KEY` | `invalid_api_key` |
| 其余泛化码（`PROVIDER_ERROR`/`VALIDATION_ERROR`/…） | `null` → 交给 `parseGenerationErrorCode(message)` 从 provider 原文细分 |

## 分阶段（一阶段一 commit，每步全验证）

- **Phase 1 — i18n 分类字典归位**：三语 `Errors` 新增 `generation.{14 codes}`，从 `StudioV2.generationError.reasons` 迁移文案 + 补 `provider_insufficient_balance`。保留 `generationError` 的 UI 文案（title/retry/switchModel/viewDetails），删 `reasons`。
- **Phase 2 — 统一错误码 + 生成专用解析器**：`generation-errors.ts` 加 `normalizeErrorCode`；`api-error-message.ts` 新增 `getGenerationErrorMessage`（`getApiErrorMessage` 保持原样）；新建两个 test 文件。✅ 已完成。
- **Phase 3 — 主图 Dialog 带 code**：`StudioGenerationErrorDialog` reason 迁到 `Errors.generation.{code}`（Phase 1 已做）；`use-unified-generate` 暴露 `errorCode` state；`StudioCanvas` 传 `{message, code}`；生成分支改用 `getGenerationErrorMessage`；更新 test。
- **Phase 4 — 接入剩余生成分支**：把生成场景的 `getApiErrorMessage` 调用改为 `getGenerationErrorMessage`（unified image/video/audio、3D、node workbench 角色图/节点媒体）；unified 里 `statusResponse.error ?? fallback` → `getGenerationErrorMessage`；轮询超时分支用 timeout 文案；`use-generate-video`/`long-video`/`multiview` 检查接入。**非生成调用方（下载/profile/gallery/edit 的 download 分支）保持 `getApiErrorMessage`**。纯 catch（网络异常）保留语义化 fallback。
- **Phase 5 — 验证**：`npx vitest run` 相关 + `npm run lint`。

## 不做（本次范围外）

- 后端补全所有 provider adapter 的错误分类（有 `getApiErrorMessage` 的 code 兜底，非必须）。
- 非生成类错误（下载/profile/上传）的文案统一——已各自走 `getApiErrorMessage`，不在本次诉求内。
