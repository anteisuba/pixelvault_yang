# 项目状态

最后更新：2026-07-30

唯一活跃进度文档。保持短，覆盖更新，不追加历史。

## Current Focus

- 当前进入画布阶段性交接。功能基线已经形成，但**节点详情页只确认了
  A「对象工作室」的结构方向，详细页面设计尚未完成**；现有本地实现是供下一轮设计
  核对真实内容、状态和尺寸的施工基线，不是最终视觉规范。
- 首页、LoRA、画布、模型目录和认证均有本地改动。交接提交只代表当前可恢复快照，
  不代表 release-ready；push `main` 仍需完整 release P0。
- ElevenLabs Music v2 的后端接入与首页官方品牌素材已补齐；模型保持 catalog
  可用。模型卡不得回退为重复模型图或通用 provider 截图。

## Completed / Stable Enough to Build On

- 画布视频节点已收口为「纯视频卡 + 固定右侧紧凑编排器」；节点仅由显式扩大按钮进入详情，
  双击节点、素材槽、模型/参数控件和「从画布选择」均不应打开详情。
- 视频引用会沿真实连线收割图片、视频和声音；紧凑预览与提交共用
  `buildVideoSendPreview`，避免 UI 与 payload 数量不一致。
- `video-model-send-plan.ts` 已按 Seedance、Kling、HappyHorse、Gemini
  定义素材槽、参数能力、禁用原因和执行状态。Fal builder 与 Worker builder 已对齐
  Seedance 多模态总上限、`generate_audio` 与 `seed`。
- 旧 `fusedIntoNodeId` 隐藏/吞入通路已退役；旧项目通过兼容迁移恢复节点和边。
- 左侧 Cast 卡匣已降级为全部真实节点的分组、搜索、定位与选中入口，不再承担编辑和新建。
- 首页模型卡已改用模型/厂商品牌素材；真实首页视频播放器与横轨仅横向滚动已实现。
- LoRA 底模选择器与生成页入口已经接入首页同源模型素材。
- 本地化 Clerk 登录/注册 catch-all 路由已恢复，开发环境用户映射已修复。

## Design Status

- 已确认：浅色画布；半透明、留白充足；详情与紧凑侧栏职责分离；九类节点共享外框但
  内容不能同构；桌面充分使用宽度，窄屏在控件拥挤前切单列；图片和声音详情保留明确生成按钮。
- 未确认：九类节点的最终信息层级、每类默认/空/生成中/失败状态、最终操作区、
  视频资产卡与片盒、按钮动效与浮层色彩。
- 稳定方向与未决问题见
  `docs/plans/canvas-session-handoff-2026-07-30.md`；详情页当前结构见
  `docs/references/pages/canvas-node-detail.md`，其状态必须保持“详细设计未完成”。

## Validation

- 画布视频编排、发送计划、旧数据迁移、节点定位与详情入口：定向 Vitest
  7 files / 101 tests 通过。
- Fal 请求构造、服务端视频校验、模型解析、工作流与视频 inspector：定向 Vitest
  7 files / 158 tests 通过。
- 相关 ESLint：0 error，4 条既有 warning。
- 首页 / LoRA / proxy / 音频目录与服务定向组：9 files / 121 tests 通过。
- 全量 `npx tsc --noEmit --pretty false` 通过。首次运行暴露图片编辑任务图标映射
  缺项，补齐 `object-replace` 与 `style-transfer` 后重跑为 exit code 0。
- 真实扣费视频 provider smoke 尚未执行；当前没有已配置的 Fal API key。

## Next

1. 按 `ui-page` 硬门完成节点详情页详细设计：事实矩阵 → 九类节点真实内容 →
   三个结构方向或在已选 A 内完成三个关键布局切片 → owner 确认 → 更新 page 文档。
2. 设计视频资产卡与片盒：明确生成结果如何归档、复用、定位和进入下一轮编排。
3. 用至少一个真实 provider key 验证 Seedance / Kling 等模型专属发送计划与实际 payload。
4. 完成首页与 375px 响应式回归。
5. 收尾 loading / failure / cancel、按钮过渡、浮层色彩、键盘/焦点与 reduced-motion。
6. 交付前跑完整 lint、Vitest、Playwright mobile、production build；
   push `main` 前再过 `docs/checklists/release.md` P0。

## Blocked

- 真实视频 provider smoke 需要有效且经 owner 授权使用的 API key，并会产生费用。
- 节点详情的最终页面设计需要 owner 对关键切片逐项确认；当前实现不能自行升级为现行规范。
