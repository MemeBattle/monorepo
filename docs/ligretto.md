# Ligretto

## Start all

1. Start postgresql `docker-compose up`
2. Start CAS and register the `ligretto` client, as `apps/cas/README.md` describes: the sign-in of
   ligretto-core-backend and the token checks of the gameplay backend need it
3. Migrate ligretto-core-backend database `pnpm ligretto:core-backend:migrate`
4. Start `pnpm ligretto:start`

## Start Ligretto frontend only

The frontend needs a local core backend: production allows no CORS origin, so `LIGRETTO_CORE_URL` keeps its
`.env.development` default.

1. Create `.env.development.local` in the root directory
2. Set next variable:

```
LIGRETTO_GAMEPLAY_URL=https://api.ligretto.app
```

3. Run frontend locally

```
pnpm ligretto:front:start:dev
```
