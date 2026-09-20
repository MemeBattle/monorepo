import { HttpResponse } from 'msw'
import type { Method, ParsedRequest } from './mockRequest'
import { mockRequest } from './mockRequest'
import type { Spy } from './runtime'

export type Failure<Code extends string> = { error: Code } | { networkError: true }
export type Answer<Payload, Code extends string> = Payload | Failure<Code>
export type Resolver<Args, Payload, Code extends string> = (args: Args) => Answer<Payload, Code> | Promise<Answer<Payload, Code>>
export const isFailure = <Code extends string>(value: unknown): value is Failure<Code> =>
  typeof value === 'object' && value !== null && ('error' in value || 'networkError' in value)

export const failureResponse = <Code extends string>(failure: Failure<Code>, statuses: Record<Code, number>) => {
  if ('networkError' in failure) {
    return HttpResponse.error()
  }
  // CAS names an expired registration registration_not_found on the wire.
  const code = failure.error === 'registration_expired' ? 'registration_not_found' : failure.error
  return HttpResponse.json({ error: { code, message: code } }, { status: statuses[failure.error] })
}
export const successResponse = (value: unknown, status = 200) =>
  value === undefined ? new HttpResponse(null, { status: 204 }) : HttpResponse.json(value as Record<string, unknown>, { status })

export const domainMock = <Args, Input, Payload, Code extends string>(
  method: Method,
  path: string,
  build: (input?: Input) => Payload,
  statuses: Record<Code, number>,
  envelope: (payload: Payload) => unknown = value => value,
  successStatus = 200,
) => {
  const respond = (resolver: Resolver<Args, Payload, Code>) =>
    mockRequest(method, path).respond(async args => {
      const result = await resolver(args as Args)
      return isFailure<Code>(result) ? failureResponse(result, statuses) : successResponse(envelope(result), successStatus)
    }) as Spy<Args>
  return Object.assign((input?: Input) => respond(() => build(input)), {
    respond,
    error: (code: Code) => respond(() => ({ error: code })),
    networkError: () => respond(() => ({ networkError: true })),
  })
}

/** A ceremony is one domain call. Options and verification remain private wire details. */
export const ceremonyMock = <Args extends ParsedRequest, Input, Payload, Code extends string>(
  optionsPath: string,
  verifyPath: string,
  options: (id: string) => Record<string, unknown>,
  idKey: string,
  build: (input?: Input) => Payload,
  statuses: Record<Code, number>,
  optionsErrors: readonly Code[],
  successStatus = 200,
) => {
  const respond = (resolver: Resolver<Args, Payload, Code>) => {
    let sequence = 0
    const answers = new Map<string, Answer<Payload, Code>>()
    const spy = mockRequest('POST', optionsPath).respond(async args => {
      const answer = await resolver(args as Args)
      if (isFailure<Code>(answer) && ('networkError' in answer || optionsErrors.includes(answer.error))) {
        return failureResponse(answer, statuses)
      }
      const id = `ceremony-${++sequence}`
      answers.set(id, answer)
      return successResponse(options(id))
    }) as Spy<Args>
    mockRequest('POST', verifyPath).respond(args => {
      const id = String(args[idKey])
      if (!answers.has(id)) {
        throw new Error(`Verification does not match an issued ceremony: ${id}`)
      }
      const answer = answers.get(id)!
      answers.delete(id)
      return isFailure<Code>(answer) ? failureResponse(answer, statuses) : successResponse(answer, successStatus)
    })
    return spy
  }
  return Object.assign((input?: Input) => respond(() => build(input)), {
    respond,
    error: (code: Code) => respond(() => ({ error: code })),
    networkError: () => respond(() => ({ networkError: true })),
  })
}
