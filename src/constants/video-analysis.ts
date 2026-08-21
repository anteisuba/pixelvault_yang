/**
 * 视频分析的旋钮与失败语义（AI 导演内核切片 2 §4.3 / §4.3.1 / §4.3.2）。
 *
 * 🔬 Gemini 视觉 token **≈ 5,450 / 分钟，随时长线性**（18m41s = 101,923；
 * 1h00m02s = 326,504，两点算出来一致）。`videoMetadata` 是比「超阈值弹确认卡」
 * 便宜得多的两个旋钮：
 *
 * | 配置                                    | VIDEO token | 相对全片 |
 * | --------------------------------------- | ----------- | -------- |
 * | 全片 18m41s（默认帧率）                  | 101,923     | 100%     |
 * | `{ startOffset: 0, endOffset: 60 }`     | 5,460       | **5%**   |
 * | `{ fps: 0.2 }` 全片                      | 42,787      | 42%      |
 *
 * v1 **两个旋钮都不拧**（默认全片默认帧率），但参数通道是通的
 * （`LlmTextInput.videoAnalysis`）——「先降级再问」的策略在后续批接上去时
 * 不需要再动一次管线。
 */
export const VIDEO_ANALYSIS = {
  /** `null` = 用 provider 默认帧率。降档实测值是 0.2（见上表），本批不接线。 */
  defaultFps: null,
  /** `null` = 不裁，全片。裁窗单位是秒，序列化成 Gemini 要的 `"60s"`。 */
  defaultStartOffsetSeconds: null,
  defaultEndOffsetSeconds: null,
} as const

/**
 * ⚠ **坑 1（§4.3.2，实测踩过）**：thinking token 从 `maxOutputTokens` 里扣。
 * 给 800 实测得到 `thoughtsTokenCount=765` / 正文 31 字 / `finishReason=MAX_TOKENS`
 * —— 表现是「视频分析回了半句就没了」，极易误判成模型不行或视频太长。
 * 所以**带视频的那一轮**，显式输出预算低于这个数就抬到这个数（只抬不降）。
 *
 * 助手路本身送的是 `providerManagedOutput: true`（根本不发 `maxOutputTokens`，
 * 由模型自己的上限兜着，远高于 3000），这条闸是给**显式指定预算**的调用方兜底的。
 */
export const VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS = 3000

/**
 * ⚠ **坑 2（§4.3.2，实测踩过）**：`fileUri` 指向的视频不可访问时 Gemini 回
 * **403 PERMISSION_DENIED**，不是 404。直译给用户就成了「你的 API key 没权限」，
 * 会把人引去查 key —— 这正是 §3.4 第 1 闸「失败语义要分开」在视觉线的落点。
 */
export const VIDEO_ANALYSIS_UNREACHABLE_ERROR = {
  code: 'ASSISTANT_VIDEO_UNREACHABLE',
  /**
   * 对客户端回 422 而不是原样透传 403：403 在我们自己的信封里读起来仍然是
   * 「你没权限」，那就等于没修。422 = 这条输入我们处理不了。
   */
  httpStatus: 422,
  i18nKey: 'errors.assistant.videoUnreachable',
  message:
    'The linked video is not reachable — it may be private, deleted, or region-locked. This is not an API key problem.',
} as const
