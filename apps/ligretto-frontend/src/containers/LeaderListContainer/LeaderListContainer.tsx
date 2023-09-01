import { LeaderListTable } from 'components/blocks/home/LeaderList'

const leaderProps = (await (await fetch('https://dummyjson.com/users')).json()).users
  .slice(0, 4)
  .map(({ id, username, image }, i) => ({ id, username, avatar: image, totalPoints: 2050 - 50 * (i + 1) }))

leaderProps[3] = { ...leaderProps[3], userPlace: 15 }

export const LeaderListContainer = () => <LeaderListTable leaders={leaderProps} />
