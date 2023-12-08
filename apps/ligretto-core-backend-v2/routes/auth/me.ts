/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../../global.d.ts" />
import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'

const meSchema = Type.Object({
  token: Type.Optional(
    Type.String({
      pattern: '\\D+',
    }),
  ),
})

export default async function (fastify: FastifyInstance) {
  fastify.withTypeProvider<TypeBoxTypeProvider>().post('/me', { schema: { body: meSchema } }, async (request, reply) => {
    const { token } = request.body
    console.log('token', token, typeof token)
    if (token) {
      const casMeResult = await fastify.casServices.getMe({ token })
      if (casMeResult.success === true) {
        const user = await fastify.userService.findOneOrCreate(casMeResult.data.user._id)
        return { user: fastify.userService.mergeWithCasUser(user, casMeResult.data.user), token }
      }

      if (casMeResult.error.errorCode !== 403) {
        reply.status(casMeResult.error.errorCode)
        return casMeResult.error
      }
    }

    const temporaryResult = await fastify.casServices.createTemporaryToken()
    if (temporaryResult.success === true) {
      const user = await fastify.userService.create({ casId: temporaryResult.data.temporaryUser._id, isTemporary: true })

      return { user: fastify.userService.mergeWithCasUser(user, temporaryResult.data.temporaryUser), token: temporaryResult.data.temporaryToken }
    }

    reply.status(temporaryResult.error.errorCode)
    return temporaryResult.error
  })
}
