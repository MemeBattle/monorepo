# 16. The OpenAPI description

## Status

Accepted (2026-10-03), with [#752](https://github.com/MemeBattle/monorepo/issues/752).
Amends ADR 0005 (e) (the CSRF line's 403 is described on every operation it
guards) and the layout's transport rules (`docs/LAYOUT.md`, rules 1 and 4).

## Context

PLAN asks for a generated description of the API instead of a hand-written
catalogue. The frontend hand-writes its request and response types and maps
error codes per screen; the integration guide (#751) needs something to
point applications at; and a catalogue written beside the code drifts the
first time a handler changes and nobody remembers the document.

The owner set three requirements before the ticket was planned:

1. Every returned type is described, errors included — not only the
   success bodies, but each stable code a route can answer with.
2. As little description code as possible; as much as possible derived from
   the code that serves the requests.
3. The description is produced without a running server or a database, so
   that CI can diff it and, later, compare it with the frontend's types.

What was open:

- Which crate, and how a handler's responses reach the document.
- How a route's error codes are known at all, when every handler returned
  the type-erased `ApiError`.
- How the protocol endpoints, which answer in shapes of their own (RFC 6749
  JSON, RFC 6750 challenges, redirects, CAS's HTML page), are described.
- What the document says about a 500, given that no known condition may
  ever map to one.
- How the description is kept true, and where it lives.

## Decision

**(a) utoipa and utoipa-axum generate the description.** Handlers carry
`#[utoipa::path]`, request and response types derive `ToSchema`, and every
router is a `utoipa_axum::router::OpenApiRouter` whose routes are registered
through `routes!`, so the same call mounts a route and describes it. aide was
the alternative and lost on three counts: maturity against our axum-extra
version, no native `time` support, and silent failures where it matters:
path parameters left out, and two responses with the same status quietly
reduced to one.

**(b) Responses are read off the handler's return type.** With utoipa's
`auto_into_responses` an operation's responses are its return type's
`IntoResponses`, so handlers return the crate's own wrappers, each an
`IntoResponse` and an `IntoResponses` side by side: `Json<T>` (the
extractor, now also the response), `Created<T>`, `NoContent`,
`WithSessionCookie<R>` and `LoggedOut` in the sessions context, and
`Result` of these. A list of responses written on each handler was the
alternative; it is the drift this ticket exists to remove, one attribute at
a time.

**(c) A handler's error set is a type.** A handler fails with
`ApiErrors<Set>`, where `error_set!` declares the set: the domain errors its
body converts with `?` and the markers of its extractors. A `?` on an error
outside the set does not compile, and the set's codes are the handler's
error responses. No crate can infer the codes of a type-erased `ApiError`,
so the type has to say them; keeping `ApiError` and listing codes on the
attribute would have been (b)'s drift again.

**(d) One table per domain error.** `api_errors!` turns a table — variant,
status, code, optionally a fixed message — into both
`From<DomainError> for ApiError` and the list of `(status, code)` pairs the
error can produce; a delegating arm inherits the wrapped error's pairs, and
a table that misses a variant does not compile. Written twice, the mapping
and the list would drift exactly where no test reaches: a rare variant. The
database is a table too (`Failure`), and `From<sqlx::Error>` takes its
status, code and message from it, so no code string is written twice.
The tables stay next to the handlers they serve, as the layout requires.

**(e) Extractor rejections are named by markers.** `InvalidBody` (400, 413,
415, 422) and `InvalidPath` (400) for the crate's `Json` and `Path`, and
`Authenticated` for the session extractor (401 and the database codes),
appear in the sets of the handlers that take them. A rejection never passes
through the handler, so nothing can infer it from the body; what catches a
forgotten marker is (f).

**(f) The description is checked against real responses.** In tests a
layer wraps the router: for every response it finds the operation by method
and path template and fails the test when the status is not declared for
it, or when the response carries a code — every error family leaves its
code in the response's extensions, never on the wire — that the status does
not list. A request the document has no operation for may only be answered
404 or 405, or with the CSRF line's 403, so a route mounted outside
`routes!` cannot hide. `app()` carries the layer under `cfg(test)`, and
`testing::checked` gives every context's router the same check against its
own description, so the whole existing transport suite tests the
description on top of what it tested before. Two sweeps driven by the
document add the cases no suite would think of: every operation anonymous,
and every `/api` operation signed in with a path or a body that does not
parse. A layer rather than assertions in each test, because the point is
that nobody has to remember: a new test of a new route checks its
description whether its author thought of it or not.

**(g) The document is committed and compared.** `apps/cas/openapi.json` is
written by a test with `UPDATE_OPENAPI=1` and compared with what `GET
/openapi.json` serves otherwise, in the `cargo test` CI already runs. The
change to a route is reviewable in the same diff as the change to the
document; the frontend can generate types from the file without building
CAS; and no server, database or extra CI step is involved.

**(h) Protocol endpoints keep their hand-built responses.** `/authorize`,
`/token`, `/userinfo`, `/end_session` and `/health` answer with headers,
redirects, challenges and logging a table cannot express, in shapes the
RFCs fix. Their handlers keep building a `Response` and return it as
`Documented<D>`, where `D` describes it; each error family declares its
closed list of codes next to its mapping (`ErrorPage::DECLARED`,
`OAuthErrorResponse::DECLARED`, `BearerError::ALL`, `OAuthError::ALL` for
the codes a redirect carries). The parameters of `/authorize`, `/token`
and `/end_session` are read by hand under RFC rules (repeated parameters,
fixed read sets) and are described in prose with the ADRs, not as typed
schemas; WebAuthn payloads, types of `webauthn-rs` that CAS does not own,
are `object`.

**(i) Every error response lists its codes in `x-error-codes`**, whatever
its body: JSON, an HTML page, or a `302` whose `error` parameter carries
the code. That is the one place a client, a generator or the check in (f)
reads them. `ApiError` responses also carry the codes as the enum of
`error.code`, which is what generated client types need; both listings
come from one function, so they cannot disagree.

**(j) 500 is described, never declared.** No table arm and no set can name
500 (a table that tries does not compile): the rule that a known condition
never maps to 500 stands. The assembly adds the fallback to every
operation instead — `internal_error` in the `ApiError` shape, which the
panic catcher and `ApiError::internal` answer behind every route — merged
with a protocol endpoint's own fallback into one response that lists both
codes and describes both bodies (`server_error` for `/token` and
`/userinfo`, the `internal` page for `/authorize` and `/end_session`). The
description says what an unanticipated failure looks like on the wire
without pretending any handler plans for one.

**(k) A domain type already on the wire may derive `ToSchema`.**
`AccountType`, `Discovery`, `Jwks` and `UserInfoClaims` are serialized
as-is today; describing them where they are defined is the same exception
the layout makes for `sqlx::Type`: a derive, nothing written by hand, and
anything more belongs to the transport.

**(l) `GET /openapi.json` is public and unauthenticated.** It describes
nothing the discovery document and the source do not already say, and
applications integrating with CAS are its readers. It is served from the
document built once at startup.

## Consequences

- A new route is described by being mounted: `routes!` and a return type
  are all it takes, and the check in (f) fails its first test if its error
  set is incomplete. A new error variant does not compile until its table
  has an arm, and the committed document changes in the same diff.
- Changing the API means regenerating the document:
  `UPDATE_OPENAPI=1 cargo test --lib the_committed_document_is_current` in
  `apps/cas`, then committing `openapi.json`. CI fails otherwise.
- Handler signatures are longer: each names its error set. That is the
  price of (c), and the sets read as a summary of how a route can fail.
- The wire did not change. The token response is a struct now; its fields
  are in the order the JSON map used to put them in, so the bytes are the
  same.
- The frontend's hand-written types (`apps/cas-frontend/docs/CODE.md`) now
  have a source to follow, and generating them from the document is the
  follow-up; the integration guide (#751) links the document.
- The responses of `/authorize` and `/end_session` list every code their
  pages and redirects can carry, but a client of `/authorize` reads the
  redirect's `error` parameter, not a body: generated types help the
  frontend, not an OAuth client, which follows the RFCs.
