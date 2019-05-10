import actionTypes from './types';
import {sides} from '../../constants';

import _ from 'lodash';

export const initialState = {
    error: '',
    gameError: '',
    cardsOnBoard: [],
    my: {},
    left: {},
    top: {},
    right: {},
    status: '',
    showGameOver: false
};


function startOrBackUp(state, action) {
    let newState = {
        ...state,
        my: action.me || {},
        status: action.status,
        socketId: action.socketId,
        cardsOnBoard: action.cardsOnBoard && [...action.cardsOnBoard],
        gameOver: undefined,
        showGameOver: false
    };
    action.others.forEach((obj, index) => {
        newState[sides[index]] = obj;
    });
    return newState;
}

function addUser(state, action) {
    const {user} = action;
    let newState = {
        ...state,
    };

    for (let i = 0; i<3; i++) {
        if (typeof newState[sides[i]].user === 'undefined') {
            newState[sides[i]] = {...newState[sides[i]]};
            newState[sides[i]].user = user;
            break;
        }
    }
    return newState;
}

function reducer(state = initialState, action){
    switch(action.type){
        case actionTypes.JOIN_ROOM_REQUEST:
            return {
                ...state,
            };

        case actionTypes.JOIN_ROOM_SUCCESS:
            return startOrBackUp(state, action);

        case actionTypes.JOIN_ROOM_ERROR:
            return {
                ...state,
                error: action.err
            };

        case actionTypes.START_GAME:
            return startOrBackUp(state, action);

        case actionTypes.USER_ENTERED_ROOM:
            return addUser(state,action);

        case actionTypes.PLAYER_GOT_CARD_IN_ROW:
            const newState1 = {
                ...state,
            };

            for (let i = 0; i < 3; i++) {
                if (newState1[sides[i]].color === action.color) {
                    newState1[sides[i]] = {...newState1[sides[i]]};
                    newState1[sides[i]].row = action.row;
                    break;
                }
            }
            return newState1;

        case actionTypes.PLAYER_GOT_CARDS_IN_REMAINING_STACK:
            const newState2 = {
                ...state,
            };

            for (let i = 0; i < 3; i++) {
                if (newState2[sides[i]].color === action.color) {
                    newState2[sides[i]] = {...newState2[sides[i]]};
                    newState2[sides[i]].remainingStack = [action.card];
                    break;
                }
            }
            return newState2;

        case actionTypes.GAME_OVER:
            return {
                ...state,
                status: action.status,
                showGameOver: true,
                gameOver: {
                    winner: action.winner,
                    players: action.others
                }
            };

        case actionTypes.NEW_CARD_ON_BOARD:
            let cardsOnBoard = [...state.cardsOnBoard];
            cardsOnBoard[parseInt(action.position)] = action.card;
            return {
                ...state,
                cardsOnBoard
            };

        case actionTypes.DISCARD_PACK:
            cardsOnBoard = [...state.cardsOnBoard];
            _.pullAt(cardsOnBoard, [action.position]);
            return {
                ...state,
                cardsOnBoard
            };

        case actionTypes.GET_ONE_CARD_REQUEST:
            return {
                ...state,
            };

        case actionTypes.GET_ONE_CARD_SUCCESS:
            return {
                ...state,
                my: {
                    ...state.my,
                    row: action.row,
                    stackCount: state.my.stackCount - 1
                }
            };

        case actionTypes.GET_THREE_CARDS_SUCCESS:
            return{
                ...state,
                my: {
                    ...state.my,
                    remainingStack: [...state.my.remainingStack, ...action.cards],
                    remainingCardsCount: state.my.remainingCardsCount - 3
                }
            };

        case actionTypes.LEAVE_ROOM:
            return{
                ...initialState
            };

        case actionTypes.GET_ONE_CARD_ERROR:
            return {
                ...state,
                gameError: action.err
            };

        case actionTypes.PUT_CARD_SUCCESS:
            return {
                ...state,
                my: {
                    ...state.my,
                    row: action.row

                }
            };

        case actionTypes.PUT_CARD_FROM_PACK_SUCCESS:
            let remainingStack = [...state.my.remainingStack];
            remainingStack.pop();
            return {
                ...state,
                my: {
                    ...state.my,
                    remainingStack
                }
            };

        case actionTypes.SHUFFLE_CARDS_REQUEST:
            return {
                ...state,
            };

        case actionTypes.SHUFFLE_CARDS_SUCCESS:
            return {
                ...state,
                my: {
                    ...state.my,
                    remainingStack: [],
                    remainingCardsCount: action.remainingPackCount
                }
            };

        case actionTypes.SHUFFLE_CARDS_ERROR:
            return {
                ...state,
                gameError: action.err
            };

        case actionTypes.HIDE_GAME_OVER_MODAL:
            return {
                ...state,
                showGameOver: false,
            };

        default:
            return state;
    }
}

export default reducer;


