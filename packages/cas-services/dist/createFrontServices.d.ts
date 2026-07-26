import type { CreateFrontServices } from './types';
export declare const createFrontServices: ({ casURI, partnerId, successLogger, errorLogger }: CreateFrontServices) => {
    loginService: (credentials: import("./types").LoginCredentials) => Promise<import("./types").SuccessLogin | import("./types").ErrorLogin>;
    signUpService: (payload: import("./types").SignUpCredentials) => Promise<import("./types").SuccessSignUp | import("./types").ErrorSignUp>;
    updateUserProfileService: ({ userId, token, avatar, username }: import("./types").UpdateUserProfilePayload) => Promise<import("./types").ErrorUpdateUser | import("./types").SuccessUpdateUser>;
    getMeService: ({ token }: import("./types").GetMePayload) => Promise<import("./types").SuccessGetMe | import("./types").ErrorGetMe>;
};
export type FrontServices = ReturnType<typeof createFrontServices>;
