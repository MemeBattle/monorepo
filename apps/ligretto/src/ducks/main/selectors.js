export function selectCreateRoomError(state) {
    return {
        error: state.main.error
    }
}

export function selectAppContainer(state) {
    return {
        user: state.main.user,
    }
}
export function selectNotification(state) {
    return {
        error: state.main.error,
    }
}

export function selectGetRooms(state) {
    return {
        rooms: state.main.rooms
    }
}