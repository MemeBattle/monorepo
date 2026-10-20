/**
 * A software WebAuthn authenticator with resident credentials: the TypeScript counterpart of
 * `apps/cas/src/testing/soft_passkey.rs`, which the Rust reference client drives CAS's ceremonies with.
 *
 * Written against WebCrypto rather than pulled from npm. What is needed of CBOR is four shapes — a map, a byte
 * string, a text string and a small integer — and of ASN.1 one DER-encoded signature; a dependency for that would be
 * a supply-chain decision (the repository's `minimumReleaseAge` policy) for less code than it saves.
 *
 * What CAS requires of it, read from CAS's own code rather than guessed:
 *
 * - **User verification.** `start_discoverable_registration` sets `UserVerificationPolicy::Required`, as does the
 *   login ceremony, so the `UV` flag is set in both directions.
 * - **A discoverable credential.** `verify_discoverable_registration` refuses an explicit `credProps.rk: false`, and
 *   a login challenge carries no `allowCredentials`, so the credential must be found by relying-party id alone:
 *   registration answers `credProps: { rk: true }` and an assertion carries the `userHandle` the credential was
 *   created with, which is what names the account to CAS.
 * - **`fmt: 'none'` attestation.** `start_passkey_registration` asks for no attestation, which is what the Chromium
 *   virtual authenticator the cas-frontend e2e suite already passes answers with.
 * - **`excludeCredentials`.** Honoured, as the Rust authenticator honours it: asked to create a credential on an
 *   authenticator that already holds an excluded one, this refuses rather than answering.
 *
 * One instance is one authenticator: the credentials it has created live on it, so a test signs in with the passkey
 * another step of the same test registered, and two instances never see each other's.
 */

import { base64url } from 'jose'

/** A byte string backed by an `ArrayBuffer` of its own, which is what WebCrypto's `digest` and `sign` take. */
type Bytes = Uint8Array<ArrayBuffer>

/** The one algorithm CAS publishes, as a COSE identifier and as the WebCrypto parameters for it. */
const COSE_ES256 = -7
const EC_P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ES256 = { name: 'ECDSA', hash: 'SHA-256' } as const

/** The bytes of a credential id this authenticator mints, and of a P-256 coordinate. */
const CREDENTIAL_ID_BYTES = 32
const COORDINATE_BYTES = 32

/**
 * The flags of the authenticator data (WebAuthn §6.1): user present, user verified, and — on a registration —
 * attested credential data included. Both ceremonies set `UV` because CAS requires it.
 */
const FLAGS_REGISTRATION = 0x45
const FLAGS_ASSERTION = 0x05

/** The AAGUID of an authenticator that identifies no model, which is what `fmt: 'none'` means (WebAuthn §6.5.1). */
const AAGUID = new Uint8Array(16)

/** The challenge of a ceremony, as CAS serves it: base64url, unpadded, and passed back into `clientDataJSON` verbatim. */
type Challenge = string

/** `PublicKeyCredentialCreationOptions` as CAS's `register-options` serialises it; only the members used are named. */
export interface CreationOptions {
  publicKey: {
    rp: { id: string; name: string }
    user: { id: string; name: string; displayName: string }
    challenge: Challenge
    excludeCredentials?: { type: string; id: string }[]
  }
}

/** `PublicKeyCredentialRequestOptions` as CAS's `login-options` serialises it; only the members used are named. */
export interface RequestOptions {
  publicKey: {
    rpId: string
    challenge: Challenge
    allowCredentials: { type: string; id: string }[]
  }
}

/** A `RegisterPublicKeyCredential` as webauthn-rs deserialises it. */
export interface RegistrationAnswer {
  id: string
  rawId: string
  type: 'public-key'
  response: { clientDataJSON: string; attestationObject: string }
  clientExtensionResults: { credProps: { rk: true } }
}

/** A `PublicKeyCredential` as webauthn-rs deserialises it. */
export interface AssertionAnswer {
  id: string
  rawId: string
  type: 'public-key'
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle: string }
  clientExtensionResults: Record<string, never>
}

interface ResidentCredential {
  rpId: string
  id: Bytes
  /** The account id CAS put in the challenge: an assertion carries it back, and it is what names the account. */
  userHandle: string
  privateKey: CryptoKey
}

const bytes = (value: string): Bytes => new TextEncoder().encode(value)

