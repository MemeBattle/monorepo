import actionTypes from './types';


function reducer(state = {}, action){
    switch(action.type){
        case actionTypes.START_GAME:
            return {
                ...state,

            };

        case actionTypes.GAME_OVER:
            return {
                ...state,

            };

        case actionTypes.NEW_CARD_ON_BOARD:
            return {
                ...state,

            };

        case actionTypes.DISCARD_PACK:
            return {
                ...state,

            };

        case actionTypes.GET_ONE_CARD:
            return {
                ...state,

            };

        case actionTypes.PUT_CARD_SUCCESS:
            return {
                ...state,

            };

        case actionTypes.SHUFFLE_CARDS:
            return {
                ...state,

            };

        default:
            return state;
    }
}

export default reducer;


