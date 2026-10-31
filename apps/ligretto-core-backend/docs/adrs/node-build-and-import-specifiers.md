---
title: Node build and import specifiers
description: >-
  Every relative import names its file with the `.ts` extension. The Node runtime runs JavaScript that
  `tsc -p tsconfig.build.json` emits (`nodenext`, `rewriteRelativeImportExtensions`, `rootDir: .`, `outDir: build`)
  on plain `node`; `ts-check` includes that program. An image of the Node entry runs `node <entry>`:
  `build/src/entry/node.js` by default, `migrate.js` and `sweep.js` from the same image. The repository builds no image.
read_when:
  - adding a file or an import to the package
  - adding a Node entry, or changing what the Node build compiles
  - packaging the Node entry as an image, or running migrations or the sweep from it
  - adding a dependency the Node entries load at run time
---

# Node build and import specifiers

## Context

The Node entries (`src/entry/node.ts`, `migrate.ts`, `sweep.ts`) ran through `tsx`, a devDependency, in
development and in CI. An image of them has to run them where `pnpm deploy --prod` leaves devDependencies out and a
compile at every start is a cost for nothing ([#842](https://github.com/MemeBattle/monorepo/issues/842)). The
package type-checks under `moduleResolution: bundler`, where extensionless relative imports are fine, but plain Node's ESM loader resolves a relative specifier only as
written. Kysely's `FileMigrationProvider` loads the migrations with `import()` from a folder that `migrate.ts` finds
relative to itself, so the migrations have to ship next to the entry in whatever form `node` can import. The Worker
is bundled by Wrangler and is not concerned (`layering-and-runtime-neutrality.md`).

## Decision

- **Relative imports carry `.ts`.** Every relative specifier names its file (`'./env.ts'`, `'../core/config.ts'`), a
  directory import names its `index.ts`. `allowImportingTsExtensions` is on in `tsconfig.json`, so every program that
  extends it accepts them; Wrangler, vitest and tsx resolve them as written. A project outside the package that
  type-checks its source, such as `packages/ligretto-core-client/tsconfig.tests.json` through the contract harness,
  turns the option on too.
- **The Node build program is `tsconfig.build.json`.** It extends `tsconfig.json` with `module` and
  `moduleResolution: nodenext`, `rewriteRelativeImportExtensions`, `rootDir: .` and `outDir: build`. It holds `src`
  without the specs, the Worker files and the development tools (`codegen.ts`, `openapi.ts`, whose imports are
  devDependencies), plus `migrations/`. Its output is ESM JavaScript with `.js` specifiers that runs on plain `node`.
  `pnpm build` runs it; `files: ["build"]` is what `pnpm deploy` ships.
- **`ts-check` includes the build program.** Under `nodenext` an extensionless relative import is TS2835, so a
  forgotten extension fails CI instead of failing at container start, and an import Node could not resolve fails
  the same way.
- **An image of the Node entry runs `node <entry>`.** `ENTRYPOINT ["node"]`, `CMD ["build/src/entry/node.js"]`; migrate
  and sweep run from the same image with `build/src/entry/migrate.js` or `build/src/entry/sweep.js` as the argument. `rootDir: .`
  puts the migrations in `build/migrations`, so `migrate.ts` finds them by the same relative path
  (`../../migrations`) in the source and in the build. Kysely records a migration under its name without the
  extension, so a database migrated by `tsx` in development and one migrated from the image agree on what is applied.
- **A path resolved from `import.meta.url` holds at both depths.** A module runs from `src/` and from `build/src/`,
  one level deeper. A path inside the tree, such as `../../migrations`, lands on its built twin; a path out of it,
  such as the `.env*` directories of `src/entry/env.ts`, goes through `packageDirOf`, which steps out of `build/`.
- Rejected:
  - Bundling the Node entries (esbuild or tsdown): a new build dependency and a second bundle beside the Worker's.
  - `tsx` at run time: a devDependency in production and a compile at every start.
  - CommonJS output: `env.ts` and `migrate.ts` use `import.meta.url`.

## Consequences

- Every new file follows the import rule; `AGENTS.md` lists it among the rules that are not negotiable.
- The entries are `build/src/entry/*.js`, not `build/entry/*.js`, because the migrations live outside `src`.
- The build type-checks `@memebattle/ligretto-auth` from source through its `types` condition and imports its
  CommonJS `build/` at run time, so that package is built before this one in the image.
- CI builds no image and runs no compiled entry (`DESIGN.md` § Deployment): `ts-check` is what keeps the build program
  compiling, and a run-time regression of the compiled output surfaces only when a runtime uses it again.

upd (2026-10-31): the repository builds no image any more; the Node build program and its rules stay for the Node
runtime ([#870](https://github.com/MemeBattle/monorepo/issues/870)).
