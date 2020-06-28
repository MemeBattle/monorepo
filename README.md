# MEMEBATTLE


```
yarn bootstrap
```

```
yarn start
```

```
lerna add <package> --scope @memebattle/memebattle
```

## Templates

Для базовых компонентов используемых в приложении рекомендуется использовать генерацию с помощью hygen

    yarn hygen component atoms --name "some button" --path "packages/ui/src"

Все доступные генераторы можно посмотреть командой

    yarn hygen

Именование yarn hygen generator name action name parameters

Для компонентов используется правило автоматического создания папки для типа компонента,
если мы не находимся сейчас в нужной папке.

Если была запущена такая команда

    yarn hygen component ligretto-ui-component --name "some component" --path "packages/ligretto-ui/src"

Тогда новый компонент будет создан в папке packages/ligretto-ui/src, будет создана новая папка
 или переиспользована существующая

Для того чтобы не указывать вручную пути каждый раз, можно настроить запуск внешней
утилиты в используемой ide для автоматической подстановки текущей директории

Нужно настроить в Settings -> Tools -> External tools по одной команде на каждый доступный шаблон

| Шаблон     | Program       | Arguments                        | Working dir      |
| ---------- | ------------- | -------------------------------- | ---------------- |
| ligretto-ui-component| node | "node_modules/hygen/dist/bin.js" | $ProjectFileDir$ |
|            |               | component                        |                  |
|            |               | ligretto-ui-component            |                  |
|            |               | --name                           |                  |
|            |               | "$Prompt$"                       |                  |
|            |               | --path                           |                  |
|            |               | $FileDirRelativeToProjectRoot$   |                  |
|            |               |                                  |                  |

Разделы

    Program
    Arguments
    Working dir


### ligretto-ui-component

    node

    "node_modules/hygen/dist/bin.js"
    component
    ligretto-ui-component
    --name
    "$Prompt$"
    --path
    $FileDirRelativeToProjectRoot$

    $ProjectFileDir$

Можно назначить горячие клавиши на генераторы или находить через действия по ctrl shift a