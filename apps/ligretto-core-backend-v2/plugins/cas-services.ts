/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../global.d.ts" />
import type { FastifyInstance } from 'fastify'
import fs from 'fs/promises'
import { createCasServices } from '@memebattle/cas-services'

interface CasServices {
  login: ReturnType<typeof createCasServices>['loginService']
  signUp: ReturnType<typeof createCasServices>['signUpService']
  verifyToken: ReturnType<typeof createCasServices>['verifyToken']
  getMe: ReturnType<typeof createCasServices>['getMeService']
  getUsers: ReturnType<typeof createCasServices>['getUsersService']
  createTemporaryToken: ReturnType<typeof createCasServices>['createTemporaryTokenService']
}

declare module 'fastify' {
  interface FastifyInstance {
    casServices: CasServices
  }
}

interface CasServicesOptions {
  partnerId: string
  casURI: string
  publicKeyPath: string
}

export default async function (fastify: FastifyInstance, opts: CasServicesOptions) {
  const { partnerId, casURI, publicKeyPath } = opts
  const publicKey = await fs.readFile(publicKeyPath).toString()
  const services = createCasServices({ partnerId, casURI, publicKey })

  const login = services.loginService
  const signUp = services.signUpService
  const verifyToken = services.verifyToken
  const getMe = services.getMeService
  const getUsers = services.getUsersService
  const createTemporaryToken = services.createTemporaryTokenService

  fastify.decorate('casServices', {
    login,
    signUp,
    verifyToken,
    getMe,
    getUsers,
    createTemporaryToken,
  })
}
