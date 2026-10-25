// The Worker program (tsconfig.worker.json) loads @cloudflare/workers-types only, which declares no `node:*` module;
// the `nodejs_compat` flag of cloudflare.config.ts provides the runtime. This declares the part of
// `node:async_hooks` the request scope uses, so the Worker program does not have to load @types/node. The Node program
// excludes this file: there @types/node declares the module.
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, callback: () => R): R
    getStore(): T | undefined
  }
}
