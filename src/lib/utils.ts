/**
 * Utility function for merging Tailwind CSS classes
 * Simplified version without external dependencies
 */

/**
 * Type guard to check if value is a string
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if value is a record (object)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Conditionally join classNames together
 */
export function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (isString(input)) {
      classes.push(input);
    } else if (isRecord(input)) {
      // Handle object with boolean values (e.g., { 'active': true })
      for (const [key, value] of Object.entries(input)) {
        if (value) {
          classes.push(key);
        }
      }
    }
  }

  return classes.join(' ');
}
