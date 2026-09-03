import './style.css'

import { startRegistration } from '@simplewebauthn/browser'

const API_URL = 'http://localhost:3000'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>Passkey Client</h1>

    <input id="displayName" type="text" placeholder="Display name" value="Ada" />

    <button id="register">Start Registration</button>

    <br />

    <div id="success"></div>
    <div id="error"></div>
  </div>
`

const elemRegister = document.getElementById('register')
const elemDisplayName = document.getElementById('displayName') as HTMLInputElement | null
const elemSuccess = document.getElementById('success')
const elemError = document.getElementById('error')

if (!elemRegister || !elemDisplayName || !elemSuccess || !elemError) {
  throw new Error('Register form not found')
}

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
  const optionsJSON = optionsResponseJSON.ccr.publicKey
  const registrationId = optionsResponseJSON.registrationId

  let attResp
  try {
    attResp = await startRegistration({
      optionsJSON,
    })
  } catch (error) {
    console.error(error)
    if (error.name === 'InvalidStateError') {
      elemError.innerText = 'Error: Authenticator was probably already registered by user'
    } else {
      elemError.innerText = error
    }

    throw error
  }

  // POST the response to the endpoint that calls
  // @simplewebauthn/server -> verifyRegistrationResponse()
  const verificationResp = await fetch(`${API_URL}/api/webauthn/verify-registration`, {
    method: 'POST',
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
  } else {
    elemError.innerHTML = `Oh no, something went wrong! Response: <pre>${JSON.stringify(verificationJSON)}</pre>`
  }
})
