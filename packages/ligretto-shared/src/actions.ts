import type * as dto from './dto'
import { createAction } from '@reduxjs/toolkit'
import type { Action } from '@memebattle/redux-utils'
// import { createAction } from '@memebattle/redux-utils'

// export enum RoomsTypes {
//   SEARCH_ROOMS_FINISH = '@@rooms/SERVER/SEARCH_ROOMS_FINISH',
//   CREATE_ROOM_EMIT = '@@rooms/WEBSOCKET/CREATE_ROOM',
//   CREATE_ROOM_SUCCESS = '@@rooms/SERVER/CREATE_ROOM_SUCCESS',
//   SEARCH_ROOMS_EMIT = '@@rooms/WEBSOCKET/SEARCH_ROOMS',
//   UPDATE_ROOMS_LIST = '@@rooms/SERVER/UPDATE_ROOMS_LIST',
//   CONNECT_TO_ROOM_EMIT = '@@rooms/WEBSOCKET/CONNECT_TO_ROOM',
//   CONNECT_TO_ROOM_SUCCESS = '@@rooms/SERVER/CONNECT_TO_ROOM_SUCCESS',
//   CONNECT_TO_ROOM_ERROR = '@@rooms/SERVER/CONNECT_TO_ROOM_ERROR',
// }

// export enum GameTypes {
//   UPDATE_GAME = '@@game/SERVER/UPDATE_GAME',
//   SET_PLAYER_STATUS_EMIT = '@@game/WEBSOCKET/SET_PLAYER_STATUS',
// }

// export enum GameplayTypes {
//   START_GAME = '@@gameplay/WEBSOCKET/START_GAME',
//   UPDATE_GAME = '@@gameplay/SERVER/UPDATE_GAME',

//   END_ROUND = '@@gameplay/SERVER/END_ROUND',

//   PUT_CARD = '@@gameplay/WEBSOCKET/PUT_CARD',
//   PUT_CARD_FROM_STACK_OPEN_DECK = '@@gameplay/WEBSOCKET/PUT_CARD_FROM_STACK_OPEN_DECK',
//   TAKE_FROM_STACK_DECK = '@@gameplay/WEBSOCKET/TAKE_FROM_STACK_DECK',
//   TAKE_FROM_LIGRETTO_DECK = '@@gameplay/WEBSOCKET/TAKE_FROM_LIGRETTO_DECK',
// }

// export enum BotTypes {
//   ADD_BOT_EMIT = '@@bot/WEBSOCKET/ADD_BOT',
//   REMOVE_BOT_EMIT = '@@bot/WEBSOCKET/REMOVE_BOT_EMIT',
// }

// export enum TechTypes {
//   CONNECT_TO_GAME = '@@tech/WEBSOCKET/CONNECT_TO_GAME',
// }

// export type TechConnectToGame = Action<dto.TechConnectToGame>
export const techConnectToGame = createAction<dto.TechConnectToGame>('@@tech/WEBSOCKET/CONNECT_TO_GAME')

// export type PutCardAction = Action<GameplayTypes.PUT_CARD, dto.PutCard>
export const putCardAction = createAction<dto.PutCard>('@@gameplay/WEBSOCKET/PUT_CARD')

// export type PutCardFromStackOpenDeck = Action<GameplayTypes.PUT_CARD_FROM_STACK_OPEN_DECK, dto.PutCardFromStackOpenDeck>
export const putCardFromStackOpenDeck = createAction<dto.PutCardFromStackOpenDeck>('@@gameplay/WEBSOCKET/PUT_CARD_FROM_STACK_OPEN_DECK')

// export type SearchRoomsFinishAction = Action<RoomsTypes.SEARCH_ROOMS_FINISH, dto.SearchRoomsFinish>
export const searchRoomsFinishAction = createAction<dto.SearchRoomsFinish>('@@rooms/SERVER/SEARCH_ROOMS_FINISH')

// export type CreateRoomEmitAction = Action<RoomsTypes.CREATE_ROOM_EMIT, dto.CreateGame>
export const createRoomEmitAction = createAction<dto.CreateGame>('@@rooms/WEBSOCKET/CREATE_ROOM')

