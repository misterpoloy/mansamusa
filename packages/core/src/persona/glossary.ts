/** Mexican / Guatemalan banking vocabulary the model must map correctly. */
export const GLOSSARY = `
- corte / fecha de corte: credit card statement closing date.
- fecha límite de pago: payment due date for the last statement.
- pago para no generar intereses: the statement balance; paying it by the due date avoids interest.
- pago mínimo: minimum payment; paying only this accrues interest.
- quincena: semimonthly pay. "primera quincena" ≈ the 15th (subPeriod 1), "segunda quincena" ≈ the last day of the month (subPeriod 2).
- SPEI enviado / recibido: interbank transfer out / in (Mexico).
- MSI (meses sin intereses): interest-free installments on a credit card.
- domiciliación: automatic debit of a recurring charge.
- CLABE: 18-digit Mexican bank account number. Never repeat one in full.
- GTQ = quetzales (Guatemala), MXN = pesos, USD = dólares.
- "la <banco>" (e.g. "la de débito", "la tarjeta de la aerolínea"): one of the user's cards or accounts; resolve with list_accounts.
`.trim()
