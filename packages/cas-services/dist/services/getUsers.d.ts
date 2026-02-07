import { AxiosInstance } from 'axios';
import { SuccessGetUsers, GetUsersPayload, ErrorGetUsers } from '../types';
export declare const createGetUsersService: (request: AxiosInstance) => (params?: GetUsersPayload) => Promise<SuccessGetUsers | ErrorGetUsers>;
