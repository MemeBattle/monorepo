import type { HttpClient } from '../request';
import type { ErrorGetMe, SuccessGetMe, GetMePayload } from '../types';
export declare const createGetMeService: (request: HttpClient) => ({ token }: GetMePayload) => Promise<SuccessGetMe | ErrorGetMe>;
