/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../global.d.ts" />
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'

export default async function (fastify: FastifyInstance, opts: FastifyPluginOptions) {
  fastify.get('/test', async (request, reply) => {
    console.log('casServices!!!', fastify.casServices, opts)
    return await fastify.casServices.getUsers()
  })
}
