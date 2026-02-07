import { AxiosInstance } from 'axios';
import { SuccessHealthCheck, ErrorHealthCheck } from '../types';
export declare const createHealthService: (request: AxiosInstance) => () => Promise<ErrorHealthCheck | SuccessHealthCheck>;
