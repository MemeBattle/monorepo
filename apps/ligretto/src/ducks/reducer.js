import gameReducer from './game/reducer';
import mainReducer from './main/reducer';
import {combineReducers} from 'redux';


export default combineReducers({
    game: gameReducer,
    main: mainReducer,
});


