import React from 'react'
import { HashRouter, Switch, Route, Redirect } from 'react-router-dom'
import { ROUTES } from './constants/routes'
import { LoginPage } from './pages/login/LoginPage'
import { RegisterPage } from './pages/register/RegisterPage'
import { ConfirmEmailPage } from './pages/confirm/ConfirmEmailPage'

import './styles.css'

export function App() {
  return (
    <HashRouter>
      <Switch>
        <Route path={ROUTES.LOGIN} exact>
          <LoginPage />
        </Route>
        <Route path={ROUTES.REGISTER} exact>
          <RegisterPage />
        </Route>
        <Route path={ROUTES.CONFIRM_EMAIL} exact>
          <ConfirmEmailPage />
        </Route>
        <Redirect to={ROUTES.LOGIN} />
      </Switch>
    </HashRouter>
  )
}
