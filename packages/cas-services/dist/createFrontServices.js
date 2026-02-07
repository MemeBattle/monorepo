import { createBaseRequest } from "./request.js";
import { createGetMeService, createLoginService, createSignUpService, createUpdateUserProfileService } from "./services/index.js";
const createFrontServices = ({ casURI, partnerId, successLogger, errorLogger })=>{
    const baseRequest = createBaseRequest({
        casURI,
        successLogger,
        errorLogger
    });
    const loginService = createLoginService(baseRequest);
    const signUpService = createSignUpService(baseRequest, partnerId);
    const updateUserProfileService = createUpdateUserProfileService(baseRequest);
    const getMeService = createGetMeService(baseRequest);
    return {
        loginService,
        signUpService,
        updateUserProfileService,
        getMeService
    };
};
export { createFrontServices };
