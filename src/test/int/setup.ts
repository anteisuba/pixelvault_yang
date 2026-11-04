import { inject } from 'vitest'

// 在任何被测模块 import `@/lib/db` 之前，把连接串换成测试库。
process.env.DATABASE_URL = inject('databaseUrl')

// 测试专用的加密钥（64 个十六进制字符）：`seedAssistantKey` 真加密、服务真解密。⛔ 不是线上那把。
process.env.API_KEY_ENCRYPTION_SECRET = 'a'.repeat(64)

// 存储 CDN 前缀钉死成测试值：本机 shell 常带着线上的 CDN，CI 里又没有，两边结果不一样
// （11-04 CI 红：没设时直传 500、摘图不删 R2）。⛔ 不读开发机的值。
process.env.NEXT_PUBLIC_STORAGE_BASE_URL = 'https://cdn.test'
