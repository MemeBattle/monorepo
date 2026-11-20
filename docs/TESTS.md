# Tests

What gets a test and how tests are written in every package of this repository. A package's own `AGENTS.md` may add
rules on top; it never relaxes these.

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
