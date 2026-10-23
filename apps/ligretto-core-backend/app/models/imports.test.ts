import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const modelsDir = fileURLToPath(new URL('.', import.meta.url))
const appRoot = fileURLToPath(new URL('../../', import.meta.url))
const models = readdirSync(modelsDir).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))

// The models import each other, and decorator metadata reads a parameter's type eagerly: a model annotated with
// another model's class throws in the temporal dead zone when that other model is the first one evaluated. The test
// runner's single process loads the models in one order only, so each model is imported first in a fresh process.
test.group('models', () => {
  for (const model of models) {
    test(`${model} imports first in a fresh process`, async ({ assert }) => {
      const { stderr } = await run(
        process.execPath,
        ['--import=@poppinss/ts-exec', '--input-type=module', '-e', `await import(${JSON.stringify(`./app/models/${model}`)})`],
        { cwd: appRoot },
      )

      assert.equal(stderr, '')
    }).timeout(30_000)
  }
})
