import { CAS_ROUTES } from "../constants.js";
const createSignUpService = (request, partnerId)=>(payload)=>request.post(CAS_ROUTES.emailSignUp, {
            ...payload,
            partnerId
        });
export { createSignUpService };
