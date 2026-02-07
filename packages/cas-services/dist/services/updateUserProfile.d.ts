import { AxiosInstance } from 'axios';
import { UpdateUserProfilePayload, SuccessUpdateUser, ErrorUpdateUser } from '../types';
export declare const createUpdateUserProfileService: (request: AxiosInstance) => ({ userId, token, avatar, username }: UpdateUserProfilePayload) => Promise<SuccessUpdateUser | ErrorUpdateUser>;
