import { readdirSync } from 'fs'
import path from 'path'
import type { Member } from './types'

const MEMBERS_DIR = path.join(process.cwd(), 'content/memebers')

export async function getAllMembers(): Promise<Member[]> {
  const filenames = readdirSync(MEMBERS_DIR).filter(f => f.endsWith('.mdx'))

  return Promise.all(
    filenames.map(async filename => {
      const { member } = await import(`../../content/memebers/${filename}`)

      return {
        username: member.username,
        fullName: member.fullName,
        avatarFileName: member.avatarFileName,
        title: member.title,
      } satisfies Member
    }),
  )
}
