import type { ErrorLoggerFunction, SuccessLoggerFunction } from './types';
type RequestConfig = {
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
};
export type HttpClient = {
    get: <T>(url: string, config?: RequestConfig) => Promise<T>;
    post: <T>(url: string, data?: unknown, config?: RequestConfig) => Promise<T>;
    patch: <T>(url: string, data?: unknown, config?: RequestConfig) => Promise<T>;
};
export declare const createBaseRequest: ({ casURI, errorLogger, successLogger, }: {
    casURI: string;
    successLogger?: SuccessLoggerFunction;
    errorLogger?: ErrorLoggerFunction;
}) => HttpClient;
export {};
