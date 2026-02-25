
export const LOTTERY_CATEGORIES = {
  traditional: [
    { day: "Lunes", items: ["Lotería de Cundinamarca", "Lotería del Tolima"] },
    { day: "Martes", items: ["Lotería de la Cruz Roja", "Lotería del Huila"] },
    { day: "Miércoles", items: ["Lotería de Manizales", "Lotería del Meta", "Lotería del Valle"] },
    { day: "Jueves", items: ["Lotería de Bogotá", "Lotería del Quindío"] },
    { day: "Viernes", items: ["Lotería de Medellín", "Lotería de Santander", "Lotería de Risaralda"] },
    { day: "Sábado", items: ["Lotería de Boyacá", "Lotería del Cauca", "Lotería del Extra Colombia"] }
  ],
  daily: [
    "Astro Sol", "Astro Luna", "Dorado Mañana", "Dorado Tarde", "Dorado Noche",
    "Chontico Día", "Chontico Noche", "Paisita Día", "Paisita Noche",
    "Cafeterito Tarde", "Cafeterito Noche", "Sinuano Día", "Sinuano Noche",
    "Caribeña Día", "Caribeña Noche", "Motilón Día", "Motilón Noche",
    "Antioqueñita Día", "Antioqueñita Tarde", "Fantástica Día", "Fantástica Noche",
    "Culona Día", "Culona Noche", "Pijao de Oro", "Samán Día", "Play Four Noche"
  ]
};

export const COLOMBIAN_LOTTERIES = [
  ...LOTTERY_CATEGORIES.traditional.flatMap(cat => cat.items),
  ...LOTTERY_CATEGORIES.daily
];
