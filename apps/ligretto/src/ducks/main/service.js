import {request} from '../../helpers';
import {REST_ENDPOINTS} from "../../constants"

const service = {
    // GET ROOM LIST
    // GET USERS IN ROOM (param: room_id)
    createRoom: (name) => {
        return request({
            url: REST_ENDPOINTS.rooms,
            method: 'post',
            data: {
                name
            }
        })
    },

    fetchRooms: () => {
        return request({
            url: REST_ENDPOINTS.rooms,
            method: 'get'
        })
    }
};


export default service;