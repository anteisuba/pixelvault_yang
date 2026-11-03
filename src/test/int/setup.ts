import { inject } from 'vitest'

// 在任何被测模块 import `@/lib/db` 之前，把连接串换成测试库。
process.env.DATABASE_URL = inject('databaseUrl')
