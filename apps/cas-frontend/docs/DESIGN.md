# Design

The visual and UX brief for the CAS screens. Mockups live on the design
canvas: <https://claude.ai/code/artifact/1d4bd756-2e2b-427c-aa1f-2aa21fa2286d>
(page "Экраны" holds every screen state; page "Направления" keeps the two
rejected directions for the record). This document is the written half:
decisions, tokens, flows and copy. When the two disagree, fix both.

## Decisions

**Brand: MemeBattle (direction A).** The sign-in screen is the front door of
the whole ecosystem and replaces `apps/auth-front`, so it inherits the brand
rather than looking like a neutral identity utility: the real logo from
`packages/ui`, its yellow and dark teal, a warm off-white ground, rounded
shapes. Rejected: a dark "vault" look (reads as security, but colder than the
brand and a single dark theme) and a neutral card layout in the blog's
language (familiar, but characterless).

**Typeface: Nunito** (Google Fonts, weights 500/700/800), fallback
`'Trebuchet MS', 'Segoe UI', sans-serif`. The blog's Gravity and Acherus Feral
were considered and not taken: Nunito's rounded forms match the logo's
lettering, it has Cyrillic, and it costs nothing to ship.

**Mobile first, one column everywhere.** Every screen is a single centred
column; on desktop it is the same column at 420px max width on the same
ground. There is no separate desktop layout.

**Errors stay on the screen that produced them.** A cancelled ceremony, an
unknown passkey, a rejected name or an unsupported authenticator render as an
alert above the form, the form keeps its values, and the primary action is
still there. Nothing navigates away on failure and no raw exception text is
shown (see `CODE.md`, "API access").

**No component library.** The pieces below are built in `src/shared/ui`
(#710) with Tailwind utilities.

## Tokens

Names are the `@theme` variables to declare in `src/app/styles.css`.

| Token                   | Value     | Use                                                    |
| ----------------------- | --------- | ------------------------------------------------------ |
| `--color-ground`        | `#FFFCF0` | page background                                        |
| `--color-surface`       | `#FFFFFF` | inputs, cards, dialogs                                 |
| `--color-ink`           | `#0D2F39` | primary text, icons, focus ring                        |
| `--color-ink-muted`     | `#4A6570` | secondary text, labels                                 |
| `--color-ink-hint`      | `#9AA9B0` | placeholders, footer, disabled icons                   |
| `--color-line`          | `#E6DFC4` | input and card borders                                 |
| `--color-line-soft`     | `#F1ECD8` | row separators, disabled button fill                   |
| `--color-accent`        | `#FCE26B` | primary button, nudge border                           |
| `--color-accent-shadow` | `#E3C33A` | 4px hard shadow under the primary button               |
| `--color-accent-tint`   | `#FFF6C7` | nudge card, icon chips, pending button                 |
| `--color-danger`        | `#B8321F` | error text, danger button, error border tint `#F3C2B8` |
| `--color-danger-tint`   | `#FDECE8` | alert background                                       |
| `--color-danger-shadow` | `#8A2416` | hard shadow under the danger button                    |

Type: Nunito. Headline 30/800 (sign-in, create account), 22/800 (dashboard
name, dialog title), 16/800 row titles, 16/500 body, 15/500 secondary, 13/700
labels, 12/700 uppercase with 0.14em tracking for the footer and section
titles.

Radii: inputs 14px, buttons 16px, cards and dialogs 20px, icon chips and
small controls 12px. Control heights: inputs 52px, primary buttons 56px,
secondary and inline buttons 44px. Nothing tappable is under 44px.

Primary button: accent fill, ink text, `0 4px 0 accent-shadow`. Pending
state: accent-tint fill, muted text, a spinner, no shadow. Disabled:
line-soft fill, hint text. Danger: danger fill, white text, danger-shadow.
Secondary: surface fill, 2px line border.

Icons: inline SVG, 24px grid, 1.8px stroke, round caps, `currentColor`. No
emoji anywhere in the UI.

## Screens and states

Every screen ends with the footer `CAS.MEMS.FUN` in hint colour. Copy is
Russian; the strings below are the ones on the canvas and are the source for
the code.

### Sign-in (`/sign-in`)

Hero: logo 112px, "Вход в MemeBattle", "Без пароля. Один пасскей для всех
игр." One field labelled "Пасскей" with placeholder "Браузер предложит
сохранённый": it exists for conditional mediation
(`autocomplete="username webauthn"`), the browser anchors its passkey
autofill to it, the user never types into it. Primary "Войти с пасскеем".
Below: "Нет аккаунта? Создать".

States:

- **Pending** (ceremony started): button shows a spinner and "Подтвердите
  пасскей…"; below it "Следуйте подсказке браузера или телефона. Окно можно
  закрыть, тогда вход отменится."
- **Cancelled** (`NotAllowedError`, timeout): alert "Вход отменён" /
  "Окно подтверждения закрылось или вышло время. Ничего не сломалось,
  попробуйте ещё раз."
- **Unknown passkey** (`invalid_credential`): alert "Этот пасскей здесь не
  зарегистрирован" / "Возможно, он от другого сайта, или аккаунта ещё нет."
  with the link "Создать аккаунт"; the button reads "Выбрать другой пасскей".

### Create account (`/create-account`)

Hero: logo 96px, "Создать аккаунт", "Придумайте имя, остальное сделает
браузер. Пароля не будет." One field "Имя", placeholder "Как вас называть",
helper "Его увидят другие игроки, и оно же станет подписью пасскея в вашем
менеджере." (the name is baked into the passkey's `user.name` at creation,
which is why it is required and asked first). Primary "Создать пасскей" with
the key icon. Below: "Уже есть аккаунт? Войти".

