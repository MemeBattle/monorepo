import { AxiosInstance } from 'axios';
import { SignUpCredentials, SuccessSignUp, ErrorSignUp } from '../types';
export declare const createSignUpService: (request: AxiosInstance, partnerId: string) => (payload: SignUpCredentials) => Promise<SuccessSignUp | ErrorSignUp>;
