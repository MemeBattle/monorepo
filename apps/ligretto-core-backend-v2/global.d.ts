import type { PlatformaticApp, PlatformaticDBMixin, PlatformaticDBConfig, Entity, Entities, EntityHooks } from '@platformatic/db'
import { EntityTypes, AdonisSchema,Game,Round,RoundUser,User } from './types'

declare module 'fastify' {
  interface FastifyInstance {
    getSchema<T extends 'AdonisSchema' | 'Game' | 'Round' | 'RoundUser' | 'User'>(schemaId: T): {
      '$id': string,
      title: string,
      description: string,
      type: string,
      properties: {
        [x in keyof EntityTypes[T]]: { type: string, nullable?: boolean }
      },
      required: string[]
    };
  }
}

interface AppEntities extends Entities {
  adonisSchema: Entity<AdonisSchema>,
    game: Entity<Game>,
    round: Entity<Round>,
    roundUser: Entity<RoundUser>,
    user: Entity<User>,
}

interface AppEntityHooks {
  addEntityHooks(entityName: 'adonisSchema', hooks: EntityHooks<AdonisSchema>): any
    addEntityHooks(entityName: 'game', hooks: EntityHooks<Game>): any
    addEntityHooks(entityName: 'round', hooks: EntityHooks<Round>): any
    addEntityHooks(entityName: 'roundUser', hooks: EntityHooks<RoundUser>): any
    addEntityHooks(entityName: 'user', hooks: EntityHooks<User>): any
}

declare module 'fastify' {
  interface FastifyInstance {
    platformatic: PlatformaticApp<PlatformaticDBConfig> &
      PlatformaticDBMixin<AppEntities> &
      AppEntityHooks
  }
}
