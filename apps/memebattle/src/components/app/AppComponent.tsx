import React from 'react'
import { Switch, Route } from 'react-router'
import { routes } from 'constants.ts'
import { MainPage } from 'pages/main'
import { LoginPage, RegistrationPage } from 'pages/auth'

const App: React.FC = () => (
  <Switch>
    <Route exact path={routes.MAIN} component={MainPage} />
    <Route exact path={routes.SIGN_IN} component={LoginPage} />
    <Route exact path={routes.SIGN_UP} component={RegistrationPage} />
  </Switch>
)

export default App
