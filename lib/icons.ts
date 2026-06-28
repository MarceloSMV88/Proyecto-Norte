// Catálogo central de íconos (emoji) para categorías de presupuesto.
// La BD guarda la "key"; la UI muestra el emoji vía catEmoji().

export const ICON_CATALOG: { key: string; emoji: string; label: string }[] = [
  // Hogar y servicios
  { key: 'home', emoji: '🏠', label: 'Hogar' },
  { key: 'zap', emoji: '⚡', label: 'Servicios' },
  { key: 'droplet', emoji: '💧', label: 'Agua' },
  { key: 'flame', emoji: '🔥', label: 'Gas' },
  { key: 'wifi', emoji: '📶', label: 'Internet' },
  { key: 'phone', emoji: '📱', label: 'Teléfono' },
  { key: 'tools', emoji: '🛠️', label: 'Mantención' },
  { key: 'broom', emoji: '🧹', label: 'Aseo' },

  // Alimentación
  { key: 'cart', emoji: '🛒', label: 'Supermercado' },
  { key: 'utensils', emoji: '🍽️', label: 'Restaurantes' },
  { key: 'coffee', emoji: '☕', label: 'Café' },
  { key: 'pizza', emoji: '🍕', label: 'Comida rápida' },
  { key: 'wine', emoji: '🍷', label: 'Bebidas' },
  { key: 'apple', emoji: '🍎', label: 'Frutas' },

  // Transporte
  { key: 'car', emoji: '🚗', label: 'Auto' },
  { key: 'fuel', emoji: '⛽', label: 'Bencina' },
  { key: 'bus', emoji: '🚌', label: 'Transporte público' },
  { key: 'plane', emoji: '✈️', label: 'Viajes' },
  { key: 'bike', emoji: '🚲', label: 'Bicicleta' },
  { key: 'taxi', emoji: '🚕', label: 'Taxi / apps' },

  // Salud y cuidado
  { key: 'heart', emoji: '❤️', label: 'Salud' },
  { key: 'pill', emoji: '💊', label: 'Farmacia' },
  { key: 'stethoscope', emoji: '🩺', label: 'Médico' },
  { key: 'tooth', emoji: '🦷', label: 'Dentista' },
  { key: 'dumbbell', emoji: '🏋️', label: 'Gimnasio' },
  { key: 'spa', emoji: '💆', label: 'Bienestar' },

  // Ocio y personal
  { key: 'film', emoji: '🎬', label: 'Entretención' },
  { key: 'music', emoji: '🎵', label: 'Música' },
  { key: 'game', emoji: '🎮', label: 'Juegos' },
  { key: 'book', emoji: '📚', label: 'Libros / educación' },
  { key: 'bag', emoji: '👜', label: 'Compras' },
  { key: 'shirt', emoji: '👕', label: 'Ropa' },
  { key: 'gift', emoji: '🎁', label: 'Regalos' },
  { key: 'paw', emoji: '🐾', label: 'Mascotas' },
  { key: 'scissors', emoji: '💇', label: 'Peluquería' },

  // Familia y otros
  { key: 'baby', emoji: '🍼', label: 'Hijos' },
  { key: 'school', emoji: '🎓', label: 'Colegio' },
  { key: 'church', emoji: '⛪', label: 'Donaciones' },

  // Finanzas y ahorro
  { key: 'target', emoji: '🎯', label: 'Metas' },
  { key: 'piggy', emoji: '🐷', label: 'Ahorro' },
  { key: 'bank', emoji: '🏦', label: 'Inversión' },
  { key: 'card', emoji: '💳', label: 'Tarjetas' },
  { key: 'repeat', emoji: '🔄', label: 'Suscripciones' },
  { key: 'briefcase', emoji: '💼', label: 'Trabajo' },
  { key: 'chart', emoji: '📈', label: 'Finanzas' },
  { key: 'shield', emoji: '🛡️', label: 'Seguros' },
  { key: 'tag', emoji: '🏷️', label: 'Otros' },
]

const EMOJI_BY_KEY: Record<string, string> = Object.fromEntries(
  ICON_CATALOG.map(i => [i.key, i.emoji])
)

export function catEmoji(key: string | null | undefined): string {
  if (!key) return '🏷️'
  return EMOJI_BY_KEY[key] ?? '🏷️'
}
