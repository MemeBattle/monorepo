import env from '#start/env'
import { defineConfig } from '@adonisjs/core/logger'

export default defineConfig({
  default: 'app',
  loggers: {
    app: {
      name: env.get('LIGRETTO_CORE_APP_NAME'),
      enabled: true,
      level: env.get('LOG_LEVEL', 'info'),
      transport: env.get('NODE_ENV') === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  },
})
