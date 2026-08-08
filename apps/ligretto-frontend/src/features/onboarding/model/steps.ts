// Dependency-free on purpose: the e2e test imports the steps and the script into
// the Playwright Node runtime, where workspace packages are not built.

export enum OnboardingStep {
  Opponents = 'opponents',
  Playground = 'playground',
  Cards = 'cards',
  Stack = 'stack',
  Row = 'row',
  Ligretto = 'ligretto',
  FirstCard = 'firstCard',
  LigrettoCard = 'ligrettoCard',
  StackCard = 'stackCard',
  StackUnavailableCard = 'stackUnavailableCard',
  StackAvailableCard = 'stackAvailableCard',
  RowAvailableCard = 'rowAvailableCard',
  LigrettoAvailableCard = 'ligrettoAvailableCard',
  GameStarted = 'gameStarted',
  GameStartedCycledInfo = 'gameStartedCycledInfo',
  OpponentTurn = 'opponentTurn',
  OpponentTurnSecondCard = 'opponentTurnSecondCard',
  OpponentTurnCycledInfo = 'opponentTurnCycledInfo',
  FinalLigrettoCard = 'finalLigrettoCard',
  Result = 'result',
}

export enum OnboardingEvent {
  NextStep = 'nextStep',
  NextStackCard = 'nextStackCard',
  PutStackCard = 'putStackCard',
  PutFirstCard = 'putFirstCard',
  PutSecondCard = 'putSecondCard',
  PutThirdCard = 'putThirdCard',
  PutLigretto = 'putLigretto',
}
