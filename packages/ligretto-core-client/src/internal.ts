/**
 * The client of the ligretto-core internal API (`apps/ligretto-core-backend/openapi.internal.json`): one function per
 * operation, named by its `operationId`, and the models of the document. Make a `Client` with `createClient`, with
 * the shared secret as its default `Authorization` header, and pass it to each call.
 */
export * from './generated/internal'
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
