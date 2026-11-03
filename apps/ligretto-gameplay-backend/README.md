# ligretto-gameplay-backend

Serves the game sockets of Ligretto on `ligretto.app/gameplay/*`: `/gameplay/lobby` for the list of rooms,
`/gameplay/games/:id` inside a room.

## Development

`pnpm start:dev` runs `wrangler dev` on port 3005. Settings come from the root `.env.development` and
`.env.development.local`, then this package's `.env.development`; the shell wins over all of them, as it does for the
core backend. The core backend must be running for rooms to be created.

```
pnpm test             # the rules, under Node
pnpm test:worker      # the transport, under workerd
pnpm ts-check
```

## First activation

The release workflow checks the Worker exists before it touches anything, so merging early is safe. Before the first
release, once:

1. Create the Worker, because the release token's `Editor` role cannot: from this directory, `pnpm exec wrangler deploy`
   with an account login.
2. Set the secret, the value `ligretto-core-backend` accepts (`apps/ligretto-core-backend/README.md`):
   `pnpm exec wrangler secret put LIGRETTO_INTERNAL_API_TOKEN`.
3. Check that `wss://ligretto.app/gameplay/lobby` closes with code `4401` when no token is given.

The first release of this Worker should go out before the frontend that points at it, which is the order the workflow
deploys in. The previous Socket.IO deployment at `api.ligretto.app` can be turned off once no client of the old frontend
is left. Its running games do not move.

## What to check on the first deployment

Only the countdown before a round keeps the object awake. A round in which nobody moves for a few seconds can be lost
to hibernation: the room comes back with the same people, and the sockets still open are shown it at the next message
or sweep. Local tests confirm this, but only the deployed runtime shows how often it happens.

- A round left with no messages for a while either goes on, or its players see the room go back to before the round.
- The Worker reaches `core-internal.ligretto.app`, which is a Custom Domain on the same zone.

## Logs and rollback

Logs are in Workers Logs (`pnpm exec wrangler tail`). There are no Prometheus metrics any more. Roll back with
`pnpm exec wrangler rollback`; the storage is plain rooms and timers, and a version that reads it needs no migration.