const sha256 = async (input: Bytes): Promise<Bytes> => new Uint8Array(await crypto.subtle.digest('SHA-256', input))

const concat = (...parts: Bytes[]): Bytes => {
  const total = parts.reduce((size, part) => size + part.length, 0)
  const joined = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    joined.set(part, at)
    at += part.length
  }
  return joined
}

/** A big-endian unsigned integer of `width` bytes. Division and modulo rather than shifts, which oxlint refuses. */
const bigEndian = (value: number, width: number): Bytes => {
  const encoded = new Uint8Array(width)
  let rest = value
  for (let at = width - 1; at >= 0; at -= 1) {
    encoded[at] = rest % 256
    rest = Math.floor(rest / 256)
  }
  return encoded
}

/**
 * A CBOR head: the major type and either the argument itself (under 24) or the bytes it takes. Only the four shapes
 * this file encodes are covered — maps, byte strings, text strings and the small integers of a COSE key — so the
 * 8-byte argument CBOR allows for is left out rather than written untested.
 */
const cborHead = (majorType: number, argument: number): Bytes => {
  const type = majorType * 32
  if (argument < 24) {
    return new Uint8Array([type + argument])
  }
  if (argument < 256) {
    return new Uint8Array([type + 24, argument])
  }
  if (argument < 65536) {
    return concat(new Uint8Array([type + 25]), bigEndian(argument, 2))
  }
  return concat(new Uint8Array([type + 26]), bigEndian(argument, 4))
}

const cborUnsigned = (value: number): Bytes => cborHead(0, value)
/** A negative integer is encoded as `-1 - n`, which is how the COSE labels `-1`, `-2`, `-3` and `alg: -7` are written. */
const cborNegative = (value: number): Bytes => cborHead(1, -1 - value)
const cborBytes = (value: Bytes): Bytes => concat(cborHead(2, value.length), value)
const cborText = (value: string): Bytes => {
  const encoded = bytes(value)
  return concat(cborHead(3, encoded.length), encoded)
}
const cborMap = (entries: [Bytes, Bytes][]): Bytes => concat(cborHead(5, entries.length), ...entries.flat())

/**
 * The credential's public key as a COSE_Key (RFC 8152 §13.1.1): `kty: EC2`, `alg: ES256`, `crv: P-256` and the two
 * coordinates, read off the JWK WebCrypto exports.
 */
const coseKeyOf = async (publicKey: CryptoKey): Promise<Bytes> => {
  const { x, y } = await crypto.subtle.exportKey('jwk', publicKey)
  if (x === undefined || y === undefined) {
    throw new Error('A P-256 public key exports as a JWK with both coordinates.')
  }
  const coordinate = (value: string): Bytes => {
    const decoded = new Uint8Array(base64url.decode(value))
    if (decoded.length !== COORDINATE_BYTES) {
      throw new Error(`A P-256 coordinate is ${COORDINATE_BYTES} bytes; got ${decoded.length}.`)
    }
    return decoded
  }
  return cborMap([
    [cborUnsigned(1), cborUnsigned(2)],
    [cborUnsigned(3), cborNegative(COSE_ES256)],
    [cborNegative(-1), cborUnsigned(1)],
    [cborNegative(-2), cborBytes(coordinate(x))],
    [cborNegative(-3), cborBytes(coordinate(y))],
  ])
}

/** A DER `INTEGER`: unsigned big-endian with its leading zeros dropped, and a zero byte back when the top bit is set. */
const derInteger = (value: Bytes): Bytes => {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) {
    start += 1
  }
  const trimmed = value.subarray(start)
  const body = trimmed[0] !== undefined && trimmed[0] >= 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed
  return concat(new Uint8Array([0x02, body.length]), body)
}

/**
 * WebCrypto signs ECDSA as the raw `r ‖ s` of JOSE; WebAuthn carries the DER `SEQUENCE { INTEGER r, INTEGER s }` an
 * authenticator produces, which is what webauthn-rs parses. The two halves are fixed-width, so the split is by size.
 */
const derSignature = (raw: Bytes): Bytes => {
  const r = derInteger(raw.subarray(0, COORDINATE_BYTES))
  const s = derInteger(raw.subarray(COORDINATE_BYTES))
  const body = concat(r, s)
  return concat(new Uint8Array([0x30, body.length]), body)
}

