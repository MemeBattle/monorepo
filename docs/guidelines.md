# Guidelines

These rules apply to every package in this repository. A package's own `AGENTS.md` may add rules on top; it never
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

## Tests

Unit tests cover behaviour: code that computes, decides or transforms.

- No unit tests for declarative code: component markup, route tables, schema and type declarations, dependency
  wiring, lists of constants. Such a test restates the declaration and fails only when the declaration is changed on
  purpose.
- No tests for configuration: build, lint, formatting, tooling, deployment and environment config.
- A test renders the smallest module or component that contains the whole behaviour, not a parent above it: the
  parent's test restates the owner's and breaks when the parent's layout changes.
- No new test infrastructure (a fixture page, a custom runner) for a case the existing setup can express; a new pattern is a decision of its own, not a side effect of one fix.
- A change to existing tests (a refactor, a move to another mocking library) keeps every assertion at least as
  strict: an exact `toEqual` does not become `toMatchObject`, a `not.toHaveBeenCalled` is not dropped, a
  `toHaveBeenCalledTimes(1)` is not reduced to `toHaveBeenCalledWith`. A test that must assert something else is
  changed on purpose and said so in the pull request description.
