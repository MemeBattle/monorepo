import type { HttpClient } from '../request';
import type { UpdateUserProfilePayload, SuccessUpdateUser, ErrorUpdateUser } from '../types';
export declare const createUpdateUserProfileService: (request: HttpClient) => ({ userId, token, avatar, username }: UpdateUserProfilePayload) => Promise<SuccessUpdateUser | ErrorUpdateUser>;
