/**
 * The client of the ligretto-core public API (`apps/ligretto-core-backend/openapi.json`): one function per operation,
 * named by its `operationId`, and the models of the document. Make a `Client` with `createClient` and pass it to each
 * call.
 */
export * from './generated/public'
export { createClient } from './client'
export type {
  AnyResult,
  Client,
  ClientOptions,
  ErrorResult,
  Options,
  RedirectResult,
  RequestConfig,
  RequestResult,
  SuccessResult,
  TransportFailure,
  UnexpectedResult,
} from './client'
