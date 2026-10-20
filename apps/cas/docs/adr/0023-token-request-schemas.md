# 23. The token request described, one schema per grant

## Status

Accepted (2026-10-20), with [#819](https://github.com/MemeBattle/monorepo/issues/819).
Amends ADR 0016 (h): the request body of `/oidc/token` is described by typed
schemas rather than in prose. (h) continues to hold for `/oidc/authorize`
and `/oidc/end_session`, and for how every one of these endpoints reads its
parameters. Nothing on the wire and nothing stored changes; no migration, no
new stable error code.

## Context

ADR 0016 (h) described the parameters of the three hand-read endpoints in
prose with the ADRs. For `/oidc/token` that meant
`request_body(content = String, …)`: the committed `openapi.json` said the
`application/x-www-form-urlencoded` body was a bare string, and the
operation's description listed the parameters in a paragraph.

`packages/ligretto-auth` now generates its client from that document
(#807). It gets typed responses and typed error codes, and an untyped
request: `TokenBody = string`. Every caller builds the form by hand and
nothing checks that it built the right one for its grant — the one part of
the token endpoint a client can get wrong without a round trip.

What was open:

- Whether a form body can be described at all without the schema becoming a
  second parser next to the hand reader.
- How three grants with different parameters become one request body.
- How an optional form parameter is described, given that a form has no
  `null`.
- What holds the description to the reader, with no equivalent of the
  response check layer (ADR 0016 (f)) on the request side.

## Decision

**(a) One schema per grant, in the transport.** `AuthorizationCodeGrant`
(`code`, `redirect_uri`, `code_verifier`), `RefreshTokenGrant`
(`refresh_token`, optional `scope`) and `GuestGrant` (optional `scope`),
each with a required `grant_type` whose schema is the one literal that
chooses it: `authorization_code`, `refresh_token`,
`urn:memebattle:oauth:grant-type:guest`. They live in
`src/oidc/http/token.rs` next to `TokenResponse`, because a description of
the wire is the transport's (`docs/LAYOUT.md` rule 4, ADR 0016 (k)), and
their Rust names are the component names a generated client sees.

**(b) The body is their `oneOf`, discriminated by `grant_type`.** An
untagged enum over the three carries an OpenAPI `discriminator` with
`propertyName: grant_type` and an explicit mapping, and the operation
inlines that `oneOf` as its request body: the three schemas are the only
named components, with no wrapper type between them and the body. The
single-value `grant_type` literals discriminate a generated union on their
own; the `discriminator` object says the same thing to a generator that
reads it.

**(c) The schemas describe, they never parse.** `src/oidc/token_request.rs`
stays the only reader of the form. Its rules are not a schema: a parameter
sent twice is refused before any other rule is looked at (RFC 6749 §3.2), a
value is form-decoded strictly, and the rules are applied in an order that
decides which refusal a request gets. A schema-driven extractor would
answer some of those requests differently, and the answers are fixed by the
RFC and by ADR 0011. The price is that nothing in the type system ties the
description to the reader; a unit test in `token.rs` asserts the document's
`oneOf`, its discriminator, and per grant schema the required list, the
`grant_type` literal and the described parameters against the grant's read
set, so the two cannot drift silently. A reader changed without the
description shows up as an `openapi.json` diff in the same pull request
(ADR 0016 (g)).

**(d) `client_secret_post` is part of every grant schema.** `client_id` and
`client_secret` are optional on all three, described as the alternative to
the `Authorization: Basic` header — exclusive with it, since offering a
secret both ways is two authentication methods at once, which RFC 6749 §2.3
forbids — with `client_id` alone for a public client. They are not a fourth
schema: they are orthogonal to the grant, and a client authenticating
through the header simply omits them.

**(e) An optional form parameter is optional, not nullable.**
`#[schema(nullable = false)]` on every `Option` field, as `UserInfoClaims`
already does for optional wire values (ADR 0016 (k)). A form carries no
`null`: an omitted `scope` is absent, and the reader takes a plain string
when it is there. Without the attribute the description would admit
`string | null` and a generated client would offer a value CAS has no
reading for.

**(f) The other two hand-read endpoints keep their prose.**
`/oidc/authorize` and `/oidc/end_session` are navigations whose parameters a
browser carries in a query string and which answer with redirects and
pages; `POST /oidc/end_session` keeps its `string` body. No generated client
builds those requests, so ADR 0016 (h) still holds for them. Should one
ever need them typed, this record is the pattern.

## Consequences

- `apps/cas/openapi.json` gains three component schemas and describes the
  token request body as their `oneOf`. Regenerated as ADR 0016 (g)
  prescribes.
- `packages/ligretto-auth` generates a request type per grant, so its
  confidential client passes a typed grant object instead of a
  `URLSearchParams`, and its transport encodes an object with the declared
  form content type as a form. The bytes on the wire are the same, which the
  package's exact body assertions keep proving.
- The grant schemas are description-only types: nothing constructs one, so
  they carry a `dead_code` allow. Deriving `Serialize` or `Deserialize` to
  silence the lint would claim they are read on the wire, which is what (c)
  says they are not.
- Changing which parameters a grant is read for now means changing the
  schema next to the reader, or the test in `token.rs` fails.
- A fourth grant is a fourth schema, a variant and a mapping entry, and one
  row in that test's table.
