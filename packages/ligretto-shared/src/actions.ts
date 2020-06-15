import * as dto from './dto'
import { createAction, Action } from '@memebattle/redux-utils'

export enum RoomsTypes {
  SEARCH_ROOMS_FINISH = '@@rooms/SERVER/SEARCH_ROOMS_FINISH',
  CREATE_ROOM_EMIT = '@@rooms/WEBSOCKET/CREATE_ROOM',
  CREATE_ROOM_SUCCESS = '@@rooms/SERVER/CREATE_ROOM_SUCCESS',
  SEARCH_ROOMS_EMIT = '@@rooms/WEBSOCKET/SEARCH_ROOMS',
  UPDATE_ROOMS_LIST = '@@rooms/SERVER/UPDATE_ROOMS_LIST',
  CONNECT_TO_ROOM_EMIT = '@@rooms/WEBSOCKET/CONNECT_TO_ROOM',
  CONNECT_TO_ROOM_SUCCESS = '@@rooms/SERVER/CONNECT_TO_ROOM_SUCCESS',
  CONNECT_TO_ROOM_ERROR = '@@rooms/SERVER/CONNECT_TO_ROOM_ERROR',
}

export enum GameTypes {
  UPDATE_GAME = '@@game/SERVER/UPDATE_GAME',
  SET_PLAYER_STATUS_EMIT = '@@game/WEBSOCKET/SET_PLAYER_STATUS',
}

export enum GameplayTypes {
  START_GAME = '@@gameplay/WEBSOCKET/START_GAME',
  END_GAME = '@@gameplay/END_GAME',
  UPDATE_GAME = '@@gameplay/SERVER/UPDATE_GAME',

  PUT_CARD = '@@gameplay/WEBSOCKET/PUT_CARD',
  PUT_CARD_FROM_STACK_OPEN_DECK = '@@gameplay/WEBSOCKET/PUT_CARD_FROM_STACK_OPEN_DECK',
  TAKE_FROM_STACK_DECK = '@@gameplay/WEBSOCKET/TAKE_FROM_STACK_DECK',
  TAKE_FROM_LIGRETTO_DECK = '@@gameplay/WEBSOCKET/TAKE_FROM_LIGRETTO_DECK',
}

export type PutCardAction = Action<GameplayTypes.PUT_CARD, dto.PutCard>
export const putCardAction = createAction<PutCardAction>(GameplayTypes.PUT_CARD)

export type PutCardFromStackOpenDeck = Action<GameplayTypes.PUT_CARD_FROM_STACK_OPEN_DECK>
export const putCardFromStackOpenDeck = createAction<PutCardFromStackOpenDeck>(GameplayTypes.PUT_CARD_FROM_STACK_OPEN_DECK)

export type SearchRoomsFinishAction = Action<RoomsTypes.SEARCH_ROOMS_FINISH, dto.SearchRoomsFinish>
export const searchRoomsFinishAction = createAction<SearchRoomsFinishAction>(RoomsTypes.SEARCH_ROOMS_FINISH)

export type CreateRoomEmitAction = Action<RoomsTypes.CREATE_ROOM_EMIT, dto.CreateGame>
export const createRoomEmitAction = createAction<CreateRoomEmitAction>(RoomsTypes.CREATE_ROOM_EMIT)

export type SearchRoomsEmitAction = Action<RoomsTypes.SEARCH_ROOMS_EMIT, dto.SearchRooms>
export const searchRoomsEmitAction = createAction<SearchRoomsEmitAction>(RoomsTypes.SEARCH_ROOMS_EMIT)

export type UpdateRooms = Action<RoomsTypes.UPDATE_ROOMS_LIST, dto.UpdateRooms>
export const updateRooms = createAction<UpdateRooms>(RoomsTypes.UPDATE_ROOMS_LIST)

export type ConnectToRoomEmitAction = Action<RoomsTypes.CONNECT_TO_ROOM_EMIT, dto.ConnectToRoom>
export const connectToRoomEmitAction = createAction<ConnectToRoomEmitAction>(RoomsTypes.CONNECT_TO_ROOM_EMIT)

export type ConnectToRoomSuccessAction = Action<RoomsTypes.CONNECT_TO_ROOM_SUCCESS, dto.ConnectToRoomSuccess>
export const connectToRoomSuccessAction = createAction<ConnectToRoomSuccessAction>(RoomsTypes.CONNECT_TO_ROOM_SUCCESS)

export type UpdateGameAction = Action<GameTypes.UPDATE_GAME, dto.GameState>
export const updateGameAction = createAction<UpdateGameAction>(GameTypes.UPDATE_GAME)

export type ConnectToRoomErrorAction = Action<RoomsTypes.CONNECT_TO_ROOM_ERROR>
export const connectToRoomErrorAction = createAction<ConnectToRoomErrorAction>(RoomsTypes.CONNECT_TO_ROOM_ERROR)

export type CreateRoomSuccessAction = Action<RoomsTypes.CREATE_ROOM_SUCCESS, dto.CreateRoomSuccess>
export const createRoomSuccessAction = createAction<CreateRoomSuccessAction>(RoomsTypes.CREATE_ROOM_SUCCESS)

export type SetPlayerStatusEmitAction = Action<GameTypes.SET_PLAYER_STATUS_EMIT, dto.PlayerStatusInGame>
export const setPlayerStatusEmitAction = createAction<SetPlayerStatusEmitAction>(GameTypes.SET_PLAYER_STATUS_EMIT)

export type StartGameEmitAction = Action<GameplayTypes.START_GAME, dto.StartGame>
export const startGameEmitAction = createAction<StartGameEmitAction>(GameplayTypes.START_GAME)

export type TakeFromLigrettoDeckAction = Action<GameplayTypes.TAKE_FROM_LIGRETTO_DECK, dto.TakeCardFromLigrettoDeck>
export const takeFromLigrettoDeckAction = createAction<TakeFromLigrettoDeckAction>(GameplayTypes.TAKE_FROM_LIGRETTO_DECK)
