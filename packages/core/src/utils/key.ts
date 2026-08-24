/**
 * Generates a 2-6 character uppercase project short code/key from a project name.
 * e.g., "Mobile App" -> "MA", "Frontend Core" -> "FC", "Operative" -> "OPE".
 */
export function generateProjectKey(name: string): string {
  if (!name || !name.trim()) {
    return 'PRJ';
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  let rawKey = '';

  if (words.length === 1) {
    const word = words[0].replace(/[^a-zA-Z0-9]/g, '');
    if (word.length <= 3) {
      rawKey = word.toUpperCase();
    } else {
      rawKey = word.substring(0, 3).toUpperCase();
    }
  } else {
    rawKey = words
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, '')[0] || '')
      .join('')
      .substring(0, 4)
      .toUpperCase();
  }

  // Ensure key meets basic 2-6 char alphanumeric requirement
  const cleanKey = rawKey.replace(/[^A-Z0-9]/g, '');
  if (cleanKey.length >= 2 && cleanKey.length <= 6) {
    return cleanKey;
  }

  return 'PRJ';
}

/**
 * Validates whether a given key meets project key format rules (2-6 uppercase alphanumeric characters).
 */
export function validateProjectKey(key: string): boolean {
  if (!key) return false;
  return /^[A-Z0-9]{2,6}$/.test(key);
}

/**
 * Formats a task key using a project key and task index (e.g. "MOB-12").
 */
export function formatTaskKey(projectKey: string, taskNumber: number): string {
  const prefix = projectKey ? projectKey.toUpperCase() : 'TASK';
  return `${prefix}-${taskNumber}`;
}
