import types from './types';


const actions = {
    joinRoomRequest: (id, user, socketId) => {
        return {
            type: types.JOIN_ROOM_REQUEST,
            id,
            user,
            socketId
        }
    },

    putCardRequest: (position) => {
        return {
            type: types.PUT_CARD_REQUEST,
            position
        }
    },

    putCardFromPackRequest: () => {
        return {
            type: types.PUT_CARD_FROM_PACK_REQUEST,
        }
    },

    shuffleCardsRequest: () => {
        return {
            type: types.SHUFFLE_CARDS_REQUEST
        }
    },

    getOneCardRequest: () => {
        return {
            type: types.GET_ONE_CARD_REQUEST
        }
    },

    readyToPlay: () => {
        return {
            type: types.READY_TO_PLAY
        }
    },

    getThreeCardRequest: () => {
        return {
            type: types.GET_THREE_CARDS_REQUEST
        }
    },

    leaveGroup: () => ({
        type: types.LEAVE_ROOM
    }),

    hideGameOverModal: () => {
        return {
            type: types.HIDE_GAME_OVER_MODAL
        }
    }

};

export default actions;