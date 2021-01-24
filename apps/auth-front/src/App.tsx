import React from 'react'
import { BrowserRouter, Switch, Route, Redirect } from 'react-router-dom'
import { ROUTES } from './constants/routes'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ConfirmEmailPage } from './pages/ConfirmEmailPage'

import './styles.css'

function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}

export default App
