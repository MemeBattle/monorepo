import type { LeaderboardWindow, LeadersRepository } from '../../core/ports/leaders-repository.ts'
import type { Database } from './database.ts'

/** Each player's points in the window: their all-time total, or the sum of their daily rows in it. */
const pointsIn = (db: Database, window: LeaderboardWindow) =>
  window === 'all'
    ? db.selectFrom('user_totals').select(['user_id', 'points'])
    : db
        .selectFrom('user_daily_points')
        .where(eb => eb.and([eb('day', '>=', eb.cast<Date>(eb.val(window.from), 'date')), eb('day', '<=', eb.cast<Date>(eb.val(window.to), 'date'))]))
        .select(eb => ['user_id', eb.fn.sum<string>('points').as('points')])
        .groupBy('user_id')

export const createPgLeadersRepository = (db: Database): LeadersRepository => ({
  rank: async ({ window, limit, viewer }) => {
    const rows = await db
      .with('points', () => pointsIn(db, window))
      .with('ranked', qc =>
        qc
          .selectFrom('points')
          .innerJoin('users', 'users.cas_id', 'points.user_id')
          .where('users.account_type', '=', 'full')
          .select(eb => [
            'users.cas_id',
            'users.display_name',
            'users.avatar_url',
            'points.points',
            eb.fn
              .agg<number | string>('rank')
              .over(ob => ob.orderBy('points.points', 'desc'))
              .as('place'),
            eb.fn
              .agg<number | string>('row_number')
              .over(ob =>
                ob
                  .orderBy('points.points', 'desc')
                  // Folded first: the database's collation may be byte order, which puts every capital before `a`.
                  .orderBy(eb.fn<string | null>('lower', ['users.display_name']), o => o.asc().nullsLast())
                  .orderBy('users.display_name', 'asc')
                  .orderBy('users.cas_id', 'asc'),
              )
              .as('position'),
          ]),
      )
      .selectFrom('ranked')
      .selectAll()
      .where(eb => eb.or([eb('position', '<=', limit), eb('cas_id', '=', viewer)]))
      .orderBy('position')
      .execute()

    // `bigint` and `numeric` are strings from pg and numbers or strings from PGlite.
    const ranked = rows.map(row => ({
      leader: { sub: row.cas_id, displayName: row.display_name, avatarUrl: row.avatar_url, points: Number(row.points), place: Number(row.place) },
      position: Number(row.position),
    }))
    return {
      top: ranked.filter(row => row.position <= limit).map(row => row.leader),
      viewer: ranked.find(row => row.leader.sub === viewer)?.leader,
    }
  },
})
