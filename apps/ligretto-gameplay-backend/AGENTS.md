# ligretto-gameplay-backend

The Ligretto game server: a Cloudflare Worker, one Lobby Durable Object and shared Room Durable Objects, speaking Redux
actions as JSON over native WebSockets. `README.md` has the operational notes.

Rules that are not negotiable in this package:

- `src/core` holds every game rule and knows nothing about what runs it: no `cloudflare:*`, no `WebSocket`, no
  Durable Object, no storage API. Lint and `tsconfig.json`, which compiles it against Node's types, enforce this.
- A game has three layers. `game.controller.ts` maps an action to a method, with no rule of its own. `Room` and its
  `Gameplay` hold the rules of the room and its rounds, and send every message themselves. They deal in users, and do not
  know that a user can hold several connections. They are synchronous and return nothing but the round to save:
  `RoomDO` reads the rest from the state before and after each call. Nothing keeps the object awake during a round
  after its countdown. `RoomDO` holds everything else.
- The lobby is `LobbyDO` alone: its few rules (a room needs a name, a failed create tells nobody, a list change is
  broadcast only when the store changed) sit next to the SQL store and the calls they guard. What a room shows the
  Lobby is `src/cloudflare/room/lobby-view.ts`, next to `RoomDO`, its only user.
- `src/cloudflare` holds no game rule. What exists because the object runs on Cloudflare or talks to the outside world is
  decided in the Durable Object: which host runs a room, which room on the object gets an event, how many connections a
  user holds, how a room comes back, when an empty room is deleted, and the calls
  to the Lobby and ligretto-core.
- A game rule is tested in `src/core` with the fakes in `*.fake.ts`. `test/worker` covers the transport and the lobby
  under workerd, with a few integration tests.
