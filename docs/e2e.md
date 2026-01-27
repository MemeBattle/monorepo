# E2E

## Installation

Before run playwright tests you have to install playwright browsers.
```
npx playwright install
```

## Local run

To run `Playwright Test Runner` for development purpose

```
pnpm e2e:start
```

> **NOTE:** Be sure you ran frontend and backend or only frontend provided that the frontend is connected to the deployed backend application locally and frontend application may be accessed by localhost url, which is defined in `./playwright.config.ts`

To run application use [instructions](./ligretto.md)

## Identifiers

`data-test-id` is attributes on all elements which using in tests. Scheme for create new data-test-id: page-block-element. Example:

```
data-test-id="RoomsList-Toolbar-SuspendButton"
```

## CI/CD

Make sure the version of @playwright/test in the root package.json matches the installed browsers version of the `npx playwright install` command. For example, if you see `"@playwright/test": "^1.28.0"` in package.json you have you use next command `npx playwright@1.28.0 install` in pipelines.
