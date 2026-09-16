# Passkeys in the browser

How the sign-in screen talks to the authenticator. The wire protocol is
CAS's business (`apps/cas/docs/adr`); this is about what the browser does
with it, and what the app has to do in return.

## Two ways in, one ceremony at a time

- **The button** runs a modal ceremony: `startAuthentication()` opens the
  browser's passkey prompt over the page.
- **Autofill** (conditional mediation) starts on mount:
  `startAuthentication({ useBrowserAutofill: true })` stays pending, with no
  prompt, until the user picks a passkey from the browser's autofill list
  under the "Пасскей" field. The field carries
  `autocomplete="username webauthn"`; that is what the browser anchors the
  list to, and nobody types into it. Browsers without
  `PublicKeyCredential.isConditionalMediationAvailable()` get nothing
  offered and keep the button.

A browser runs one WebAuthn request at a time: a second `get()` while the
first is pending fails. `@simplewebauthn/browser` aborts the previous
ceremony whenever a new one starts, and the page does not rely on that
alone: the button aborts the autofill offer's `AbortSignal` before it starts
its own ceremony, and leaving the screen aborts it too
(`SignInPage.tsx`). An aborted offer resolves to `null` and is not an error.

Nor is a `NotAllowedError` from the offer: it is the user backing out of the
prompt after a pick, but also a browser refusing conditional requests
outright (a policy, a sandboxed pane), and the two cannot be told apart. The
offer ends quietly, the button stays. Only a failure after a pick that the
server saw (`invalid_credential`, an outage) is shown, as it is for the
button.

## The challenge outlives nothing

CAS issues a challenge with the webauthn-rs default timeout (60 s) and keeps
the row a little longer. The modal ceremony fits inside that; the autofill
offer does not: it may stand for minutes, and browsers ignore `timeout`
under conditional mediation. A pick against an expired challenge would fail
as `login_not_found`. So `signInWithPasskeyFromAutofill` replaces its
challenge at three quarters of the timeout for as long as the offer stands
(`ceremonies.ts`). The browser sees the old request aborted and a new one
started; the autofill list is rebuilt from it.

## What each browser does

From the vendors' documentation; a hand check on real devices is still to
be done, and this table should be corrected from it.

| Browser                        | Autofill offer                                                                                                                         | Notes                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Chrome 108+ (desktop, Android) | Passkeys appear in the autofill dropdown when the field is focused; a pick opens the platform prompt (Touch ID, Windows Hello, phone). | Ignores `timeout` for conditional requests. Starting the modal ceremony while the offer stands closes the dropdown.    |
| Safari 16+ (macOS, iOS)        | Passkeys from iCloud Keychain appear in the QuickType bar (iOS) or the autofill popup (macOS).                                         | A second request while one is pending is refused with `NotAllowedError`, hence the abort before the button's ceremony. |
| Firefox 119+                   | `isConditionalMediationAvailable()` reports support where the platform authenticator does; the list shows in the autofill dropdown.    | Behaviour depends on the OS authenticator; to be checked.                                                              |
