import { createBaseRequest } from "./request.js";
import { createCreateTemporaryTokenService, createGetMeService, createGetUsersService, createHealthService, createLoginService, createSignUpService } from "./services/index.js";
import { createJWTServices } from "./jwt/index.js";
const createCasServices = ({ casURI, partnerId, publicKey, successLogger, errorLogger })=>{
    const baseRequest = createBaseRequest({
        casURI,
        errorLogger,
        successLogger
    });
    const loginService = createLoginService(baseRequest);
    const healthService = createHealthService(baseRequest);
    const signUpService = createSignUpService(baseRequest, partnerId);
    const getMeService = createGetMeService(baseRequest);
    const getUsersService = createGetUsersService(baseRequest);
    const { verifyToken } = createJWTServices({
        publicKey
    });
    const createTemporaryTokenService = createCreateTemporaryTokenService(baseRequest);
    return {
        loginService,
        signUpService,
        verifyToken,
        healthService,
        getMeService,
        getUsersService,
        createTemporaryTokenService
    };
};
export { createCasServices };
