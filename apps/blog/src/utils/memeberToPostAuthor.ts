import type { Memeber } from 'contentlayer/generated'
import type { Person } from 'schema-dts'

export function memeberToPostAuthor(memeber: Memeber): Person {
  return {
    '@type': 'Person',
    name: memeber.fullName,
    jobTitle: memeber.title,
  }
}
