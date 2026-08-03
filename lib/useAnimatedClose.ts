import { useCallback, useState } from 'react'

/** Anima la salida de un modal/popover (data-closing) antes de ejecutar el cierre real. */
export function useAnimatedClose(onClose: () => void, duration = 160) {
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    setClosing(true)
    // Reset de `closing` tras el cierre: sin esto queda en true para siempre y cualquier
    // componente que REABRA sin desmontarse (ej. DatePicker, que togglea `open` en su lugar)
    // se renderiza con la animación de salida en cada apertura → parpadeo / no se ve.
    setTimeout(() => { onClose(); setClosing(false) }, duration)
  }, [onClose, duration])

  return { closing, close }
}
