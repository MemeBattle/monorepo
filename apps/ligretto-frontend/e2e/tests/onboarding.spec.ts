import { test, expect, type Page } from '@playwright/test'
import { OnboardingPage } from '#pages/onboarding/OnboardingPage.page-object.ts'
import { OnboardingEvent, OnboardingStep } from '#features/onboarding/model/steps.ts'
import { ONBOARDING_SCRIPT } from '#features/onboarding/model/script.ts'
import { stubAuthMe } from '../lib/stubAuthMe.ts'

/** Any free deck takes the first one; the e2e opens the blue pile away from the first deck on purpose. */
const BLUE_PILE_DECK = 5

const expectStep = async (page: Page, step: OnboardingStep) => {
  await expect(page.getByTestId('OnboardingPage')).toHaveAttribute('data-onboarding-step', step)
}

/** Performs the interaction that fires each FSM event. */
const performEvent = async (onboarding: OnboardingPage, event: OnboardingEvent, bluePileDeck: number) => {
  switch (event) {
    case OnboardingEvent.NextStep:
      await onboarding.getNextButton().click()
      return
    case OnboardingEvent.NextStackCard:
      await onboarding.getStackDeckCard().click()
      return
    case OnboardingEvent.PutStackCard:
      await onboarding.getStackOpenDeckCard().click()
      await expect(onboarding.getStackOpenDeckCard()).toHaveAttribute('data-card-active', 'true')
      await onboarding.getHighlightedPlaygroundDeck().first().click()
      return
    case OnboardingEvent.PutFirstCard:
      await onboarding.getRowCard(0).click()
      await expect(onboarding.getRowCard(0)).toHaveAttribute('data-card-active', 'true')
      await expect(onboarding.getHighlightedPlaygroundDeck()).toHaveCount(12) // a one opens any free deck
      await onboarding.getPlaygroundDeck(bluePileDeck).click()
      return
    case OnboardingEvent.PutSecondCard: {
      const card = onboarding.getRowCard(1)
      await card.click()
      await expect(card).toHaveAttribute('data-card-active', 'true')
      await onboarding.getHighlightedPlaygroundDeck().first().click()
      return
    }
    case OnboardingEvent.PutThirdCard:
      await onboarding.getRowCard(2).click()
      await expect(onboarding.getRowCard(2)).toHaveAttribute('data-card-active', 'true')
      await onboarding.getHighlightedPlaygroundDeck().first().click()
      return
    case OnboardingEvent.PutLigretto:
      await onboarding.getLigrettoDeckCard().click()
      return
  }
}

/**
 * Replays the canonical script by clicking the control of each event and
 * asserting the step it lands in. Keeps a cursor, so consecutive calls
 * continue from where the previous one stopped.
 */
const createScriptWalker = (page: Page, onboarding: OnboardingPage, bluePileDeck = BLUE_PILE_DECK) => {
  let index = 0
  return async (until: OnboardingStep) => {
    while (index < ONBOARDING_SCRIPT.length) {
      const { event, step } = ONBOARDING_SCRIPT[index]
      index += 1
      await performEvent(onboarding, event, bluePileDeck)
      await expectStep(page, step)
      if (step === until) {
        return
      }
    }
    throw new Error(`Step ${until} is not on the canonical script`)
  }
}

