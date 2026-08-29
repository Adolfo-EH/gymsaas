// ============================================================
// Mapper Utility — snake_case ↔ camelCase
// Transforma las keys de objetos entre la convención de
// PostgreSQL/Supabase (snake_case) y TypeScript (camelCase).
// ============================================================

/**
 * Convierte un string de snake_case a camelCase.
 * @example snakeToCamel('first_name') → 'firstName'
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Convierte un string de camelCase a snake_case.
 * @example camelToSnake('firstName') → 'first_name'
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Convierte todas las keys de un objeto de snake_case a camelCase.
 * Útil para transformar respuestas de Supabase a interfaces TS.
 *
 * @example
 * toCamelCase({ first_name: 'Juan', last_name: 'Pérez' })
 * // → { firstName: 'Juan', lastName: 'Pérez' }
 */
export function toCamelCase<T>(obj: Record<string, unknown>): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    // Recursión para objetos anidados (ej: relaciones de Supabase)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[snakeToCamel(key)] = toCamelCase<unknown>(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[snakeToCamel(key)] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? toCamelCase<unknown>(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[snakeToCamel(key)] = value;
    }
  }

  return result as T;
}

/**
 * Convierte todas las keys de un objeto de camelCase a snake_case.
 * Útil para enviar datos del frontend a Supabase.
 *
 * @example
 * toSnakeCase({ firstName: 'Juan', lastName: 'Pérez' })
 * // → { first_name: 'Juan', last_name: 'Pérez' }
 */
export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj === null || obj === undefined) {
    return obj;
  }

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[camelToSnake(key)] = toSnakeCase(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[camelToSnake(key)] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? toSnakeCase(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[camelToSnake(key)] = value;
    }
  }

  return result;
}

/**
 * Mapea un array completo de objetos snake_case a camelCase.
 * Atajo para transformar listas de resultados de Supabase.
 */
export function mapArrayToCamelCase<T>(arr: Record<string, unknown>[]): T[] {
  return arr.map((item) => toCamelCase<T>(item));
}

/**
 * Mapea un array completo de objetos camelCase a snake_case.
 * Atajo para preparar datos en lote para Supabase.
 */
export function mapArrayToSnakeCase(arr: Record<string, unknown>[]): Record<string, unknown>[] {
  return arr.map((item) => toSnakeCase(item));
}