States:

- **Invalid name** (`invalid_display_name`): the field turns danger, under
  it "Слишком длинное имя, максимум 64 символа." (empty: "Введите имя.";
  invisible or direction-changing characters: "Имя содержит недопустимые
  символы."). Long values truncate with an ellipsis in the mockup; the real
  input scrolls.
- **Unsupported authenticator** (`NotSupportedError`, `ConstraintError`, a
  non-discoverable credential refused by the server): alert "Не получилось
  создать пасскей" / "Этот ключ или браузер не умеет хранить пасскеи с
  проверкой владельца. Подойдут Touch ID, Face ID, Windows Hello или менеджер
  паролей на телефоне." The name stays filled; the button reads "Попробовать
  ещё раз".
- **Cancelled**: same alert as on sign-in, titled "Создание отменено".

### Session check (root loader)

While `/api/me` is in flight: the logo at 96px and "Проверяем, кто вы…",
pulsing, footer in place. No spinner, no layout of the page behind it. It
should be visible for well under a second in practice.

### Dashboard (`/`)

Header: logo 44px, the uppercase label "Аккаунт" over the display name
(truncates with an ellipsis), and "Выйти" with the logout icon on the right.

Sections, each a card with an uppercase title:

- **"Пасскеи"**, with "Добавить" in the title row (after #720). A row per
  passkey: key chip, name, meta "Создан 12 сентября · Использован сегодня"
  (relative dates in Russian; never used: "Не использовался"), rename and
  delete icon buttons at 44px. Inline rename replaces the row with an input
  and "Сохранить" / "Отмена".
- **"Почта"**: empty state "Не указана" / "Понадобится для восстановления,
  когда оно появится. Пока без подтверждения." with the link "Добавить";
  set state shows the address, "Не подтверждена. Подтверждение появится
  позже." and the rename icon.

States:

- **One passkey**: a nudge card above the sections, accent tint with an
  accent border: shield icon, "Добавьте второй пасскей", "Если потеряете
  устройство, второй пасскей это единственный способ вернуться в аккаунт.
  Восстановления по почте пока нет.", primary "Добавить пасскей". The
  passkey row's delete button is hint-coloured and disabled, with the note
  "Единственный пасскей нельзя удалить: сначала добавьте второй." The same
  sentence is the message for a `409 last_passkey` from the API.
- **Two or more passkeys**: no nudge, delete enabled on every row.
- **Delete**: a bottom sheet over a dimmed page, "Удалить пасскей «iPhone
  Ады»?" / "Вход с этого устройства перестанет работать. Открытые сессии
  останутся, из них можно выйти отдельно.", danger "Удалить" with the trash
  icon, secondary "Отмена".

## Flows

1. **New user**: `/` → session check → `/sign-in` → "Создать" →
   `/create-account` → name → passkey ceremony → `/` with the one-passkey
   nudge.
2. **Returning user, same device**: `/sign-in` → the browser offers the
   passkey in autofill → `/`. The button is the fallback for browsers
   without conditional mediation and for a passkey on another device.
3. **Sign out**: "Выйти" → `/sign-in`. `Clear-Site-Data` on the API side
   empties what the browser holds; the app keeps nothing client-side.
4. **Recovery story (v1)**: there is none beyond a second passkey, which is
   why the nudge is the first thing a one-passkey account sees.

## Sample data on the canvas

Names, dates and the address `ada@mems.fun` are samples. The default name of
a freshly registered passkey is rendered as "Пасскей" and must follow what
the backend actually stores.
