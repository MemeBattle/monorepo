import { ErrorLoggerFunction, SuccessLoggerFunction } from './types';
export declare const createBaseRequest: ({ casURI, errorLogger, successLogger, }: {
    casURI: string;
    successLogger?: SuccessLoggerFunction;
    errorLogger?: ErrorLoggerFunction;
}) => import("axios").AxiosInstance;
