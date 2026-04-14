import type { Member } from '@/content/types'
import type { Person } from 'schema-dts'

export function memeberToPostAuthor(memeber: Member): Person {
  return {
    '@type': 'Person',
    name: memeber.fullName,
    jobTitle: memeber.title,
  }
}
