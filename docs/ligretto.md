# Ligretto

## Start all

1. Start postgresql `docker-compose up`
2. Migrate ligretto-core-backend database `yarn ligretto:core-backend:migrate`
3. Start `yarn ligretto:start`

## Start Ligretto frontend only

1. Create `.env.development.local` in the root directory
2. Set next variables:
```
LIGRETTO_CORE_URL=https://core.ligretto.app/api
LIGRETTO_GAMEPLAY_URL=https://api.ligretto.app
```
3. Run frontend locally
```
yarn ligretto:front:start:dev
```
