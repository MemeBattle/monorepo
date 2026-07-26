import type { CreateCasServices } from './types';
export declare const createCasServices: ({ casURI, partnerId, publicKey, successLogger, errorLogger }: CreateCasServices) => {
    loginService: (credentials: import("./types").LoginCredentials) => Promise<import("./types").SuccessLogin | import("./types").ErrorLogin>;
    signUpService: (payload: import("./types").SignUpCredentials) => Promise<import("./types").SuccessSignUp | import("./types").ErrorSignUp>;
    verifyToken: (token: string) => Promise<import("./types").VerifyTokenSuccess | import("./types").VerifyTokenError>;
    healthService: () => Promise<import("./types").ErrorHealthCheck | import("./types").SuccessHealthCheck>;
    getMeService: ({ token }: import("./types").GetMePayload) => Promise<import("./types").SuccessGetMe | import("./types").ErrorGetMe>;
    getUsersService: (params?: import("./types").GetUsersPayload) => Promise<import("./types").ErrorGetUsers | import("./types").SuccessGetUsers>;
    createTemporaryTokenService: () => Promise<import("./types").ErrorCreateTemporaryToken | import("./types").SuccessCreateTemporaryToken>;
};
