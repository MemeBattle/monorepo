import { connectToRoomEmitAction } from '@memebattle/ligretto-shared'
import { Socket } from 'socket.io'
import { nanoid } from 'nanoid'

/**
 * Стратегия игры бота:
 * 1. Если можно положить карточку из открытых (row) на стол кладем, открываем новую (row) карту
 * 2. Если можно положить открытую карту из стека, то кладем, открываем новую карту стека
 * 3. Если нельзя положить карты, то открываем новые карты из стека, если можно, то [2], иначе [4]
 * 4. Пока нельзя положить карту, повторяем [1]
 *
 * TODO: В стартегию также нужно добавить зависимость от текущих открытых карт других игроков и ситуации на столе
 */

const botIntervalsByBotId = {}

const makeTurn = (socket: Socket, botId: string) => {
   botIntervalsByBotId[botId] = setInterval(() => makeTurn(socket, botId), 300)
}

const makeBot = (socket: Socket) => {
   const botId = nanoid()

   makeTurn(socket, botId)

  return { botId }
}

export const initBot = (socket: Socket, gameId: string) => {
   const bot = makeBot(socket)

   socket.emit('event', connectToRoomEmitAction({
      roomUuid: gameId,
      playerId: bot.botId
   }))
}

export const stopBot = (botId: string) => {
   clearInterval(botIntervalsByBotId[botId])
}
