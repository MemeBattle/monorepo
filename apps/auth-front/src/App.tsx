import React, { memo } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
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
  <Routes>
    <Route path={ROUTES.LOGIN} element={<LoginPage onLoginSucceeded={onLoginSucceeded} />} />
    <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
    <Route path={ROUTES.CONFIRM_EMAIL} element={<ConfirmEmailPage />} />
    <Route path={ROUTES.PROFILE} element={<ProfilePage onLoginSucceeded={onLoginSucceeded} />} />
    <Route element={<Navigate to={ROUTES.LOGIN} />} />
  </Routes>
))
