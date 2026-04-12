import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { Member } from './types'

const MEMBERS_DIR = path.join(process.cwd(), 'content/memebers')

export function getAllMembers(): Member[] {
  const filenames = readdirSync(MEMBERS_DIR).filter(f => f.endsWith('.mdx'))

  return filenames.map(filename => {
    const fullPath = path.join(MEMBERS_DIR, filename)
    const fileContent = readFileSync(fullPath, 'utf8')
    const { data } = matter(fileContent)
    return {
      username: data.username,
      fullName: data.fullName,
      avatarFileName: data.avatarFileName,
      title: data.title,
    } satisfies Member
  })
}
