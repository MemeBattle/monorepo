/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../global.d.ts" />
import type { FastifyInstance } from 'fastify'
import type { User } from '../types'
import type { User as CasUser, TemporaryUser as CasTemporaryUser } from '@memebattle/cas-services'

interface UserServices {
  findOneOrCreate(casId: string): Promise<User>
  create(user: Partial<User>): Promise<User>
  mergeWithCasUser(user: User, casUser: CasUser | CasTemporaryUser): User & Omit<CasUser | CasTemporaryUser, '_id'>
}

declare module 'fastify' {
  interface FastifyInstance {
    userService: UserServices
  }
}

export default async function (fastify: FastifyInstance) {
  const findOneOrCreate = async (casId: string) => {
    const [user] = await fastify.platformatic.entities.user.find({ where: { casId: { eq: casId } } })

    if (user) {
      return user
    }

    return await fastify.platformatic.entities.user.save({ input: { casId } })
  }

  const create = async (user: Partial<User>) => await fastify.platformatic.entities.user.save({ input: user })

  const mergeWithCasUser = (user: User, casUser: CasUser | CasTemporaryUser) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = casUser
    return { ...user, ...rest }
  }

  fastify.decorate('userService', {
    findOneOrCreate,
    create,
    mergeWithCasUser,
  })
}
