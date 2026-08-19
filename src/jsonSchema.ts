/**
 * JSON Schema helpers.
 *
 * Zod is the single source of truth for the heal-plan shape; this module turns
 * that schema into the dialect strict structured outputs accept. Keep this file
 * dependency-free so `types.ts` can use it without an import cycle.
 */

export type JsonSchemaObject = Record<string, any>;

// Keywords strict structured-output modes reject outright.
const UNSUPPORTED_KEYWORDS = [
  "$schema",
  "maxItems",
  "minItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "pattern",
  "format",
  "default",
];

/**
 * Normalise a generated JSON Schema for strict structured outputs:
 * every property listed as required, no additional properties, and none of the
 * validation keywords strict mode refuses to accept.
 */
export function strictJsonSchema(schema: JsonSchemaObject): JsonSchemaObject {
  if (Array.isArray(schema)) {
    return schema.map(item => (item && typeof item === "object" ? strictJsonSchema(item) : item)) as unknown as JsonSchemaObject;
  }
  if (!schema || typeof schema !== "object") return schema;

  const out: JsonSchemaObject = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.includes(key)) continue;
    out[key] = value && typeof value === "object" ? strictJsonSchema(value) : value;
  }

  if (out.properties && typeof out.properties === "object") {
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }

  return out;
}
