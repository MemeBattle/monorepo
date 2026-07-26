# Updating Node.js

The monorepo pins one Node.js version. It is declared in four places that must always agree:

| File                   | What it pins                  | Who reads it                                               |
| ---------------------- | ----------------------------- | ---------------------------------------------------------- |
| `.npmrc`               | `use-node-version=<x.y.z>`    | pnpm — downloads and uses this exact version locally       |
| `package.json`         | `engines.node` (`>=<x.y>`)    | pnpm (`engine-strict=true`) and `actions/setup-node` in CI |
| `.docker/*_Dockerfile` | `FROM node:<x.y>-trixie-slim` | production images                                          |
| `pnpm-workspace.yaml`  | `catalog['@types/node']`      | every workspace package, through `catalog:`                |

CI does not pin a version of its own: `.github/actions/prepare-nodejs` uses
`node-version-file: 'package.json'`, so bumping `engines.node` moves every workflow.

`@types/node` follows the Node.js **major** but has its own minor/patch cadence — the two
versions are never expected to match exactly (Node.js 24.18.0 ships with `@types/node` 24.13.3).

## Automated update

```sh
pnpm node:update                     # latest LTS of the current major
pnpm node:update --version 24.18.0   # an exact release
pnpm node:update --latest-lts        # allow moving to a newer major, once it is LTS
pnpm node:update --no-types          # leave @types/node alone
pnpm node:update:check               # report only, exits 1 when a newer release exists
```

The script reads the release list from https://nodejs.org/dist/index.json and the npm registry,
then rewrites all four sources of truth at once. It never picks a non-LTS release on its own —
pass `--version` explicitly if you need a Current-line build.

Because the catalog changed, refresh the lockfile afterwards:

```sh
pnpm install --no-frozen-lockfile
```

## The scheduled workflow

[`Node.js update`](../../.github/workflows/nodejs-update.yml) runs the same script every Monday,
refreshes the lockfile, opens a PR and turns on auto-merge. It can also be triggered by hand from
the Actions tab with an explicit `version`, with `latest_lts`, or with `auto_merge` disabled.

### Why the PR needs `AUTOMATION_TOKEN`

GitHub deliberately does not emit events for actions performed with the default `GITHUB_TOKEN`:

> When you use the repository's `GITHUB_TOKEN` to perform tasks, events triggered by the
> `GITHUB_TOKEN` will not create a new workflow run. This prevents you from accidentally
> creating recursive workflow runs.

So a PR opened with `GITHUB_TOKEN` produces **no `pull_request` event** — `ligretto-pr`,
`blog-pr`, `gamehub-pr`, `storybook-pr` and `fmt-lint-check-pr` never start, their required
checks stay pending forever, and auto-merge never fires.

The fix is to open the PR as a real identity. Create a fine-grained PAT (or a GitHub App token)
with **Contents: read & write** and **Pull requests: read & write** on this repository, save it as
the `AUTOMATION_TOKEN` secret, and the workflow picks it up automatically:

```yaml
token: ${{ secrets.AUTOMATION_TOKEN || secrets.GITHUB_TOKEN }}
```

Without the secret the workflow still opens the PR, but logs a warning — you then have to close
and reopen it manually to get the checks running.

### What auto-merge needs

`gh pr merge --squash --auto` only queues the merge; GitHub performs it once the branch is
mergeable. For that to be safe the repository must have:

1. **Settings → General → Pull Requests → Allow auto-merge** enabled.
2. A branch protection rule (or ruleset) on `master` with **required status checks**. Without at
   least one required check there is nothing to wait for, and the PR is merged immediately — or
   the API rejects the request outright.

Pick the jobs a Node bump actually affects as required checks: `fmt-lint-check-pr` (runs on every
PR), plus the `tests` / `typecheck` jobs of `ligretto-pr`, `blog-pr` and `gamehub-pr`. `cas-pr` is
Rust-only and its path filters do not match a Node bump, so it must **not** be required — a
required check that never runs blocks the merge forever.

## Manual update

If you would rather do it by hand, change the same four places:

1. `.npmrc` — `use-node-version=24.18.0` (full `x.y.z`)
2. `package.json` — `"node": ">=24.18"` (`x.y`, no patch)
3. every `.docker/*_Dockerfile` — `FROM node:24.18-trixie-slim`, in **both** the
   `dependencies` and the `runtime` stage
4. `pnpm-workspace.yaml` — `'@types/node': 24.13.3`, on the same major, then
   `pnpm install --no-frozen-lockfile`

Check that the Docker tag actually exists before committing:

```sh
docker manifest inspect node:24.18-trixie-slim > /dev/null && echo ok
```

## Checklist after the bump

- [ ] `pnpm install` succeeds — with `engine-strict=true` a mismatch fails loudly here
- [ ] `pnpm exec node --version` matches `.npmrc` (pnpm downloads it on first run; users who run
      `node` directly through `nvm`/`fnm` have to switch by hand, the repo has no `.nvmrc`)
- [ ] `pnpm ts-check` and `pnpm test:ci` pass
- [ ] `pnpm-lock.yaml` is committed together with the catalog change
- [ ] the images build: `docker build -f .docker/Ligretto-core-backend_Dockerfile .`

## Which version to pick

Stay on the **Active LTS** line for anything that ships to production. A major bump is only
safe once that line has actually entered LTS (October of its release year) — the script's
default (`latest LTS of the current major`) keeps you there automatically.

Release schedule: https://github.com/nodejs/release#release-schedule
