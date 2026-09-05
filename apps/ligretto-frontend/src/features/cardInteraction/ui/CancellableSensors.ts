import { MouseSensor, TouchSensor, type MouseSensorOptions, type SensorProps, type TouchSensorOptions, type UniqueIdentifier } from '@dnd-kit/core'

export type RegisterSensorCancellation = (cancel: () => void, sourceId: UniqueIdentifier, activatorEvent: Event) => () => void

interface CancellationOptions {
  registerCancellation: RegisterSensorCancellation
}

type CancellableMouseOptions = MouseSensorOptions & CancellationOptions
type CancellableTouchOptions = TouchSensorOptions & CancellationOptions

// @dnd-kit/core 6.3.1 has no public imperative cancellation API. These adapters
// deliberately isolate the one pinned-version assertion needed to detach native
// listeners and clear a pending activation timer through the inherited method.
const cancelPointerSensor = (sensor: MouseSensor | TouchSensor) => (sensor as unknown as { handleCancel: () => void }).handleCancel()

const terminalCallbacks = <Options extends CancellationOptions>(props: SensorProps<Options>) => {
  let finished = false
  let unregister = () => {}
  const once = (callback: () => void) => () => {
    if (finished) {
      return
    }
    finished = true
    unregister()
    callback()
  }
  return {
    props: {
      ...props,
      onAbort: (id: UniqueIdentifier) => {
        if (!finished) {
          props.onAbort(id)
        }
      },
      onEnd: once(props.onEnd),
      onCancel: once(props.onCancel),
    },
    register(sensor: MouseSensor | TouchSensor) {
      unregister = props.options.registerCancellation(
        () => {
          if (!finished) {
            cancelPointerSensor(sensor)
          }
        },
        props.active,
        props.event,
      )
    },
  }
}

export class CancellableMouseSensor extends MouseSensor {
  constructor(props: SensorProps<CancellableMouseOptions>) {
    const lifecycle = terminalCallbacks(props)
    super(lifecycle.props)
    lifecycle.register(this)
  }
}

export class CancellableTouchSensor extends TouchSensor {
  constructor(props: SensorProps<CancellableTouchOptions>) {
    const lifecycle = terminalCallbacks(props)
    super(lifecycle.props)
    lifecycle.register(this)
  }
}
