import React, { memo } from 'react'
import { HashRouter, Switch, Route, Redirect } from 'react-router-dom'
import { ROUTES } from './constants/routes'
import { LoginPage } from './pages/login/LoginPage'
import { RegisterPage } from './pages/register/RegisterPage'
import { ProfilePage } from './pages/profile/ProfilePage'
import { ConfirmEmailPage } from './pages/confirm'

import './styles.css'

export interface AppProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
}

export const App = memo<AppProps>(({ onLoginSucceeded }) => (
  <HashRouter>
    <Switch>
      <Route path={ROUTES.LOGIN} exact>
        <LoginPage onLoginSucceeded={onLoginSucceeded} />
      </Route>
      <Route path={ROUTES.REGISTER} exact>
        <RegisterPage />
      </Route>
      <Route path={ROUTES.CONFIRM_EMAIL} exact>
        <ConfirmEmailPage />
      </Route>
      <Route path={ROUTES.PROFILE} exact>
        <ProfilePage onLoginSucceeded={onLoginSucceeded} />
      </Route>
      <Redirect to={ROUTES.LOGIN} />
    </Switch>
  </HashRouter>
))
