import { AxiosInstance } from 'axios';
import { SuccessCreateTemporaryToken, ErrorCreateTemporaryToken } from '../types';
export declare const createCreateTemporaryTokenService: (request: AxiosInstance) => () => Promise<SuccessCreateTemporaryToken | ErrorCreateTemporaryToken>;
