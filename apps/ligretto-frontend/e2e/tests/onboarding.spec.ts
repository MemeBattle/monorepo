import { test, expect, type Page } from '@playwright/test'
import { OnboardingPage } from '#pages/onboarding/OnboardingPage.page-object.ts'
import { OnboardingEvent, OnboardingStep } from '#features/onboarding/model/steps.ts'
import { ONBOARDING_SCRIPT } from '#features/onboarding/model/script.ts'

const expectStep = async (page: Page, step: OnboardingStep) => {
  await expect(page.getByTestId('OnboardingPage')).toHaveAttribute('data-onboarding-step', step)
}

/** Performs the interaction that fires each FSM event. */
const performEvent = async (onboarding: OnboardingPage, event: OnboardingEvent) => {
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
      await onboarding.getPlaygroundDeck(0).click()
      return
    case OnboardingEvent.PutFirstCard:
      await onboarding.getRowCard(0).click()
      await expect(onboarding.getRowCard(0)).toHaveAttribute('data-card-active', 'true')
      await onboarding.getPlaygroundDeck(0).click()
      return
    case OnboardingEvent.PutSecondCard: {
      const card = onboarding.getRowCard(1)
      await card.click()
      await expect(card).toHaveAttribute('data-card-active', 'true')
      await onboarding.getPlaygroundDeck(0).click()
      return
    }
    case OnboardingEvent.PutThirdCard:
      await onboarding.getRowCard(2).click()
      await expect(onboarding.getRowCard(2)).toHaveAttribute('data-card-active', 'true')
      await onboarding.getPlaygroundDeck(2).click()
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
const createScriptWalker = (page: Page, onboarding: OnboardingPage) => {
  let index = 0
  return async (until: OnboardingStep) => {
    while (index < ONBOARDING_SCRIPT.length) {
      const { event, step } = ONBOARDING_SCRIPT[index]
      index += 1
      await performEvent(onboarding, event)
      await expectStep(page, step)
      if (step === until) {
        return
      }
    }
    throw new Error(`Step ${until} is not on the canonical script`)
  }
}

test.describe('Onboarding', () => {
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

    await test.step('scripted moves reach the results', async () => {
      // The outline only introduces the zones, it is gone once the player acts
      await walkTo(OnboardingStep.FirstCard)
      await expect(onboarding.getOutline()).toBeHidden()

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
      await onboarding.getRowCard(1).click()
      await expectStep(page, OnboardingStep.OpponentTurn)

      await onboarding.getLigrettoDeckCard().click() // the second row slot is free — a ligretto card goes there
      await expect(onboarding.getRowCard(1)).toHaveText('5')

      await onboarding.getStackDeckCard().click() // flipping the stack triggers the opponent's green two
      await expectStep(page, OnboardingStep.OpponentTurnSecondCard)
    })

    await test.step('the green three and the final ligretto card end the round', async () => {
      await onboarding.getRowCard(2).click()
      await expect(onboarding.getRowCard(2)).toHaveAttribute('data-card-active', 'true')
      await expectStep(page, OnboardingStep.OpponentTurnSecondCard)

      await onboarding.getPlaygroundDeck(0).click() // the wrong pile does not advance
      await expectStep(page, OnboardingStep.OpponentTurnSecondCard)

      await onboarding.getPlaygroundDeck(2).click() // the green three frees a row slot
      await expectStep(page, OnboardingStep.FinalLigrettoCard)

      await onboarding.getLigrettoDeckCard().click() // the ligretto card into the row ends the round
      await expectStep(page, OnboardingStep.Result)
    })
  })
})
