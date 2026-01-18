import { serve } from '@hono/node-server'
import { logger } from 'hono/logger'

import { Hono } from 'hono'
import { cors } from 'hono/cors'

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type PublicKeyCredentialCreationOptionsJSON
} from '@simplewebauthn/server';
import { generateUserID } from '@simplewebauthn/server/helpers';

const app = new Hono().basePath('/api').use(cors()).use(logger())

const webauthnRouter = new Hono()


app.get('/', (c) => {
  return c.text('Hello Hono!')
})

/**
 * Human-readable title for your website
 */
const rpName = 'MemeBattle CAS';
/**
 * A unique identifier for your website. 'localhost' is okay for
 * local dev
 */
const rpID = 'localhost';

const origin = 'http://localhost:5173'

let currentCreationOptions: PublicKeyCredentialCreationOptionsJSON

webauthnRouter.post('/register-options', async (c) => {
  const options = await generateRegistrationOptions({
    rpID,
    rpName,
    userName: 'testuser',
    userID: await generateUserID(),
    attestationType: 'none',
    authenticatorSelection: {
      // "Discoverable credentials" used to be called "resident keys". The
      // old name persists in the options passed to `navigator.credentials.create()`.
      residentKey: 'required',
      userVerification: 'preferred',
    },
  })
  currentCreationOptions = options
  return c.json(options)
})

webauthnRouter.post('/verify-registration', async (c) => {
  const body = await c.req.json()
  const response = await verifyRegistrationResponse({response: body, expectedChallenge: currentCreationOptions.challenge, expectedOrigin: origin})
  return c.json(response)
})


app.route('/webauthn', webauthnRouter)


serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  app.routes.forEach(route => {
    console.log(`${route.method} ${route.path} ${route.handler.name}`)
  })
  console.log(`Server is running on http://localhost:${info.port}`)
})
