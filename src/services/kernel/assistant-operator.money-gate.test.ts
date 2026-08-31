import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_MUTATING_TOOLS,
  ASSISTANT_OPERATOR_TOOLS,
} from '@/constants/assistant-operator'

/**
 * **钱闸的结构性证明**（拍板 2 · 任务包 §2「服务端没有任何工具能创建 generation」）。
 *
 * ⚠ 这是一份**读源码**的测试，不是行为测试 —— 有意的。行为测试只能证明「我写的
 * 这几条路径没花钱」；这份证明的是「这个文件够不着花钱的东西」。前者会被下一个人
 * 加的一条新路径绕过，后者不会：他得先来改这份允许名单，而改名单是一个看得见的动作。
 *
 * 同类先例：`prisma/migration-safety.test.ts`（约束型迁移 CI 抓不到，只能读文件锁）。
 */

const SERVICE_PATH = join(
  process.cwd(),
  'src/services/kernel/assistant-operator.service.ts',
)
const SOURCE = readFileSync(SERVICE_PATH, 'utf8')
const FOLDER_VISION_SERVICE_PATH = join(
  process.cwd(),
  'src/services/kernel/assistant-asset-folder-vision.service.ts',
)
const FOLDER_VISION_SOURCE = readFileSync(FOLDER_VISION_SERVICE_PATH, 'utf8')

/**
 * 工具环允许 import 的服务，逐条写明为什么。
 *
 * ⛔ 往这里加一条之前先回答：它会不会（直接或间接）创建 generation、扣 credit、
 * 调 provider 出图？会就不该出现在这个文件里 —— 助手的活是填表单，不是出图。
 */
const ALLOWED_SERVICE_IMPORTS = new Set([
  // 认人：clerkId → 库里的 user.id，检索要按它收敛。
  '@/services/user.service',
  // 只读分页查询（`search_assets`）。⚠ 同一个模块里有 `createGeneration`，
  // 所以下面还有一条「不许出现的标识符」名单兜着。
  '@/services/generation.service',
  /**
   * 素材文件夹视觉检查：只读用户文件夹与既有图片 URL，再走结构化视觉补全；
   * 不创建 generation、不写库、不下载文件，也不触发图片 / 视频 / 音频生成。
   */
  '@/services/kernel/assistant-asset-folder-vision.service',
  // 选 LLM 路由（用户自己的 key / 平台兜底）。
  '@/services/llm-text.service',
  // 文本补全的重试策略，工具环每一步都走它。
  '@/services/kernel/assistant-completion.service',
  /**
   * 联网**搜图**（P3-B）。⭐ 加它进来的判据就是这条：它是**搜索**模块 ——
   * 出的是一串第三方 URL，一个字节都不落、一分钱都不扣。
   * ⛔ 转存那条腿（`web-image-import.service`，它 import 了 r2 + createGeneration）
   * **有意不在这份名单里**：它是用户点选之后走普通 API 路由触发的，助手够不着。
   * 哪天有人想把它加进来「省一次往返」，那就是钱闸破的那一天 —— 拒绝它，
   * 让转存留在用户手上。
   */
  '@/services/web-research.service',
  /**
   * 看图闭环的**路由解析**（P3-C）。⭐ 判据与上一条同源：它产出的是
   * 「用哪把 key、走哪个 adapter」，一个字节都不落、一分钱都不扣。真正看图的那次
   * 补全走的仍是 `assistant-completion.service`（本名单里早就有的那条）。
   * ⛔ `services/vision/vision-analyzer.service` **有意不在名单里**：那条链会落库。
   */
  '@/services/vision/vision-route.service',
  /**
   * LoRA 检索（P4-C）。⭐ 判据与 `web-research.service` 那条**逐字同源**：它是
   * **搜索 + 归一**模块 —— 打 Civitai / HF 的搜索接口，出一串候选对象，一个字节
   * 都不下载、一分钱都不扣、一行 generation 都不创建。
   * ⛔ 导入那条腿（`favoriteExternalLora` / `services/runner/civitai-lora-to-r2`）
   * **有意不在这份名单里**：它会下载权重文件、写 R2、写库。挂载那一跳因此留在
   * 客户端（走既有 `favoriteLoraAPI`），与拍板 22 的 `import_user_url` 同一个形状。
   * 哪天有人想把它加进来「省一次往返」，那就是这道闸破的那一天。
   */
  '@/services/lora/lora-candidates.service',
])

/** 出现即失败的标识符 —— 每一条都是一条能花掉用户钱的路。 */
const FORBIDDEN_IDENTIFIERS = [
  'createGeneration',
  'generateImage',
  'generateVideo',
  'generateAudio',
  'deductCredits',
  'submitGeneration',
  'execution-worker',
  'generate-image.service',
  'generate-video.service',
  'generate-audio.service',
  // db 直连：这一层不该有第二条查库的路，检索走 generation.service 的分页查询。
  "from '@/lib/db'",
  /**
   * 联网搜图的**转存**那条腿（P3-B）。搜索可以在这里，落地不行 ——
   * owner 拍板「用户确定了再落 R2」的结构表达就是这三条：工具环够不着转存服务、
   * 够不着 R2 上传、够不着 `uploadFromHttpToR2`。
   */
  'web-image-import',
  'importWebImage',
  'uploadToR2',
  'uploadFromHttpToR2',
]

function importedModules(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
}

