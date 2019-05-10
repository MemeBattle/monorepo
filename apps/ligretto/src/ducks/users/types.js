const types = {
    GET_USER_REQUEST: '@@users/GET_USER_REQUEST',
    GET_USER_SUCCESS: '@@users/GET_USER_SUCCESS',
    GET_USER_ERROR: '@@users/GET_USER_ERROR',

    // приходит от сервера, когда кто-то покинул комнату ({user: {name: string}})
    USER_LEAVES_ROOM: '@@main/USER_LEAVES_ROOM',
    // приходит от сервера, когда кто-то присоединился к комнате ({user: {name: string}})
    USER_ENTERED_ROOM: '@@main/USER_ENTERED_ROOM',
};

export default types;