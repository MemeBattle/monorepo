import type { Page } from '@playwright/test'

export class OnboardingPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async visit() {
    await this.page.goto('/onboarding')
  }

  getRoot() {
    return this.page.getByTestId('OnboardingPage')
  }

  getNextButton() {
    return this.page.getByTestId('OnboardingPage-NextButton')
  }

  getRowCard(index: 0 | 1 | 2) {
    return this.page.getByTestId(`OnboardingPage-RowCard-${index}`).getByRole('button')
  }

  getLigrettoDeckCard() {
    return this.page.getByTestId('OnboardingPage-Ligretto').getByRole('button')
  }

  /** Face-down deck in hand: clicking flips cards */
  getStackDeckCard() {
    return this.page.getByTestId('OnboardingPage-Stack-Deck').getByRole('button')
  }

  /** Open card of the deck in hand: clicking puts it on the playground */
  getStackOpenDeckCard() {
    return this.page.getByTestId('OnboardingPage-Stack-OpenDeck').getByRole('button')
  }

  getFinishButton() {
    return this.page.getByTestId('OnboardingPage-FinishButton')
  }
}
