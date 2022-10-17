<div align="center">
  <h1 align="center">Welcome to MemeBattle!</h1>
  <img align="center" src="./docs/assets/memebattle-logo.svg" height="96" />
</div>

## What is MemeBattle?
**MemeBattle** - open community

## Applications
### Ligretto
URL: https://ligretto.app

UI-kit: https://ui.ligretto.app/

GitHub project: https://github.com/orgs/MemeBattle/projects/1

[Ligretto documentation](./docs/ligretto.md)

### GameHub

URL: https://mems.fun

## First steps
1. Read [documentation](./docs)
2. Read [CONTRIBUTING.md](CONTRIBUTING.md) TODO: Create contribution doc [#215](https://github.com/MemeBattle/monorepo/issues/215)
3. Download repository `git clone git@github.com:MemeBattle/monorepo.git`
4. Generate token 'https://github.com/settings/tokens' and enable read:packages
5. Set npm scope for `@memebattle/*` packages `yarn config set -H npmScopes.memebattle.npmRegistryServer "https://npm.pkg.github.com"`
6. Set your token (from step 4) for **memebattle** scope `yarn config set -H npmScopes.memebattle.npmAuthToken "TOKEN"`
7. Install dependencies `yarn`
