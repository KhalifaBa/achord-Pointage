// src/utils/quickStep.js
// Logique du « pointage en 1 tap » (JS pur, testable avec Node)

/** Prochaine étape logique de la journée (null = journée terminée) */
export function nextQuickStep(t) {
  if (!t.arrival) return 'arrival';
  if (t.departure) return null;
  if (t.coffeeMornStart && !t.coffeeMornEnd) return 'coffeeMornEnd';
  if (t.coffeeAftnStart && !t.coffeeAftnEnd) return 'coffeeAftnEnd';
  if (!t.lunchStart) return 'lunchStart';
  if (!t.lunchEnd) return 'lunchEnd';
  return 'departure';
}
