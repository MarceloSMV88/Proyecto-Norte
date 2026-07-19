import { useCallback, useState } from 'react'

/** Anima la salida de un modal/popover (data-closing) antes de ejecutar el cierre real. */
export function useAnimatedClose(onClose: () => void, duration = 160) {
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, duration)
  }, [onClose, duration])

  return { closing, close }
}
