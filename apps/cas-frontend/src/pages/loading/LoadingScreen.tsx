import { Logo, Screen } from '#shared/ui'

/** Shown while a route loader is still asking `/api/me` who the browser is. */
export const LoadingScreen = () => (
  <Screen>
    <div className="flex flex-col items-center gap-6">
      <div className="animate-pulse">
        <Logo size={96} />
      </div>
      <p className="text-[15px] font-bold text-ink-muted">Проверяем, кто вы…</p>
    </div>
  </Screen>
)
