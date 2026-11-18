# Code

How code is written in every package of this repository. A package's own `AGENTS.md` may add rules on top; it never
relaxes these.

## Language

Code comments, agent docs (`AGENTS.md`, `docs/`) and commit messages are English.

## Scope of a change

A change does what its task asks and nothing more. Copy, domain rules, existing UI elements and interaction semantics
outside the task stay as they are, and code it does not need to touch is not refactored on the way. A behaviour
change the task needs but does not name is stated in the pull request description with its reason, so a reviewer
never finds it in the diff first.

## Prefer what exists

Before adding a layer, use the mechanism that already does the job: the framework's own lifecycle (a Storybook
`beforeEach`, a plain Playwright test), an existing enum, prop, component or helper. A new generic layer (a factory, a
generic helper, a wrapper component that only forwards props, a protocol, a custom runner) needs more than one caller
and a reason the existing mechanism does not fit; a component extracted so that it owns a piece of behaviour is not
such a layer. Parameters, flags, branches and exports that no caller uses are removed.

## Code comments

Code documents itself through names, types and structure. Write a comment only when both hold:

- the code is not self-documenting: a reader cannot tell what it does from the names and the types alone;
- the code is unexpected: it does something a reader would not predict, and the reason is not visible in the code
  (a workaround for a library bug, an ordering that matters, a constraint that comes from outside the module).

A comment says why, never what. A comment that repeats what the code already says is deleted, or the code is renamed
until the comment is not needed.
