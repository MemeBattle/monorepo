import { Link } from 'react-router'

import { buttonLook, Card, Icon } from '#shared/ui'
import { routes } from '#app/routes'

/**
 * The one thing a guest can do on the dashboard: create an account. The link
 * carries no `return_to`: the request the guest came with is gone, and the
 * application sees the upgraded account at its next authorization request
 * (docs/adr/0003-guest-in-the-app.md).
 */
export const GuestUpgradeCard = () => (
  <Card tone="accent" className="gap-3 p-[18px]">
    <div className="flex items-start gap-3">
      <Icon name="key" size={24} className="shrink-0" />
      <div className="flex flex-col gap-1">
        <h2 className="text-base leading-tight font-extrabold">Создайте аккаунт</h2>
        <p className="text-sm leading-[1.45] font-medium text-ink-muted">
          Сейчас вы играете как гость. С аккаунтом игровой прогресс останется с вами, а входить вы будете с пасскеем, без пароля.
        </p>
      </div>
    </div>
    <Link to={routes.CREATE_ACCOUNT} className={buttonLook()}>
      <Icon name="key" />
      Создать аккаунт
    </Link>
  </Card>
)
