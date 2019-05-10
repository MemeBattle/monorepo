import {createLogger} from 'redux-logger';
import {applyMiddleware, createStore, compose} from 'redux';
import thunkMiddleware from 'redux-thunk';
import createSocketIoMiddleware from 'redux-socket.io';
import io from 'socket.io-client';
import rootReducer from './ducks/reducer';
import {initialState as gameInitialState} from './ducks/game/reducer';
import {initialState as mainInitialState} from './ducks/main/reducer';

import {API_URL} from './constants';

const loggerMiddleware = createLogger();
let socket = io(API_URL);
let socketIoMiddleware = createSocketIoMiddleware(socket, "server/");

const user = JSON.parse(window.localStorage.getItem('user'));

const preloadedState = {
    main: {
        ...mainInitialState,
        user: user || mainInitialState.user
    },
    game: gameInitialState
};

const middleware = [
    thunkMiddleware,
    socketIoMiddleware,
    loggerMiddleware
];

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
const store = createStore(rootReducer, preloadedState, composeEnhancers(
    applyMiddleware(...middleware)
));

export default store;