import type { HttpClient } from '../request';
import type { SuccessHealthCheck, ErrorHealthCheck } from '../types';
export declare const createHealthService: (request: HttpClient) => () => Promise<ErrorHealthCheck | SuccessHealthCheck>;
