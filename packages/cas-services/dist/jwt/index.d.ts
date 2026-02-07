import { CreateJWTServices, VerifyTokenSuccess, VerifyTokenError } from '../types';
export declare const createJWTServices: ({ publicKey }: CreateJWTServices) => {
    verifyToken(token: string): Promise<VerifyTokenSuccess | VerifyTokenError>;
};
