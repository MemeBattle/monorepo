import { CamelCaseNamingStrategy } from '@adonisjs/lucid/orm'
import { BaseModel } from '@adonisjs/lucid/orm'
import { SimplePaginator } from '@adonisjs/lucid/database'

BaseModel.namingStrategy = new CamelCaseNamingStrategy()
SimplePaginator.namingStrategy = new CamelCaseNamingStrategy()
