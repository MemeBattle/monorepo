import React from 'react';
import { BrowserRouter, Switch, Route, Redirect } from 'react-router-dom';
import { ROUTES } from './constants/routes'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'

import './styles.css';

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
        <Redirect to={ROUTES.LOGIN} />
      </Switch>
    </BrowserRouter>
  );
}

export default App;
