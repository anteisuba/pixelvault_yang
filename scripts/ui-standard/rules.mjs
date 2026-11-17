// 手写按钮门（触屏命中区，owner 2026-11-16 拍 A+B）。
// eslint.config.mjs 与 src/test/raw-button.contract.test.ts 共用这一份。
//
// 为什么有它：「手机点击区补到 44px」30 天修了三轮（8248195fe / dd73eb942 /
// 781b7fcb1 …），每轮都是人眼发现后逐个补。`@/components/ui/button` 的 size 变体
// 自带 `touch-target` / `touch-target-y`（globals.css，coarse 下 ::before 补到 44，
// 不改长相；规范 docs/references/ui-defaults.md §5）；手写 `<button>` 绕过了它，
// 命中区全靠作者记得加类。
//
// ⚠ 用自带的规则 id（`antei/no-raw-button`），⛔ 不搭 `no-restricted-syntax`：
// flat config 里同一条规则后一个块会整块替换前一个块的 options，「错误显示门」
// 和「测试标准门」已经各占了一份 no-restricted-syntax，再叠一块就会互相冲掉。
import { readFileSync } from 'node:fs'

/** className 里出现这两个类之一 = 作者已经想过命中区，放行。 */
const TOUCH_TARGET_RE = /(^|[^\w-])touch-target(-y)?(?![\w-])/

export const RAW_BUTTON_MESSAGE =
  '别手写 <button>：用 @/components/ui/button 的 Button（size 变体自带触屏 44px 命中区）。确需手写时 className 必须带 touch-target（小图标键）或 touch-target-y（成排 chip），见 docs/references/ui-defaults.md §5。'

/** @type {import('eslint').Rule.RuleModule} */
export const noRawButtonRule = {
  meta: {
    type: 'problem',
    docs: { description: '手写 <button> 必须带触屏命中区类，或改用 Button' },
    messages: { rawButton: RAW_BUTTON_MESSAGE },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'button')
          return
        const className = node.attributes.find(
          (attr) =>
            attr.type === 'JSXAttribute' &&
            attr.name.type === 'JSXIdentifier' &&
            attr.name.name === 'className',
        )
        // 读 className 整段源码：字符串、模板串、cn(...) 的参数都算。
        if (
          className &&
          TOUCH_TARGET_RE.test(context.sourceCode.getText(className))
        )
          return
        context.report({ node, messageId: 'rawButton' })
      },
    }
  },
}

export const UI_STANDARD_PLUGIN = {
  meta: { name: 'antei-ui-standard' },
  rules: { 'no-raw-button': noRawButtonRule },
}

/** 规则管的范围：src 下的 .tsx，基础组件与测试除外。 */
export const RAW_BUTTON_FILES = ['src/**/*.tsx']
export const RAW_BUTTON_SCOPE_IGNORES = [
  'src/components/ui/**',
  '**/*.test.tsx',
  '**/*.spec.tsx',
]

/**
 * 棘轮：规矩上线时（2026-11-16）已经有违规手写按钮的文件。名单只减不增——
 * 文件里的手写按钮都改成 Button 或补上类之后就从名单删掉（契约测试会提醒），
 * 新文件不许进名单。
 */
export const RAW_BUTTON_BASELINE = JSON.parse(
  readFileSync(new URL('./raw-button-baseline.json', import.meta.url), 'utf8'),
)

/**
 * 长期豁免（不是待迁名单）：
 * - dev/ui-states：开发用的状态陈列页，生产环境直接 notFound()，用户到不了。
 */
export const RAW_BUTTON_EXEMPT = ['src/app/\\[locale\\]/\\(main\\)/dev/**']

/** 给 eslint `ignores` 用：路径里的 `[id]`、`(main)` 是 glob 特殊字符，要转义。 */
export const RAW_BUTTON_BASELINE_GLOBS = RAW_BUTTON_BASELINE.map((file) =>
  file.replace(/[[\]()]/g, '\\$&'),
)