// export type SearchRoomsEmitAction = Action<RoomsTypes.SEARCH_ROOMS_EMIT, dto.SearchRooms>
export const searchRoomsEmitAction = createAction<dto.SearchRooms>('@@rooms/WEBSOCKET/SEARCH_ROOMS')

// export type UpdateRooms = Action<RoomsTypes.UPDATE_ROOMS_LIST, dto.UpdateRooms>??????????????????????????
export const updateRooms = createAction<dto.UpdateRooms>('@@rooms/SERVER/UPDATE_ROOMS_LIST')

// export type ConnectToRoomEmitAction = Action<RoomsTypes.CONNECT_TO_ROOM_EMIT, dto.ConnectToRoom>
export const connectToRoomEmitAction = createAction<dto.ConnectToRoom>('@@rooms/WEBSOCKET/CONNECT_TO_ROOM')

// export type ConnectToRoomSuccessAction = Action<RoomsTypes.CONNECT_TO_ROOM_SUCCESS, dto.ConnectToRoomSuccess>
export const connectToRoomSuccessAction = createAction<dto.ConnectToRoomSuccess>('@@rooms/SERVER/CONNECT_TO_ROOM_SUCCESS')

// export type UpdateGameAction = Action<GameTypes.UPDATE_GAME, dto.GameState>
export const updateGameAction = createAction<dto.GameState>('@@game/SERVER/UPDATE_GAME')

// export type ConnectToRoomErrorAction = Action<RoomsTypes.CONNECT_TO_ROOM_ERROR>
export const connectToRoomErrorAction = createAction('@@rooms/SERVER/CONNECT_TO_ROOM_ERROR')

// export type CreateRoomSuccessAction = Action<RoomsTypes.CREATE_ROOM_SUCCESS, dto.CreateRoomSuccess>
export const createRoomSuccessAction = createAction<dto.CreateRoomSuccess>('@@rooms/SERVER/CREATE_ROOM_SUCCESS')

// export type SetPlayerStatusEmitAction = Action<GameTypes.SET_PLAYER_STATUS_EMIT, dto.PlayerStatusInGame>
export const setPlayerStatusEmitAction = createAction<dto.PlayerStatusInGame>('@@game/WEBSOCKET/SET_PLAYER_STATUS')

// export type StartGameEmitAction = Action<GameplayTypes.START_GAME, dto.StartGame>
export const startGameEmitAction = createAction<dto.StartGame>('@@gameplay/WEBSOCKET/START_GAME')

// export type TakeFromLigrettoDeckAction = Action<GameplayTypes.TAKE_FROM_LIGRETTO_DECK, dto.TakeCardFromLigrettoDeck>
export const takeFromLigrettoDeckAction = createAction<dto.TakeCardFromLigrettoDeck>('@@gameplay/WEBSOCKET/TAKE_FROM_LIGRETTO_DECK')

// export type TakeFromStackDeckAction = Action<GameplayTypes.TAKE_FROM_STACK_DECK, dto.TakeCardFromStackDeck>
export const takeFromStackDeckAction = createAction<dto.TakeCardFromStackDeck>('@@gameplay/WEBSOCKET/TAKE_FROM_STACK_DECK')

// export type EndRoundAction = Action<GameplayTypes.END_ROUND, dto.GameResultsDTO>
export const endRoundAction = createAction<dto.GameResultsDTO>('@@gameplay/SERVER/END_ROUND')

// export type AddBotAction = Action<BotTypes.ADD_BOT_EMIT, dto.AddBotDTO>
export const addBotAction = createAction<dto.AddBotDTO>('@@bot/WEBSOCKET/ADD_BOT')

// export type RemoveBotAction = Action<BotTypes.REMOVE_BOT_EMIT, dto.RemoveBotDTO>
export const removeBotAction = createAction<dto.RemoveBotDTO>('@@bot/WEBSOCKET/REMOVE_BOT_EMIT')
