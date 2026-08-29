// ============================================================
// Date Utilities — Formateo seguro de fechas para Supabase
// Evita desfases de zona horaria extrayendo componentes locales.
// ============================================================

/**
 * Formatea una fecha a string 'YYYY-MM-DD' usando componentes locales.
 * 
 * IMPORTANTE: NO usa toISOString() porque ese método convierte a UTC,
 * lo que puede cambiar el día cuando la zona horaria es negativa (ej. UTC-5 Lima).
 * En su lugar, extrae año/mes/día del reloj LOCAL del usuario.
 *
 * @param date - Un objeto Date o un string en formato 'YYYY-MM-DD'.
 * @returns String estricto en formato 'YYYY-MM-DD' basado en la hora local.
 */
export function formatDateToYYYYMMDD(date: Date | string): string {
  if (typeof date === 'string') {
    // Si ya es un string YYYY-MM-DD válido, devolverlo tal cual
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    // Si es otro formato de string, parsearlo como fecha local
    const [y, m, d] = date.split('-');
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    return formatFromDateObj(parsed);
  }

  return formatFromDateObj(date);
}

/**
 * Extrae año, mes y día LOCAL de un objeto Date y los formatea como 'YYYY-MM-DD'.
 */
function formatFromDateObj(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parsea un string 'YYYY-MM-DD' a un objeto Date LOCAL (sin desfase UTC).
 * 
 * Usar en lugar de `new Date('2026-08-26')` que parsea como UTC medianoche
 * y puede retroceder un día en zonas horarias negativas.
 *
 * @param dateStr - String en formato 'YYYY-MM-DD'.
 * @returns Date construido con componentes locales.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
}
