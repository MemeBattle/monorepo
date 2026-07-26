import { test, expect, type Page } from '@playwright/test'
import { OnboardingPage } from '#pages/onboarding/OnboardingPage.page-object.ts'

const expectStep = async (page: Page, step: string) => {
  await expect(page.getByTestId('OnboardingPage')).toHaveAttribute('data-onboarding-step', step)
}

test.describe('Onboarding', () => {
  test('User completes the whole onboarding flow', async ({ page }) => {
    const onboarding = new OnboardingPage(page)
    await onboarding.visit()

    // Intro steps: walk through with the "next" button
    await expectStep(page, 'opponents')
    await expect(page.getByText('Это твои соперники')).toBeVisible()
    await onboarding.getNextButton().click()

    await expectStep(page, 'playground')
    await expect(page.getByText('Это общий стол')).toBeVisible()
    await onboarding.getNextButton().click()

    await expectStep(page, 'cards')
    await expect(page.getByText('Это твои карты', { exact: true })).toBeVisible()
    await onboarding.getNextButton().click()

    await expectStep(page, 'stack')
    await expect(page.getByText('Это твои карты в руке')).toBeVisible()
    await expect(onboarding.getOutline()).toBeVisible()
    await onboarding.getNextButton().click()

    await expectStep(page, 'row')
    await expect(page.getByText('Это твои карты в ряду')).toBeVisible()
    await expect(onboarding.getOutline()).toBeVisible()
    await onboarding.getNextButton().click()

    await expectStep(page, 'ligretto')
    await expect(page.getByText('Это твоя колода ligretto')).toBeVisible()
    await expect(onboarding.getOutline()).toBeVisible()
    await onboarding.getNextButton().click()

    // Interactive part: put cards on the playground
    await expectStep(page, 'firstCard')
    // The outline only introduces the zones, it is gone once the player acts
    await expect(onboarding.getOutline()).toBeHidden()
    await onboarding.getRowCard(0).click()

    await expectStep(page, 'ligrettoCard')
    await onboarding.getLigrettoDeckCard().click()

    await expectStep(page, 'stackCard')
    await onboarding.getStackDeckCard().click()

    await expectStep(page, 'stackUnavailableCard')
    await onboarding.getStackDeckCard().click()

    await expectStep(page, 'stackAvailableCard')
    await onboarding.getStackOpenDeckCard().click()

    await expectStep(page, 'rowAvailableCard')
    await onboarding.getRowCard(1).click()

    await expectStep(page, 'ligrettoAvailableCard')
    await onboarding.getLigrettoDeckCard().click()

    // Free play: flip the stack deck until the cycled-info hint appears
    await expectStep(page, 'gameStarted')
    await onboarding.getStackDeckCard().click() // take the last card
    await onboarding.getStackDeckCard().click() // deck is empty — the hint appears

    await expectStep(page, 'gameStartedCycledInfo')
    await expect(page.getByText('Карты в стеке закончились')).toBeVisible()
    await onboarding.getStackDeckCard().click() // the deck is re-flipped

    await expectStep(page, 'gameStarted')
    await onboarding.getRowCard(1).click()

    await expectStep(page, 'opponentTurn')
    await expect(page.getByText('Соперник выложил карту на стол')).toBeVisible()
    await onboarding.getLigrettoDeckCard().click() // the second row slot is free — a ligretto card goes there
    await expect(onboarding.getRowCard(1)).toHaveText('5')
    await onboarding.getStackDeckCard().click() // flipping the stack triggers the opponent's green two

    await expectStep(page, 'opponentTurnSecondCard')
    await expect(page.getByText('Соперник выложил зелёную двойку')).toBeVisible()
    await onboarding.getRowCard(2).click() // the green three frees a row slot

    await expectStep(page, 'finalLigrettoCard')
    await expect(page.getByText('Освободилось место в ряду')).toBeVisible()
    await onboarding.getLigrettoDeckCard().click() // the ligretto card into the row ends the round

    // Result screen
    await expectStep(page, 'result')
    await expect(page.getByText('Раунд 1. Результаты')).toBeVisible()
    await expect(page.getByTestId('PlayersScoresTable')).toBeVisible()

    await onboarding.getFinishButton().click()
    await expect(page).toHaveURL('/')
  })
})
