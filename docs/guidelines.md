# Guidelines

These rules apply to every package in this repository. A package's own `AGENTS.md` may add rules on top; it never
relaxes these.

## Language

Code comments, agent docs (`AGENTS.md`, `docs/`) and commit messages are English.

## Code comments

Code documents itself through names, types and structure. Write a comment only when both hold:

- the code is not self-documenting: a reader cannot tell what it does from the names and the types alone;
- the code is unexpected: it does something a reader would not predict, and the reason is not visible in the code
  (a workaround for a library bug, an ordering that matters, a constraint that comes from outside the module).

A comment says why, never what. A comment that repeats what the code already says is deleted, or the code is renamed
until the comment is not needed.

## Unit tests

Unit tests cover behaviour: code that computes, decides or transforms.

- No unit tests for declarative code: component markup, route tables, schema and type declarations, dependency
  wiring, lists of constants. Such a test restates the declaration and fails only when the declaration is changed on
  purpose.
- No tests for configuration: build, lint, formatting, tooling, deployment and environment config.
