/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| This file is dedicated for defining HTTP routes. A single file is enough
| for majority of projects, however you can define routes in different
| files and just make sure to import them inside this file. For example
|
| Define routes in following two files
| ├── start/routes/cart.ts
| ├── start/routes/customer.ts
|
| and then import them inside `start/routes/index.ts` as follows
|
| import './cart'
| import './customer'
|
*/

import router from '@adonisjs/core/services/router'

const HealthChecksController = () => import('#controllers/HealthChecksController')

const UsersController = () => import('#controllers/Http/UsersController')
const GamesController = () => import('#controllers/Http/GamesController')
const AuthController = () => import('#controllers/Http/AuthController')

router
  .group(() => {
    router.get('/', async () => ({ hello: 'world' }))

    router.get('/users', [UsersController, 'index'])

    router.post('/games', [GamesController, 'create'])
    router.get('/games', [GamesController, 'index'])
    router.post('/games/:id/rounds', [GamesController, 'saveRound']).where('id', router.matchers.uuid())

    router.get('/auth/me', [AuthController, 'me'])
    router.get('/auth/sign-in', [AuthController, 'signIn'])
    router.get('/auth/callback', [AuthController, 'callback'])
    router.get('/auth/logout', [AuthController, 'logout'])
  })
  .prefix('/api')

router.get('/health', [HealthChecksController])
