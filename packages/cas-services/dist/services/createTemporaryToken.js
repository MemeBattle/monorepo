import { CAS_ROUTES } from "../constants.js";
const createCreateTemporaryTokenService = (request)=>()=>request.post(`${CAS_ROUTES.temporaryToken}`);
export { createCreateTemporaryTokenService };
