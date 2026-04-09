import type { HttpClient } from '../request';
import type { SignUpCredentials, SuccessSignUp, ErrorSignUp } from '../types';
export declare const createSignUpService: (request: HttpClient, partnerId: string) => (payload: SignUpCredentials) => Promise<SuccessSignUp | ErrorSignUp>;
