import { inject } from 'vitest'

// 在任何被测模块 import `@/lib/db` 之前，把连接串换成测试库。
process.env.DATABASE_URL = inject('databaseUrl')

// 测试专用的加密钥（64 个十六进制字符）：`seedAssistantKey` 真加密、服务真解密。⛔ 不是线上那把。
process.env.API_KEY_ENCRYPTION_SECRET = 'a'.repeat(64)
