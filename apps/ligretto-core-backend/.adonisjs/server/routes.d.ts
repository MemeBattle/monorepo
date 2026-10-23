import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'users.index': { paramsTuple?: []; params?: {} }
    'games.create': { paramsTuple?: []; params?: {} }
    'games.index': { paramsTuple?: []; params?: {} }
    'games.save_round': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'auth.me': { paramsTuple?: []; params?: {} }
    'auth.sign_in': { paramsTuple?: []; params?: {} }
    'auth.callback': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'health_checks': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'users.index': { paramsTuple?: []; params?: {} }
    'games.index': { paramsTuple?: []; params?: {} }
    'auth.me': { paramsTuple?: []; params?: {} }
    'auth.sign_in': { paramsTuple?: []; params?: {} }
    'auth.callback': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'health_checks': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'users.index': { paramsTuple?: []; params?: {} }
    'games.index': { paramsTuple?: []; params?: {} }
    'auth.me': { paramsTuple?: []; params?: {} }
    'auth.sign_in': { paramsTuple?: []; params?: {} }
    'auth.callback': { paramsTuple?: []; params?: {} }
    'auth.logout': { paramsTuple?: []; params?: {} }
    'health_checks': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'games.create': { paramsTuple?: []; params?: {} }
    'games.save_round': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}