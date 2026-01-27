#!/usr/bin/env node

import * as fs from 'fs'
import axios from 'axios'
import * as readline from 'readline'
import chalk from 'chalk'
import * as chalkAnimation from 'chalk-animation'

const CAS_BASE_URI = 'https://cas.mems.fun'
const DEFAULT_KEY_PATH = './key.pem'

const createCasRoutes = (casURI = CAS_BASE_URI) => ({
  createPartner: `${casURI}/partners`,
  loginRequest: `${casURI}/auth/login`,
  getPartnerKey: partnerId => `${casURI}/partners/${partnerId}/key`,
})

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const styles = {
  defaultString: chalk.underline.blue,
  endLine: chalk.underline.bold.yellow,
  helper: chalk.underline.gray,
  success: chalk.green.bold,
}

function decorateObjectMethods<O>(obj: O, decorator: (func: () => Promise<void>) => () => void): O {
  return Object.entries(obj).reduce(
    (decoratedObject: O, [key, prop]): O => ({ ...decoratedObject, [key]: decorator(prop) }),
    {} as O,
  )
}

const createQuestion = (questionText: string, defaultValue = ''): Promise<string> =>
  new Promise(resolve =>
    rl.question(questionText, answer => {
      resolve(answer || defaultValue)
    }),
  )

const checkNotEmptyString = (inputString: string, errorMessage = ''): boolean => {
  if (!inputString.length && errorMessage) {
    throw new Error(errorMessage)
  }
  return inputString.length > 0
}

type ShowLoader = <A>(func: (...rest: A[]) => Promise<unknown>) => () => void

const showLoader: ShowLoader = asyncFunc => async (...args) => {
  const loader = chalkAnimation.rainbow('Wait CAS answer...')
  const answer = await asyncFunc(...args)
  loader.stop()
  return answer
}

type Credentials = {
  login: string
  password: string
}

type CreatePartner = {
  email: string
  password: string
  username: string
}

type User = {
  username: string
  email: string
  token: string
  _id: string
}

type SuccessAnswer = {
  success: true
}

type UserAnswer = {
  user: User
  token: string
} & SuccessAnswer

const createRequests = CAS_URI => {
  const CAS_ROUTES = createCasRoutes(CAS_URI)

  return {
    loginRequest: async (credentials: Credentials): Promise<UserAnswer> => {
      const answer = await axios.post(CAS_ROUTES.loginRequest, credentials)
      return answer.data.data
    },

    createPartner: async (userData: CreatePartner, token: string): Promise<UserAnswer> => {
      const answer = await axios.post(CAS_ROUTES.createPartner, userData, {
        headers: { Authorization: token },
      })
      return answer.data.data
    },

    getKey: async (partnerId: string, token: string): Promise<string> => {
      const answer = await axios.get(CAS_ROUTES.getPartnerKey(partnerId), {
        headers: { Authorization: token },
      })
      return answer.data
    },
  }
}

const partnerSignUp = async (user, createPartner, token): Promise<string> => {
  const partnerUsername = await createQuestion(
    `Partner username (${styles.defaultString(user.username)}): `,
    user.username,
  )
  checkNotEmptyString(partnerUsername, 'Username must be not empty')

  const partnerEmail = await createQuestion(`Partner email (${styles.defaultString(user.email)}): `)
  checkNotEmptyString(partnerUsername, 'Partner email must be not empty')

  const partnerPassword = await createQuestion(`Partner password: `)
  checkNotEmptyString(partnerUsername, 'Password must be not empty')

  const answer = await createPartner(
    {
      email: partnerEmail,
      username: partnerUsername,
      password: partnerPassword,
    },
    token,
  )

  return answer._id
}

const initPartner = async () => {
  try {
    const CAS_URI = await createQuestion(
      `CAS uri (${styles.defaultString(CAS_BASE_URI)}): `,
      CAS_BASE_URI,
    )

    const { loginRequest, createPartner, getKey } = decorateObjectMethods(
      createRequests(CAS_URI),
      showLoader,
    )

    const username = await createQuestion(`username: `)
    checkNotEmptyString(username, 'Username must be not empty')

    const password = await createQuestion('password: ')
    checkNotEmptyString(password, 'Password must be not empty')

    const { token, user } = await loginRequest({ login: username, password })

    console.log(styles.success(`Hello, ${user.username}`))

    const partnerId = await createQuestion(
      `partnerId (${styles.helper('blank field to create new')}): `,
    )

    const newPartnerId = (partnerId as string) || (await partnerSignUp(user, createPartner, token))

    const key = await getKey(newPartnerId, token)

    console.log('key: ', key)

    const keyPath = await createQuestion(
      `Path to save a key (${styles.defaultString(DEFAULT_KEY_PATH)}): `,
      DEFAULT_KEY_PATH,
    )

    fs.writeFileSync(keyPath, key, { flag: 'w+' })
  } catch (e) {
    console.error(e)
  } finally {
    console.log(styles.endLine('Good luck :)') + '\n')
    rl.close()
  }
}

initPartner()
