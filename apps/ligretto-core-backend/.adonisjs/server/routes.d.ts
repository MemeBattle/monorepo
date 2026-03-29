import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'users.index': { paramsTuple?: []; params?: {} }
    'users.store': { paramsTuple?: []; params?: {} }
    'users.show': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
    'users.update': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
    'users.destroy': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
    'games.create': { paramsTuple?: []; params?: {} }
    'games.index': { paramsTuple?: []; params?: {} }
    'games.save_round': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
    'auth.me': { paramsTuple?: []; params?: {} }
    health_checks: { paramsTuple?: []; params?: {} }
  }
  GET: {
    'users.index': { paramsTuple?: []; params?: {} }
    'users.show': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
    'games.index': { paramsTuple?: []; params?: {} }
    health_checks: { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'users.index': { paramsTuple?: []; params?: {} }
    'users.show': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
    'games.index': { paramsTuple?: []; params?: {} }
    health_checks: { paramsTuple?: []; params?: {} }
  }
  POST: {
    'users.store': { paramsTuple?: []; params?: {} }
    'games.create': { paramsTuple?: []; params?: {} }
    'games.save_round': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
    'auth.me': { paramsTuple?: []; params?: {} }
  }
  PUT: {
    'users.update': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
  }
  PATCH: {
    'users.update': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
  }
  DELETE: {
    'users.destroy': { paramsTuple: [ParamValue]; params: { id: ParamValue } }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}
