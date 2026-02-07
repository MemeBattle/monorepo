import { CAS_ROUTES } from "../constants.js";
const createLoginService = (request)=>(credentials)=>request.post(CAS_ROUTES.loginRequest, credentials);
export { createLoginService };