describe('⛔ 助手工具环的钱闸', () => {
  it('只 import 允许名单里的服务', () => {
    const services = importedModules(SOURCE).filter((moduleId) =>
      moduleId.startsWith('@/services/'),
    )
    expect(services.length).toBeGreaterThan(0)
    for (const moduleId of services) {
      expect(
        ALLOWED_SERVICE_IMPORTS.has(moduleId),
        `${moduleId} 不在允许名单里。它会花钱吗？会的话别在工具环里 import 它。`,
      ).toBe(true)
    }
  })

  it('源码里不出现任何一条能花钱的标识符', () => {
    for (const identifier of FORBIDDEN_IDENTIFIERS) {
      expect(SOURCE.includes(identifier), `源码里出现了 ${identifier}`).toBe(
        false,
      )
    }
  })

  it('文件夹视觉服务只看既有素材，不具备生成、扣费或写入能力', () => {
    for (const identifier of [
      'createGeneration',
      'generateImage',
      'generateVideo',
      'generateAudio',
      'deductCredits',
      'submitGeneration',
      'execution-worker',
      'uploadToR2',
      'uploadFromHttpToR2',
      '.create(',
      '.update(',
      '.delete(',
      '.upsert(',
    ]) {
      expect(
        FOLDER_VISION_SOURCE.includes(identifier),
        `文件夹视觉服务里出现了 ${identifier}`,
      ).toBe(false)
    }
    expect(FOLDER_VISION_SOURCE).toContain('db.generation.findMany')
    expect(FOLDER_VISION_SOURCE).toContain('completeVisionStructured')
  })

  it('工具表里没有任何一条叫 generate 的（prime 除外，而它只置态）', () => {
    const generating = ASSISTANT_OPERATOR_TOOLS.filter(
      (tool) => tool.includes('generate') && tool !== 'prime_generate',
    )
    expect(generating).toEqual([])
    // prime 是改动型的（因此可撤销），但它改的是按钮的样子，不是账单。
    expect(ASSISTANT_OPERATOR_MUTATING_TOOLS).toContain('prime_generate')
  })

  /**
   * ⭐ 拍板 22 加的 `import_user_url` 是这份名单最值得复核的一次改动：它名字里就
   * 有 import，做的事也确实是「把一张图收进库」—— 但**收的那一跳在客户端**。
   * 服务端只吐一个带着源地址的 op，所以上面那两条（允许名单 + 禁字表）一条都不用松。
   * 哪天有人想「顺手在服务端 import 一下省一次往返」，先过这里。
   */
  it('import_user_url 在表里，而服务端仍然够不着导入 / R2', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('import_user_url')
    // 工具名出现在源码里（switch 分派），而导入模块的名字一个都不许出现 ——
    // 后者由上面那条 FORBIDDEN_IDENTIFIERS 用例逐条锁着。
    expect(SOURCE).toContain('importUserUrl')
    expect(SOURCE).not.toContain('api-client')
    expect(SOURCE).not.toContain('fetchAsBuffer')
  })

  /**
   * ⭐ P4-A 的视频出声开关**为什么叫 `set_sound`**，锁在这里。
   *
   * 表单那一侧的字段名是 provider 的那个词，而它逐字在上面的禁字表里
   * （它同时也是一条真的能出声、能花钱的服务函数名）。协议这一侧因此改叫
   * "sound"，落到表单字段的那一跳发生在客户端 `studio-operator-apply.ts`。
   * ⛔ 下一个人「顺手统一命名」把它改回去，禁字表那条用例会红 —— 但那时他大概
   * 会以为是禁字表写错了。这一条就是写给他看的。
   */
  it('视频出声开关的工具名不带 provider 那个字段名（否则钱闸禁字表当场红）', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('set_sound')
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(tool.includes(identifier)).toBe(false)
      }
    }
  })

  /**
   * ⭐ P4-C 的 `mount_lora` 是这份名单第二次值得复核的改动（第一次是
   * `import_user_url`）：它做的事确实是「把一把 LoRA 收进库并挂上」—— 但**收的
   * 那一跳在客户端**。服务端只吐一个带着 `importPayload` 的 op，从本轮检索结果里
   * 抄过来而已。所以允许名单只多了一条**检索**服务，禁字表一条不松。
   */
  it('LoRA 挂载在表里，而服务端仍然够不着导入 / 下载 / R2', () => {
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('search_loras')
    expect(ASSISTANT_OPERATOR_TOOLS).toContain('mount_lora')
    expect(SOURCE).toContain('searchLoraCandidates')
    // 导入那条腿的三个名字，一个都不许出现在工具环里。
    expect(SOURCE).not.toContain('favoriteExternalLora')
    expect(SOURCE).not.toContain('favoriteLoraAPI')
    expect(SOURCE).not.toContain('civitai-lora-to-r2')
    // LoRA 训练是另一条会扣钱的链 —— 它连名字都不该出现在这里。
    expect(SOURCE).not.toContain('lora-training')
    expect(SOURCE).not.toContain('startLoraTraining')
  })

  it('查库只有一处，且一定按 userId 收敛（不许翻别人的库）', () => {
    const callSites = [...SOURCE.matchAll(/getPublicGenerationPage\(/g)]
    // 一处 import + 一处调用
    expect(callSites).toHaveLength(1)
    const callBlock = SOURCE.slice(
      SOURCE.indexOf('getPublicGenerationPage({'),
      SOURCE.indexOf('getPublicGenerationPage({') + 400,
    )
    expect(callBlock).toContain('userId,')
  })
})
