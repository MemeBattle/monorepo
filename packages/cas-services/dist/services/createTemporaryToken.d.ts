import type { HttpClient } from '../request';
import type { SuccessCreateTemporaryToken, ErrorCreateTemporaryToken } from '../types';
export declare const createCreateTemporaryTokenService: (request: HttpClient) => () => Promise<SuccessCreateTemporaryToken | ErrorCreateTemporaryToken>;
