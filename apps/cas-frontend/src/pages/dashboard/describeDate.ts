/** A calendar day in the local time zone, so that "today" is the user's today. */
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const DAY_MS = 24 * 60 * 60 * 1000

const withinYear = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' })
const anotherYear = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A date as the dashboard says it: "сегодня", "вчера", then "12 сентября"
 * within the current year and "12 сентября 2025 г." beyond it. Lower case on
 * purpose: it always follows a word ("Создан сегодня").
 */
export const describeDate = (iso: string, now = new Date()): string => {
  const date = new Date(iso)
  const daysAgo = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY_MS)
  if (daysAgo === 0) {
    return 'сегодня'
  }
  if (daysAgo === 1) {
    return 'вчера'
  }
  return (date.getFullYear() === now.getFullYear() ? withinYear : anotherYear).format(date)
}
