import 'reflect-metadata'
import { Container } from 'inversify'
import test from 'ava'

import { CardsDeckService, CardsDeckRepository } from './'
import { CardColors } from './card'

const testCards = [{ color: CardColors.red, value: '1' }]

let container: Container

test.before(() => {
  container = new Container()
  container.bind<CardsDeckRepository>(CardsDeckRepository).toSelf()
  container.bind<CardsDeckService>(CardsDeckService).toSelf()
})

test('Should use multiply repo', t => {
  const cardsDeckService1 = container.get(CardsDeckService)
  const cardsDeckService2 = container.get(CardsDeckService)

  cardsDeckService1.initCards(testCards)
  cardsDeckService2.initCards([])

  t.deepEqual(cardsDeckService1.getCards(), testCards)
  t.deepEqual(cardsDeckService2.getCards(), [])
})

test('Should working as a stack', t => {
  const cardsDeckService = container.get(CardsDeckService)

  cardsDeckService.addCard({ color: CardColors.yellow, value: '1' })
  cardsDeckService.addCard({ color: CardColors.red, value: '2' })
  cardsDeckService.addCard({ color: CardColors.blue, value: '3' })

  t.deepEqual(cardsDeckService.drawCard(), { color: CardColors.blue, value: '3' })
  t.deepEqual(cardsDeckService.drawCard(), { color: CardColors.red, value: '2' })
  t.deepEqual(cardsDeckService.drawCard(), { color: CardColors.yellow, value: '1' })
})
