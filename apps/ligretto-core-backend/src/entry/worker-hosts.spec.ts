import { describe, expect, it } from 'vitest'

import { parseWorkerHosts } from './worker-hosts.ts'

const INTERNAL = 'core-internal.ligretto.app'
const parse = (publicHosts: string | undefined) =>
  parseWorkerHosts({ LIGRETTO_CORE_PUBLIC_HOSTS: publicHosts, LIGRETTO_CORE_INTERNAL_HOST: INTERNAL })

describe('the Worker hosts', () => {
  it('reads the public hosts as a comma-separated list', () => {
    const hosts = parse('ligretto.app, tg.ligretto.app')
    expect([...hosts.publicHosts]).toEqual(['ligretto.app', 'tg.ligretto.app'])
    expect(hosts.internalHost).toBe(INTERNAL)
  })

  it.each([undefined, '', ' , '])('refuses an empty list: %j', value => {
    expect(() => parse(value)).toThrow()
  })

  it.each(['https://ligretto.app', 'ligretto.app:443', 'ligretto.app/api', 'Ligretto.app', 'ligretto.app.'])(
    'refuses %s, which is not a bare lowercase hostname',
    value => {
      expect(() => parse(`tg.ligretto.app,${value}`)).toThrow(/bare lowercase hostname/)
    },
  )

  it('refuses a host listed twice', () => {
    expect(() => parse('ligretto.app,tg.ligretto.app,ligretto.app')).toThrow(/listed twice/)
  })

  it('refuses the internal host among the public ones', () => {
    expect(() => parse(`ligretto.app,${INTERNAL}`)).toThrow(/internal host/)
  })
})
