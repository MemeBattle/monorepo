import { createCasServices } from '../src/createCasServices'
import { load } from 'dotenv-extended'
import chalk from 'chalk'
import { readFileSync } from 'fs'
import { resolve } from 'path'

load()

console.log(
  chalk.gray(
    `Start integratedTest\n============\nCAS_PUBLIC_KEY_PATH: ${process.env.CAS_PUBLIC_KEY_PATH}`,
  ),
)

const key = readFileSync(resolve(__dirname, process.env.CAS_PUBLIC_KEY_PATH)).toString()

const logger = (...messages: unknown[]): void => {
  console.log(chalk.blue('Logger start'))
  console.log(...messages)
  console.log(chalk.blue('Logger end'))
}

const services = createCasServices({
  casURI: process.env.CAS_URL,
  publicKey: key,
  partnerId: process.env.CAS_PARTNER_ID,
  errorLogger: logger,
  successLogger: logger,
})

;(async () => {
  console.log(chalk.yellow.bold('Start integratedTest'))

  try {
    const healthResult = await services.healthService()

    if (healthResult.success) {
      console.log(chalk.green('Health success'))
      console.log(healthResult.data)
    }

    const loginResult = await services.loginService({
      login: process.env.CAS_LOGIN,
      password: process.env.CAS_PASSWORD,
    })

    if (loginResult.success) {
      console.log(chalk.green('Login success result'))
      console.log(loginResult)

      const verifyResult = await services.verifyToken(loginResult.data.token)

      if (verifyResult.success) {
        console.log(chalk.green(`Verify token success`))
        console.log(verifyResult)
      } else {
        console.log(chalk.red(`Verify token error`))
        console.log(verifyResult)
      }
    } else {
      console.log(chalk.red(`Login error result`))
      console.log(loginResult)
    }

    const verifyFalseResult = await services.verifyToken('qweqweqwe')

    if (verifyFalseResult.success) {
      console.log(chalk.red(`Verify falsy token error`))
    } else {
      console.log(chalk.green(`Verify falsy token success`))
    }

    const users = await services.getUsersService()

    if (users.success) {
      console.log(chalk.green('Get users success'))
    } else {
      console.log(chalk.red('Get users error'))
    }

    const temporaryToken = await services.createTemporaryTokenService()

    if (temporaryToken.success) {
      console.log(chalk.green('Create temporary token success'))
      console.log(temporaryToken.data)
    } else {
      console.log(chalk.red('Create temporary token error'))
      console.log(temporaryToken)
    }
  } catch (e) {
    console.error('ERROR', e)
  }
})()
