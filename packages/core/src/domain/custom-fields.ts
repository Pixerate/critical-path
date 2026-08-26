import type { CustomFieldDefinition } from '../types/index.js';

export class CustomFieldValidationError extends Error {
  public readonly fieldKey: string;
  public readonly expectedType?: string;
  public readonly receivedValue?: unknown;

  constructor(message: string, fieldKey: string, expectedType?: string, receivedValue?: unknown) {
    super(message);
    this.name = 'CustomFieldValidationError';
    this.fieldKey = fieldKey;
    this.expectedType = expectedType;
    this.receivedValue = receivedValue;
  }
}

export function validateCustomFieldValues(
  definitions: CustomFieldDefinition[] | undefined,
  values: Record<string, unknown> | undefined
): void {
  if (!definitions || definitions.length === 0) return;
  const customValues = values || {};

  for (const def of definitions) {
    const value = customValues[def.key];

    // Check required invariant
    if (def.required && (value === undefined || value === null || value === '')) {
      throw new CustomFieldValidationError(
        `Custom field "${def.label || def.key}" (${def.key}) is required.`,
        def.key,
        def.type,
        value
      );
    }

    if (value === undefined || value === null) {
      continue;
    }

    // Type and schema validation
    switch (def.type) {
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          throw new CustomFieldValidationError(
            `Custom field "${def.label || def.key}" must be a valid number. Received: ${typeof value}`,
            def.key,
            'number',
            value
          );
        }
        break;

      case 'text':
      case 'user':
        if (typeof value !== 'string') {
          throw new CustomFieldValidationError(
            `Custom field "${def.label || def.key}" must be a string. Received: ${typeof value}`,
            def.key,
            def.type,
            value
          );
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new CustomFieldValidationError(
            `Custom field "${def.label || def.key}" must be a boolean. Received: ${typeof value}`,
            def.key,
            'boolean',
            value
          );
        }
        break;

      case 'date':
        if (typeof value !== 'string' || isNaN(new Date(value).getTime())) {
          throw new CustomFieldValidationError(
            `Custom field "${def.label || def.key}" must be a valid ISO date string. Received: ${JSON.stringify(value)}`,
            def.key,
            'date',
            value
          );
        }
        break;

      case 'single_select':
        if (typeof value !== 'string') {
          throw new CustomFieldValidationError(
            `Custom field "${def.label || def.key}" must be a string option. Received: ${typeof value}`,
            def.key,
            'single_select',
            value
          );
        }
        if (def.options && def.options.length > 0 && !def.options.includes(value)) {
          throw new CustomFieldValidationError(
            `Custom field "${def.label || def.key}" value "${value}" is not an allowed option [${def.options.join(', ')}].`,
            def.key,
            'single_select',
            value
          );
        }
        break;

      case 'multi_select':
        if (!Array.isArray(value)) {
          throw new CustomFieldValidationError(
            `Custom field "${def.label || def.key}" must be an array of string options. Received: ${typeof value}`,
            def.key,
            'multi_select',
            value
          );
        }
        if (def.options && def.options.length > 0) {
          for (const item of value) {
            if (typeof item !== 'string' || !def.options.includes(item)) {
              throw new CustomFieldValidationError(
                `Custom field "${def.label || def.key}" option "${item}" is not allowed in [${def.options.join(', ')}].`,
                def.key,
                'multi_select',
                item
              );
            }
          }
        }
        break;
    }
  }
}