/** The client data of a ceremony, as the browser builds it (WebAuthn §5.8.1): the challenge verbatim, and the origin. */
const clientDataOf = (type: 'webauthn.create' | 'webauthn.get', challenge: Challenge, origin: string): Bytes =>
  bytes(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

/** The authenticator data of §6.1: the relying party's hash, the flags, the counter, and whatever follows. */
const authenticatorDataOf = async (rpId: string, flags: number, signCount: number, attested: Bytes = new Uint8Array()): Promise<Bytes> =>
  concat(await sha256(bytes(rpId)), new Uint8Array([flags]), bigEndian(signCount, 4), attested)

export interface SoftPasskey {
  /** The answer to a `register-options` challenge, with a credential created and kept. */
  register(options: CreationOptions, origin: string): Promise<RegistrationAnswer>
  /** The answer to a `login-options` challenge, from a credential this authenticator holds for the relying party. */
  assert(options: RequestOptions, origin: string): Promise<AssertionAnswer>
}

/** One authenticator: it mints real P-256 keys, signs with them, and remembers the credentials it created. */
export const createSoftPasskey = (): SoftPasskey => {
  const credentials: ResidentCredential[] = []

  const register = async (options: CreationOptions, origin: string): Promise<RegistrationAnswer> => {
    const { rp, user, challenge, excludeCredentials = [] } = options.publicKey
    const excluded = new Set(excludeCredentials.map(descriptor => descriptor.id))
    if (credentials.some(credential => credential.rpId === rp.id && excluded.has(base64url.encode(credential.id)))) {
      // What a CTAP2 authenticator answers: it already holds a credential the relying party excluded.
      throw new Error(`This authenticator already holds a credential ${rp.id} excluded.`)
    }

    const id = crypto.getRandomValues(new Uint8Array(CREDENTIAL_ID_BYTES))
    const { privateKey, publicKey } = await crypto.subtle.generateKey(EC_P256, true, ['sign', 'verify'])
    const attested = concat(AAGUID, bigEndian(id.length, 2), id, await coseKeyOf(publicKey))
    const authenticatorData = await authenticatorDataOf(rp.id, FLAGS_REGISTRATION, 0, attested)
    const attestationObject = cborMap([
      [cborText('fmt'), cborText('none')],
      [cborText('attStmt'), cborMap([])],
      [cborText('authData'), cborBytes(authenticatorData)],
    ])

    credentials.push({ rpId: rp.id, id, userHandle: user.id, privateKey })

    return {
      id: base64url.encode(id),
      rawId: base64url.encode(id),
      type: 'public-key',
      response: {
        clientDataJSON: base64url.encode(clientDataOf('webauthn.create', challenge, origin)),
        attestationObject: base64url.encode(attestationObject),
      },
      // Unsigned, and CAS treats it as nothing but the authenticator's report that the credential is discoverable.
      clientExtensionResults: { credProps: { rk: true } },
    }
  }

  const assert = async (options: RequestOptions, origin: string): Promise<AssertionAnswer> => {
    const { rpId, challenge, allowCredentials } = options.publicKey
    const allowed = new Set(allowCredentials.map(descriptor => descriptor.id))
    // An empty `allowCredentials` is a discoverable challenge: the authenticator picks a credential of its own.
    const credential = credentials.find(held => held.rpId === rpId && (allowed.size === 0 || allowed.has(base64url.encode(held.id))))
    if (credential === undefined) {
      throw new Error(`This authenticator holds no credential for ${rpId} that the challenge allows.`)
    }

    const clientDataJSON = clientDataOf('webauthn.get', challenge, origin)
    // The counter stays at zero: CAS's stored credential was registered at zero and webauthn-rs accepts a counter
    // that has not advanced, which is what an authenticator that does not count answers (ADR 0001).
    const authenticatorData = await authenticatorDataOf(rpId, FLAGS_ASSERTION, 0)
    const signed = concat(authenticatorData, await sha256(clientDataJSON))
    const raw = new Uint8Array(await crypto.subtle.sign(ES256, credential.privateKey, signed))

    return {
      id: base64url.encode(credential.id),
      rawId: base64url.encode(credential.id),
      type: 'public-key',
      response: {
        clientDataJSON: base64url.encode(clientDataJSON),
        authenticatorData: base64url.encode(authenticatorData),
        signature: base64url.encode(derSignature(raw)),
        // A discoverable assertion names the account through its handle; CAS refuses one without it.
        userHandle: credential.userHandle,
      },
      clientExtensionResults: {},
    }
  }

  return { register, assert }
}
