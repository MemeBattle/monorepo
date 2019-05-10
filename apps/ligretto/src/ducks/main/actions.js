import types from './types';
import mainService from './service';
import errorsMap from '../../helpers/errorsMap';


const actions = {
    fetchRoomsRequest: () => {
        return {
            type: types.FETCH_ROOMS_REQUEST,
        }
    },

    fetchRoomsSuccess: (rooms) => {
        return {
            type: types.FETCH_ROOMS_SUCCESS,
            rooms
        }
    },

    fetchRoomsError: (error) => {
        return {
            type: types.FETCH_ROOMS_ERROR,
            error
        }
    },

    fetchRooms: () => {
        return (dispatch) => {
            dispatch(actions.fetchRoomsRequest());
            return mainService.fetchRooms()
                .then(result => {
                    return dispatch(actions.fetchRoomsSuccess(result))
                },
                error => {
                    return dispatch(actions.fetchRoomsError("Не удалось загрузить комнаты\n" + error.toString()))
                })
        }
    },

    roomCreatedSuccess: (response) => {
        return {
            type: types.CREATE_ROOM_SUCCESS
        }
    },

    roomCreateError: (errorMessage) => {
        console.log(errorMessage);
        return {
            type: types.CREATE_ROOM_ERROR,
            error: errorMessage
        }
    },

    createRoom: (name) => {
        return (dispatch) => {
            return mainService.createRoom(name).then(response => {
                dispatch(actions.roomCreatedSuccess(response));
            }, error => {
                dispatch(actions.roomCreateError(errorsMap(error.message)));
            })
        }
    },

    selectUser: (user) => {
        return{
            type: types.SELECT_USER,
            user,

        };
    },

    showNotification: (error) => {
        return {
            type: types.SHOW_NOTIFICATION,
            error
        }
    },

    hideNotification: () => {
        return {
            type: types.HIDE_NOTIFICATION
        }
    },



};

export default actions;