/** The time zone of the leaderboard's days (docs/adrs/leaderboard-points-aggregated-on-write.md). */
const LEADERBOARD_TIME_ZONE = 'Europe/Berlin'

const berlinDate = new Intl.DateTimeFormat('en-CA', { timeZone: LEADERBOARD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

const formatDay = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/** The `Europe/Berlin` calendar date of an instant, as `YYYY-MM-DD`. */
export const leaderboardDay = (epochMs: number): string => {
  const parts = berlinDate.formatToParts(epochMs)
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find(candidate => candidate.type === type)?.value)
  return formatDay(part('year'), part('month'), part('day'))
}

/** The calendar date `n` days before `day`, both `YYYY-MM-DD`. */
export const daysBefore = (day: string, n: number): string => {
  const [year, month, date] = day.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, date - n))
  return formatDay(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}
