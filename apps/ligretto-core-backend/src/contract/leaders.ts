import { z } from 'zod'

/** The most players one `GET /api/leaders` lists. */
export const LEADERS_LIMIT = 100

export const listLeadersQuerySchema = z.object({
  period: z.enum(['day', 'month', 'all']).meta({
    description:
      'The days whose points count, in Europe/Berlin: `day` is today, `month` is today and the 29 days before it, `all` is every recorded round',
  }),
})

const leaderSchema = z
  .object({
    sub: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    totalPoints: z.int(),
    place: z.int().min(1),
  })
  .meta({
    id: 'Leader',
    description: 'A full account ranked by its points in the period: tied points share a place (1, 2, 2, 4)',
  })

export const leaderboardSchema = z
  .object({
    leaders: z
      .array(leaderSchema)
      .max(LEADERS_LIMIT)
      .meta({
        description: `The first ${LEADERS_LIMIT} full accounts by points, then by name ascending ignoring case with the nameless last, then by sub; guests are not ranked`,
      }),
    // Not `.nullable()`: of a named schema it renders as `allOf` with the reference, which no `null` satisfies.
    me: z.union([leaderSchema, z.null()]),
  })
  .meta({
    id: 'Leaderboard',
    description:
      "The ranking of a period, and in `me` the caller's own row with its place wherever it ranks, also outside `leaders`: null for a guest or with no points in the period",
  })

export type Leaderboard = z.infer<typeof leaderboardSchema>
