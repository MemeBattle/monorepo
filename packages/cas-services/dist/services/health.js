import { CAS_ROUTES } from "../constants.js";
const createHealthService = (request)=>()=>request.get(CAS_ROUTES.health);
export { createHealthService };
