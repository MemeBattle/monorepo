import { defineConfig } from '@adonisjs/core/app'
import { indexEntities } from '@adonisjs/core'

export default defineConfig({
  hooks: {
    init: [
      indexEntities({
        controllers: {
          glob: ['**/*Controller.ts'],
        },
      }),
    ],
  },
  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  |
  | List of ace commands to register from packages. The application commands
  | will be scanned automatically from the "./commands" directory.
  |
  */
  commands: [() => import('@adonisjs/core/commands'), () => import('@adonisjs/lucid/commands')],
  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  |
  | List of modules to import before starting the application.
  |
  */
  preloads: [
    () => import('./start/routes.js'),
    () => import('./start/kernel.js'),
    {
      file: () => import('./start/overloads.js'),
      environment: ['web', 'test'],
    },
  ],
  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  |
  | List of service providers to import and register when booting the
  | application
  |
  */
  tests: {
    suites: [
      {
        name: 'functional',
        files: ['app/controllers/**/*.test.{ts,js}', 'start/**/*.test.{ts,js}'],
        timeout: 30000,
      },
      {
        name: 'unit',
        files: ['app/models/**/*.test.{ts,js}', 'app/services/**/*.test.{ts,js}', 'app/helpers/**/*.test.{ts,js}'],
      },
    ],
  },
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    () => import('./providers/CasServiceProvider.js'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/cors/cors_provider'),
  ],
})
