import { CAS_ROUTES } from "../constants.js";
const createGetMeService = (request)=>({ token })=>request.get(`${CAS_ROUTES.getMe}`, {
            headers: {
                Authorization: token
            },
            params: {
                token
            }
        });
export { createGetMeService };
