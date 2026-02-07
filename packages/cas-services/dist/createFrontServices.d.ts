import { CreateFrontServices } from './types';
export declare const createFrontServices: ({ casURI, partnerId, successLogger, errorLogger, }: CreateFrontServices) => {
    loginService: (credentials: import("./types").LoginCredentials) => Promise<import("./types").ErrorLogin | import("./types").SuccessLogin>;
    signUpService: (payload: import("./types").SignUpCredentials) => Promise<import("./types").SuccessSignUp | import("./types").ErrorSignUp>;
    updateUserProfileService: ({ userId, token, avatar, username }: import("./types").UpdateUserProfilePayload) => Promise<import("./types").SuccessUpdateUser | import("./types").ErrorUpdateUser>;
    getMeService: ({ token }: import("./types").GetMePayload) => Promise<import("./types").SuccessGetMe | import("./types").ErrorGetMe>;
};
export type FrontServices = ReturnType<typeof createFrontServices>;
