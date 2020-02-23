import { injectable } from 'inversify'
import { Controller } from './controller'

@injectable()
export class GameplayController extends Controller {
  handlers = {}
}
