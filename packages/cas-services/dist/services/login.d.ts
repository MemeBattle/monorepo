import { AxiosInstance } from 'axios';
import { LoginCredentials, SuccessLogin, ErrorLogin } from '../types';
export declare const createLoginService: (request: AxiosInstance) => (credentials: LoginCredentials) => Promise<ErrorLogin | SuccessLogin>;
