import type { HttpClient } from '../request';
import type { LoginCredentials, SuccessLogin, ErrorLogin } from '../types';
export declare const createLoginService: (request: HttpClient) => (credentials: LoginCredentials) => Promise<ErrorLogin | SuccessLogin>;
