---
title: Leaderboard points aggregated on write
description: >-
  Leaderboard points are summed into user_daily_points (per player and Europe/Berlin day) and user_totals (per player,
  all time) by the transaction that inserts a round, never computed from round_users per request. A day is the
  Europe/Berlin date of the round's own rounds.created_at.
read_when:
  - changing how rounds are saved, corrected or deleted
  - reading or ranking leaderboard points
  - changing the leaderboard time zone or periods
  - adding another per-player statistic
---

# Leaderboard points aggregated on write

## Context

The leaderboard ([#356](https://github.com/MemeBattle/monorepo/issues/356)) ranks full players by the points they
scored over a period: the current day, the last thirty days, or all time. Every score is already a `round_users` row,
written by the save-round transaction when the gameplay backend records a round. A game has no finished state, so
every recorded round counts. The leaderboard has no cache and must always be current.

## Decision

- **Points are aggregated on write.** `user_daily_points (user_id, day)` and `user_totals (user_id)` are updated in
  the save-round transaction, and only when the round was actually inserted, so a retried `roundId` adds nothing.
  The read ranks the aggregates; nothing sums `round_users` per request, and nothing caches the result. Summing
  `round_users` per request lost because it scans every round of the period on every read.
- **A day is the `Europe/Berlin` calendar date of the round's `rounds.created_at`.** That is the database's
  transaction time, which the round insert returns, so the bucket and the recorded round always agree and no second
  clock is read. The day is computed in core (`layering-and-runtime-neutrality.md`). The periods are windows of whole
  days: day is today, month is today and the 29 days before it, all is every recorded round.
- **The update is `INSERT … ON CONFLICT DO UPDATE SET points = points + excluded.points`,** with the rows sorted by
  `user_id` and the daily table written before the totals. Concurrent rounds with shared players lock rows in the
  same order, so they neither lose updates nor deadlock.
- **Names, avatars and `account_type` are not copied into the aggregates.** The read joins `users`, so guests are
  excluded at read time, and a rename or a guest-to-full upgrade shows at once.
- **Types.** `points` is `bigint`, a running sum of `integer` scores; `day` is a `date`. Neither table has timestamps:
  they are counters. The tables are described in `DESIGN.md` § Data.

## Consequences

- A read touches one row per active player for a day, up to thirty per player for a month and one per player for all
  time, however many rounds were played.
- Deleting or correcting a round must subtract its scores from both tables in the same transaction, or the
  leaderboard drifts from `round_users`.
- Changing the time zone means rebuilding `user_daily_points` from `round_users`; the totals are unaffected.
- Daily rows grow by one per active player per day. How long they are kept is a separate decision.
- There is no backfill from `round_users`: there was no production data. The tables shipped one release ahead of
  their writer (`additive-migrations-and-compatibility-matrix.md`), so rounds saved in between are not counted.
- Statements on the tables use the query builder like every other application statement
  (`database-access-with-kysely.md`).
