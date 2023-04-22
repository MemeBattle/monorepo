import React, { memo } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import { ROUTES } from './constants/routes'
import type { AuthRoutes } from './types/authRoutes'
import { LoginPage } from './pages/login/LoginPage'
import { RegisterPage } from './pages/register/RegisterPage'
import { ProfilePage } from './pages/profile/ProfilePage'
import { ConfirmEmailPage } from './pages/confirm'

import './styles.css'

export interface AppProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
  authRoutes?: AuthRoutes
}

export const App = memo<AppProps>(({ onLoginSucceeded, authRoutes = ROUTES }) => (
  <Routes>
    <Route path={ROUTES.LOGIN} element={<LoginPage onLoginSucceeded={onLoginSucceeded} authRoutes={authRoutes} />} />
    <Route path={ROUTES.REGISTER} element={<RegisterPage authRoutes={authRoutes} />} />
    <Route path={ROUTES.CONFIRM_EMAIL} element={<ConfirmEmailPage />} />
    <Route path={ROUTES.PROFILE} element={<ProfilePage onLoginSucceeded={onLoginSucceeded} />} />
    <Route element={<Navigate to={ROUTES.LOGIN} />} />
  </Routes>
))
