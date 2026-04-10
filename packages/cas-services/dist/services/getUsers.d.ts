import type { HttpClient } from '../request';
import type { SuccessGetUsers, GetUsersPayload, ErrorGetUsers } from '../types';
export declare const createGetUsersService: (request: HttpClient) => (params?: GetUsersPayload) => Promise<SuccessGetUsers | ErrorGetUsers>;
