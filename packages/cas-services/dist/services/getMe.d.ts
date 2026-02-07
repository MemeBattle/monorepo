import { AxiosInstance } from 'axios';
import { ErrorGetMe, SuccessGetMe, GetMePayload } from '../types';
export declare const createGetMeService: (request: AxiosInstance) => ({ token }: GetMePayload) => Promise<SuccessGetMe | ErrorGetMe>;
