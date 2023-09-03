import { LeaderListTable } from 'components/blocks/home/LeaderList'

const leaderProps = (await (await fetch('https://dummyjson.com/users')).json()).users
  .slice(0, 4)
  .map(({ id, firstName, lastName, image }: Record<string, string>, i: number) => ({
    id,
    username: `${firstName} ${lastName}`,
    avatar: image,
    totalPoints: 2050 - 50 * (i + 1),
  }))

leaderProps[3].userPlace = 15

export const LeaderListContainer = () => <LeaderListTable leaders={leaderProps} />
