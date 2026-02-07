import { CAS_ROUTES } from "../constants.js";
const createGetUsersService = (request)=>(params)=>request.get(`${CAS_ROUTES.users}`, {
            params
        });
export { createGetUsersService };
