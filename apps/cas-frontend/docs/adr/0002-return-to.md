# 2. Following return_to after sign-in

## Status

Accepted (2026-10-04), with [#748](https://github.com/MemeBattle/monorepo/issues/748).

## Context

CAS answers an anonymous `GET /oidc/authorize` by sending the browser to
`/sign-in?return_to=<the /oidc/authorize path and query>`, or to
`/create-account?return_to=...` for a guest upgrade. apps/cas ADRs 0010 (c),
0015 (d) and 0017 (h) fix the backend half of that contract and leave the
other half to the frontend: after the ceremony the browser has to get back to
`return_to`, or the application's request is lost and the user lands on the
dashboard instead.

`return_to` arrives in the URL, so anyone can write a link to the sign-in
screen with a `return_to` of their choosing. A screen that sends the browser
wherever that parameter says, right after a successful passkey ceremony, is
an open redirect at the most trusted moment of the visit, and a phishing
primitive. What the frontend accepts, and how it leaves, is therefore a
security rule that later work (#749, the integration guide #751) relies on,
not an implementation detail of two screens.

## Decision

**(a) Only a same-origin path, as the browser itself would resolve it.** The
query must carry exactly one `return_to`, written as a path (a leading `/`),
that the WHATWG URL parser resolves to the page's own origin. The check uses
the parser the browser navigates with rather than string rules, because that
parser is what decides where the navigation goes: it treats `//host` and
`/\host` as another origin and strips a tab or newline before a second slash.
Its output is not a fixed point, though: `/.//host` resolves on this origin
but normalizes to `//host`, which leaves it when navigated to. So the
normalized path is judged again: it must not start with `//` and must resolve
to itself on this origin. The app navigates to that normalized path, never to
the raw string. An absolute URL is refused even when it names this origin:
CAS never sends one, and refusing it keeps the rule to "a path".

**(b) Anything else is dropped silently.** A `return_to` that fails the rule
is treated as absent: the screen is plain sign-in and ends on the dashboard.
There is no error state for it, because CAS never produces a broken
`return_to`, and an attacker's deserves no message.

**(c) No allow-list of paths.** The frontend does not accept "only
`/oidc/authorize`". CAS owns its paths and has moved them once already
(apps/cas ADR 0017); the frontend names none of them, so a move on the
backend needs no change here. Same-origin is the trust boundary: everything
served on this origin is CAS or this app.

**(d) Leaving is a document navigation that replaces the history entry.**
The target is served by CAS, not by the router, so the app leaves with
`location.replace`, through one helper used by the screens and by the gate.
Replacing matters: Back from the application must not reopen a finished
sign-in, which would forward a second authorization request with a `state`
the application has already spent. react-router's `redirectDocument` was
rejected for the gate because the router performs it with `location.assign`
(a pushed entry) unless the navigation was itself a replace. For the same
reason a link between sign-in and create-account replaces the entry while it
carries `return_to`, so the whole visit to CAS stays one entry; the price is
that Back on create-account leaves CAS instead of returning to sign-in, and
the screen's own link covers that. Because a document navigation is outside
the router's cancellation, the gate checks the loader's abort signal before
leaving, and the sign-in screen ignores an autofill offer that resolves after
it was withdrawn: neither may take the page away from a navigation the user
has already abandoned.

**(e) Both auth screens and their gate honour it.** A browser that is
already signed in and lands on sign-in or create-account with an accepted
`return_to` is forwarded at once, without a ceremony; the request then
completes on the session as apps/cas ADR 0010 describes. The links between
the two screens carry `return_to`, so a new user who arrives at sign-in still
finishes the request they came with after creating an account.

**(f) The URL is the only carrier.** Nothing goes into `sessionStorage`,
`localStorage` or a cookie. That matches the stateless redirect of apps/cas
ADR 0010 (c) and the rule that the app keeps nothing client-side, and it
means a reload or a shared link behaves exactly like the original visit.

**(g) The screen does not name the application.** The `client_id` inside
`return_to` is attacker-controlled text, so showing it, or anything derived
from it without asking CAS, would let a phishing link pick the name the user
reads. CAS has no endpoint that names a client to an anonymous browser, and
adding one is an enumeration surface that deserves its own decision. Until
then the screen reads the same with or without `return_to`.

## Consequences

- Any path CAS adds on this origin can be a `return_to` without a frontend
  change; equally, anything served on this origin is trusted as a
  destination, so the origin must stay limited to CAS and this app.
- A form action that leaves never settles: the button keeps its pending state
  until the browser has gone. If the user stops the navigation, the button
  stays pending until a reload.
- The e2e suite needs an OIDC client in the database it runs against
  (`e2e/seed.sh`), locally and in CI.
- Naming the application on the screen, if wanted later, starts with a CAS
  endpoint and revisits (g).
