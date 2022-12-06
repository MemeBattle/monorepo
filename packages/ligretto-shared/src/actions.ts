import type * as dto from './dto'
import { createAction } from '@reduxjs/toolkit'

export const techConnectToGame = createAction<dto.TechConnectToGame>('@@tech/WEBSOCKET/CONNECT_TO_GAME')

export const putCardAction = createAction<dto.PutCard>('@@gameplay/WEBSOCKET/PUT_CARD')

export const putCardFromStackOpenDeck = createAction<dto.PutCardFromStackOpenDeck>('@@gameplay/WEBSOCKET/PUT_CARD_FROM_STACK_OPEN_DECK')

export const getRoomsFinishAction = createAction<dto.GetRoomsFinish>('@@rooms/SERVER/GET_ROOMS_FINISH')

export const createRoomEmitAction = createAction<dto.CreateGame>('@@rooms/WEBSOCKET/CREATE_ROOM')

export const getRoomsEmitAction = createAction('@@rooms/WEBSOCKET/GET_ROOMS')

export const updateRooms = createAction<dto.UpdateRooms>('@@rooms/SERVER/UPDATE_ROOMS_LIST')

export const removeRoomAction = createAction<dto.RemoveRoom>('@@rooms/SERVER/REMOVE_ROOM_FROM_LIST')

export const connectToRoomEmitAction = createAction<dto.ConnectToRoom>('@@rooms/WEBSOCKET/CONNECT_TO_ROOM')

export const leaveFromRoomEmitAction = createAction('@@rooms/WEBSOCKET/LEAVE_FROM_ROOM')

export const connectToRoomSuccessAction = createAction<dto.ConnectToRoomSuccess>('@@rooms/SERVER/CONNECT_TO_ROOM_SUCCESS')

export const updateGameAction = createAction<dto.GameState>('@@game/SERVER/UPDATE_GAME')

export const connectToRoomErrorAction = createAction('@@rooms/SERVER/CONNECT_TO_ROOM_ERROR')

export const createRoomSuccessAction = createAction<dto.CreateRoomSuccess>('@@rooms/SERVER/CREATE_ROOM_SUCCESS')

export const createRoomErrorAction = createAction<dto.CreateRoomError>('@@rooms/SERVER/CREATE_ROOM_ERROR')

export const setPlayerStatusEmitAction = createAction<dto.PlayerStatusInGame>('@@game/WEBSOCKET/SET_PLAYER_STATUS')

export const startGameEmitAction = createAction<dto.StartGame>('@@gameplay/WEBSOCKET/START_GAME')

export const takeFromLigrettoDeckAction = createAction<dto.TakeCardFromLigrettoDeck>('@@gameplay/WEBSOCKET/TAKE_FROM_LIGRETTO_DECK')

export const takeFromStackDeckAction = createAction<dto.TakeCardFromStackDeck>('@@gameplay/WEBSOCKET/TAKE_FROM_STACK_DECK')

export const endRoundAction = createAction<dto.GameResultsDTO>('@@gameplay/SERVER/END_ROUND')

export const addBotAction = createAction<dto.AddBotDTO>('@@bot/WEBSOCKET/ADD_BOT')

export const removeBotAction = createAction<dto.RemoveBotDTO>('@@bot/WEBSOCKET/REMOVE_BOT_EMIT')

export const userJoinToRoomAction = createAction<dto.UserJoinToRoomDTO>('@@game/SERVER/USER_JOIN_TO_ROOM')
