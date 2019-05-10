import {socketPrefix} from '../../constants';

const types = {
    //--------------Server send--------------
    JOIN_ROOM_SUCCESS: '@@main/JOIN_ROOM_SUCCESS',
    JOIN_ROOM_ERROR: '@@main/JOIN_ROOM_ERROR',
    START_GAME: '@@game/START_GAME',
    GAME_OVER: '@@game/GAME_OVER',
    USER_READY_TO_PLAY: '@@game/USER_READY_TO_PLAY',
    READY_TO_PLAY_ERROR: '@@game/READY_TO_PLAY_ERROR',

    NEW_CARD_ON_BOARD: '@@game/NEW_CARD_ON_BOARD',

    DISCARD_PACK: '@@game/DISCARD_PACK',

    PUT_CARD_SUCCESS: '@@game/PUT_CARD_SUCCESS',
    PUT_CARD_ERROR: '@@game/PUT_CARD_ERROR',

    GET_THREE_CARDS_SUCCESS: '@@game/GET_THREE_CARDS_SUCCESS',
    GET_THREE_CARDS_ERROR: '@@game/GET_THREE_CARDS_ERROR',

    PUT_CARD_FROM_PACK_SUCCESS: '@@game/PUT_CARD_FROM_PACK_SUCCESS',
    PUT_CARD_FROM_PACK_ERROR: '@@game/PUT_CARD_FROM_PACK_ERROR',

    SHUFFLE_CARDS_SUCCESS: '@@game/SHUFFLE_CARDS_SUCCESS',
    SHUFFLE_CARDS_ERROR: '@@game/SHUFFLE_CARDS_ERROR',

    GET_ONE_CARD_SUCCESS: '@@game/GET_ONE_CARD_SUCCESS',
    GET_ONE_CARD_ERROR: '@@game/GET_ONE_CARD_ERROR',

    PLAYER_GOT_CARD_IN_ROW: '@@game/PLAYER_GOT_CARD_IN_ROW',
    PLAYER_GOT_CARDS_IN_REMAINING_STACK: '@@game/PLAYER_GOT_CARDS_IN_REMAINING_STACK',


    //----------Player send-------------
    JOIN_ROOM_REQUEST: socketPrefix + '@@main/JOIN_ROOM_REQUEST',
    READY_TO_PLAY: socketPrefix + '@@game/READY_TO_PLAY',
    LEAVE_ROOM: socketPrefix + '@@game/LEAVE_ROOM',

    PUT_CARD_REQUEST: socketPrefix + '@@game/PUT_CARD_REQUEST',

    SHUFFLE_CARDS_REQUEST: socketPrefix + '@@game/SHUFFLE_CARDS_REQUEST',
    GET_ONE_CARD_REQUEST: socketPrefix + '@@game/GET_ONE_CARD_REQUEST',

    PUT_CARD_FROM_PACK_REQUEST: socketPrefix + '@@game/PUT_CARD_FROM_PACK_REQUEST',

    GET_THREE_CARDS_REQUEST: socketPrefix + '@@game/GET_THREE_CARDS_REQUEST',

    DISPLAY_RIVAL_CARD_REQUEST: socketPrefix + '@@game/DISPLAY_RIVAL_CARD_REQUEST',

    // ---------- Internal --------
    HIDE_GAME_OVER_MODAL: '@@game/HIDE_GAME_OVER_MODAL',

    // ...
    USER_ENTERED_ROOM: '@@main/USER_ENTERED_ROOM'

};

export default types;