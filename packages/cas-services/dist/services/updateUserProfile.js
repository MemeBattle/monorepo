import { CAS_ROUTES } from "../constants.js";
const createUpdateUserProfileService = (request)=>({ userId, token, avatar, username })=>{
        const formData = new FormData();
        if (avatar) formData.append('avatar', avatar);
        if (username) formData.append('username', username);
        return request.patch(`${CAS_ROUTES.users}/${userId}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                Authorization: token
            }
        });
    };
export { createUpdateUserProfileService };