test.describe('Onboarding', () => {
  // Each test clicks through the whole onboarding, the replay test twice; on a loaded runner that outgrows the default 30s.
  test.describe.configure({ timeout: 60_000 })
  test.beforeEach(({ page }) => stubAuthMe(page))

  test('walks the canonical script from the first step to the results', async ({ page }) => {
    const onboarding = new OnboardingPage(page)
    const walkTo = createScriptWalker(page, onboarding)
    await onboarding.visit()

    await test.step('initial step', async () => {
      await expectStep(page, OnboardingStep.Opponents)
    })

    await test.step('intro steps outline the zones', async () => {
      await walkTo(OnboardingStep.Stack)
      await expect(onboarding.getOutline()).toBeVisible()
      await walkTo(OnboardingStep.Ligretto)
      await expect(onboarding.getOutline()).toBeVisible()
    })

    await test.step('scripted moves end the round', async () => {
      // The outline only introduces the zones, it is gone once the player acts
      await walkTo(OnboardingStep.FirstCard)
      await expect(onboarding.getOutline()).toBeHidden()

      await walkTo(OnboardingStep.RoundEnd)
    })

    await test.step('the round end shows the board with the empty ligretto deck before the results', async () => {
      await expect(page.getByText('Раунд закончился: ты выложил все карты из колоды Лигретто!')).toBeVisible()
      await expect(onboarding.getLigrettoDeckCount()).toHaveText('В колоде: 0')
      await expect(onboarding.getOutline()).toBeVisible()
      // Blue opened deck 5, the red one took the first free deck, the opponent's green pile the next one
      await expect(onboarding.getPlaygroundDeck(1)).toBeVisible()
      await expect(onboarding.getPlaygroundDeck(1)).toHaveText('5')
      await expect(page.getByTestId('PlayersScoresTable')).toBeHidden()

      await walkTo(OnboardingStep.Result)
    })

    await test.step('result screen', async () => {
      await expect(page.getByTestId('PlayersScoresTable')).toBeVisible()

      await onboarding.getFinishButton().click()
      await expect(page).toHaveURL('/')
    })
  })

  test('free play: the cycled-stack hint and the optional ligretto move', async ({ page }) => {
    const onboarding = new OnboardingPage(page)
    const walkTo = createScriptWalker(page, onboarding)
    await onboarding.visit()
    await walkTo(OnboardingStep.GameStarted)

    await test.step('stack exhaustion shows the hint once', async () => {
      await onboarding.getStackDeckCard().click() // take the last card
      await onboarding.getStackDeckCard().click() // deck is empty — the hint appears
      await expectStep(page, OnboardingStep.GameStartedCycledInfo)

      await onboarding.getStackDeckCard().click() // the deck is re-flipped
      await expectStep(page, OnboardingStep.GameStarted)
    })

    await test.step('opponent answers and the optional ligretto move fills the free slot', async () => {
      await onboarding.dragCard(onboarding.getRowCard(1), onboarding.getPlaygroundDeck(BLUE_PILE_DECK)) // a one does not go on the blue pile
      await expectStep(page, OnboardingStep.GameStarted)
      await onboarding.dragCard(onboarding.getRowCard(1), onboarding.getPlaygroundDeck(0)) // it starts a pile of its own
      await expectStep(page, OnboardingStep.OpponentTurn)

      await onboarding.getLigrettoDeckCard().click() // the second row slot is free — a ligretto card goes there
      await expect(onboarding.getRowCard(1)).toHaveText('5')

      await onboarding.getStackDeckCard().click() // flipping the stack triggers the opponent's green two
      await expectStep(page, OnboardingStep.OpponentTurnSecondCard)
    })

    await test.step('the green three, the green five and the final ligretto card end the round', async () => {
      await onboarding.getRowCard(2).click()
      await expect(onboarding.getRowCard(2)).toHaveAttribute('data-card-active', 'true')
      await expectStep(page, OnboardingStep.OpponentTurnSecondCard)

      await onboarding.getPlaygroundDeck(0).click() // the wrong pile does not advance
      await expectStep(page, OnboardingStep.OpponentTurnSecondCard)

      // The blue pile is on its deck and the red one took the first deck, so the opponent opened the second
      await expect(onboarding.getPlaygroundDeck(1)).toHaveAttribute('data-drop-valid')
      await onboarding.getPlaygroundDeck(1).click() // the green three goes on, the opponent answers with the green four
      // The green five is already in the row, so it is played straight away
      await expectStep(page, OnboardingStep.AdditionalRowCard)
      await expect(onboarding.getPlaygroundDeck(1)).toHaveText('4')

      await onboarding.dragCard(onboarding.getRowCard(1), onboarding.getPlaygroundDeck(0)) // the green five does not go on the red pile
      await expectStep(page, OnboardingStep.AdditionalRowCard)
      await onboarding.dragCard(onboarding.getRowCard(1), onboarding.getPlaygroundDeck(1))
      await expectStep(page, OnboardingStep.FinalLigrettoCard)
      await expect(onboarding.getPlaygroundDeck(1)).toHaveText('5')

      await onboarding.getLigrettoDeckCard().click() // one ligretto card is still left after this one
      await expectStep(page, OnboardingStep.FinalLigrettoCard)
      await onboarding.getLigrettoDeckCard().click() // the last ligretto card into the row ends the round
      await expectStep(page, OnboardingStep.RoundEnd)
      await expect(onboarding.getLigrettoDeckCount()).toHaveText('В колоде: 0')

      await onboarding.getNextButton().click()
      await expectStep(page, OnboardingStep.Result)
    })
  })

  test('replay from the results starts the onboarding over with a fresh game', async ({ page }) => {
    const onboarding = new OnboardingPage(page)
    await onboarding.visit()
    await createScriptWalker(page, onboarding)(OnboardingStep.Result)

    await test.step('the replay button brings back the first step with the initial cards', async () => {
      await onboarding.getReplayButton().click()

      await expectStep(page, OnboardingStep.Opponents)
      await expect(page).toHaveURL('/onboarding')
      await expect(page.getByTestId('PlayersScoresTable')).toBeHidden()
      await expect(onboarding.getLigrettoDeckCount()).toHaveText('В колоде: 5')
      await expect(onboarding.getRowCard(0)).toHaveText('1')
      await expect(page.locator('[data-test-id^="Playground-Deck-"]')).toHaveText(Array.from({ length: 12 }, () => ''))
    })

    await test.step('a second run on other decks reaches the results again', async () => {
      // Blue on the first deck moves the red pile and the opponent's green pile one deck further than in the first run
      await createScriptWalker(page, onboarding, 0)(OnboardingStep.Result)
      await expect(onboarding.getPlaygroundDeck(2)).toHaveText('5')
      await expect(page.getByTestId('PlayersScoresTable')).toBeVisible()
    })
  })
})
