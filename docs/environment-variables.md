# Monorepo environment variables
In development uses one source of truth:
`.env` `.env.{NODE_ENV}` and `.env.{NODE_ENV}.local` files in root of repository

## Environment Variable Load Order
Inspired by https://nextjs.org/docs/basic-features/environment-variables#environment-variable-load-order

Environment variables are looked up in the following places, in order, stopping once the variable is found.

1. process.env
2. .env.$(NODE_ENV).local
3. .env.local
4. .env.$(NODE_ENV)
5. .env

For example, if NODE_ENV is development and you define a variable in both .env.development.local and .env, the value in .env.development.local will be used.

**Note: The allowed values for NODE_ENV are production, development and test.**

Also read more: https://github.com/kerimdzhanov/dotenv-flow#variables-overwritingpriority
