import './style.css'

import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

const API_URL = 'http://localhost:3000'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>Passkey Client</h1>

    <p>Use a passkey from a password manager or a compatible security key.</p>

    <input id="displayName" type="text" placeholder="Display name" value="Ada" />

    <button id="register">Start Registration</button>

    <button id="login">Sign in with a passkey</button>

    <br />

    <button id="me">Who am I?</button>

    <button id="logout">Sign out</button>

    <br />

    <div id="success"></div>
    <div id="error"></div>
  </div>
`

const elemRegister = document.getElementById('register')
const elemLogin = document.getElementById('login')
const elemMe = document.getElementById('me')
const elemLogout = document.getElementById('logout')
const elemDisplayName = document.getElementById('displayName') as HTMLInputElement | null
const elemSuccess = document.getElementById('success')
const elemError = document.getElementById('error')

if (!elemRegister || !elemLogin || !elemMe || !elemLogout || !elemDisplayName || !elemSuccess || !elemError) {
  throw new Error('Register form not found')
}

// The session lives in an HttpOnly cookie set by the API's origin; a
// cross-origin fetch only sends and accepts it with credentials included.
elemMe.addEventListener('click', async () => {
  elemSuccess.innerHTML = ''
  elemError.innerHTML = ''

  const response = await fetch(`${API_URL}/api/me`, { credentials: 'include' })
  const json = await response.json()

  if (response.ok) {
    elemSuccess.innerHTML = `Signed in as ${json.displayName} (${json.accountType}), account ${json.accountId}, session until ${json.sessionExpiresAt}`
  } else if (json?.error?.code === 'unauthenticated') {
    elemError.innerText = 'Not signed in.'
  } else {
    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(json)}</pre>`
  }
})

elemLogout.addEventListener('click', async () => {
  elemSuccess.innerHTML = ''
  elemError.innerHTML = ''

  const response = await fetch(`${API_URL}/api/logout`, { method: 'POST', credentials: 'include' })

  if (response.ok) {
    elemSuccess.innerText = 'Signed out.'
  } else {
    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${await response.text()}</pre>`
  }
})

// Sign-in asks for nothing: the browser lists the passkeys it holds for this
// relying party and the chosen one names the account.
elemLogin.addEventListener('click', async () => {
  elemSuccess.innerHTML = ''
  elemError.innerHTML = ''

  const optionsResponse = await fetch(`${API_URL}/api/webauthn/login-options`, {
    method: 'POST',
  })

  const optionsResponseJSON = await optionsResponse.json()
  if (!optionsResponse.ok) {
    elemError.innerHTML = `Could not start sign-in: <pre>${JSON.stringify(optionsResponseJSON)}</pre>`
    return
  }
  const optionsJSON = optionsResponseJSON.rcr.publicKey
  const loginId = optionsResponseJSON.loginId

  let asseResp
  try {
    asseResp = await startAuthentication({ optionsJSON })
  } catch (error) {
    console.error(error)
    elemError.innerText = error instanceof Error ? error.message : String(error)
    throw error
  }

  // A finished login sets the session cookie; the browser only keeps it
  // from a cross-origin response when credentials are included.
  const verificationResp = await fetch(`${API_URL}/api/webauthn/verify-login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      response: asseResp,
      loginId,
    }),
  })

  const verificationJSON = await verificationResp.json()

  if (verificationJSON?.accountId) {
    elemSuccess.innerHTML = `Signed in! Account: ${verificationJSON.accountId}`
  } else if (verificationJSON?.error?.code === 'invalid_credential') {
    elemError.innerText = 'This passkey is not registered here, or the sign-in could not be verified. Register first.'
  } else {
    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(verificationJSON)}</pre>`
  }
})

elemRegister.addEventListener('click', async () => {
  elemSuccess.innerHTML = ''
  elemError.innerHTML = ''

  const optionsResponse = await fetch(`${API_URL}/api/webauthn/register-options`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayName: elemDisplayName.value }),
  })

  const optionsResponseJSON = await optionsResponse.json()
  if (!optionsResponse.ok) {
    elemError.innerHTML = `Could not start registration: <pre>${JSON.stringify(optionsResponseJSON)}</pre>`
    return
  }
  const optionsJSON = optionsResponseJSON.ccr.publicKey
  const registrationId = optionsResponseJSON.registrationId

  let attResp
  try {
    attResp = await startRegistration({
      optionsJSON,
    })
  } catch (error) {
    console.error(error)
    const errorName = error instanceof Error ? error.name : undefined
    if (errorName === 'InvalidStateError') {
      elemError.innerText = 'Error: Authenticator was probably already registered by user'
    } else if (errorName === 'NotSupportedError') {
      elemError.innerText = 'This authenticator cannot create a passkey for sign-in without a username. Try a password manager or another security key.'
    } else {
      elemError.innerText = error instanceof Error ? error.message : String(error)
    }

    throw error
  }

  // POST the response to the endpoint that calls
  // @simplewebauthn/server -> verifyRegistrationResponse()
  // A finished registration sets the session cookie; the browser only keeps
  // it from a cross-origin response when credentials are included.
  const verificationResp = await fetch(`${API_URL}/api/webauthn/verify-registration`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      response: attResp,
      registrationId,
    }),
  })

  // Wait for the results of verification
  const verificationJSON = await verificationResp.json()

  // A finished registration answers with the account it created.
  if (verificationJSON?.accountId) {
    elemSuccess.innerHTML = `Success! Account: ${verificationJSON.accountId}`
  } else if (verificationJSON?.error?.code === 'discoverable_credential_required') {
    elemError.innerText = 'This passkey cannot identify your account automatically. Register again with a password manager or a compatible security key.'
  } else {
    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(verificationJSON)}</pre>`
  }
})
