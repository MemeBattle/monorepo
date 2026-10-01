import type { Locator, Page } from '@playwright/test'

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

  /** Hand-drawn loop circling the zone the current step talks about */
  getOutline() {
    return this.page.getByTestId('OnboardingPage-Outline')
  }

  getRowCard(index: 0 | 1 | 2) {
    return this.page.getByTestId(`OnboardingPage-RowCard-${index}`).getByRole('button')
  }

  getPlaygroundDeck(index: number) {
    return this.page.getByTestId(`Playground-Deck-${index}`)
  }

  /** The deck the onboarding points at once the card the step expects is picked */
  getHighlightedPlaygroundDeck() {
    return this.page.locator('[data-test-id^="Playground-Deck-"][data-drop-valid]')
  }

  /** Presses on the card, moves past the drag threshold in small steps and releases over the target */
  async dragCard(card: Locator, target: Locator) {
    const from = await card.boundingBox()
    const to = await target.boundingBox()
    if (!from || !to) {
      throw new Error('Drag source or target is not rendered')
    }
    await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await this.page.mouse.down()
    await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await this.page.mouse.up()
  }

  getLigrettoDeckCard() {
    return this.page.getByTestId('OnboardingPage-Ligretto').getByRole('button')
  }

  /** Face-down deck in hand: clicking flips cards */
  getStackDeckCard() {
    return this.page.getByTestId('OnboardingPage-Stack-Deck').getByRole('button')
  }

  /** Open card of the deck in hand: clicking selects it for placement */
  getStackOpenDeckCard() {
    return this.page.getByTestId('OnboardingPage-Stack-OpenDeck').getByRole('button')
  }

  getFinishButton() {
    return this.page.getByTestId('OnboardingPage-FinishButton')
  }
}
