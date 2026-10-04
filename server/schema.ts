import type {
  ImageGenerationRequest,
  SemanticPlan,
  SemanticPlanRequest,
  UploadRequest,
} from "../src/domain/service";
import { ServiceError } from "./errors";
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}
const object = (
  properties: Record<string, JsonSchema>,
  optionalFields: string[] = [],
): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties).filter(
    (field) => !optionalFields.includes(field),
  ),
  additionalProperties: false,
});
const string = (maxLength = 2000, minLength = 1): JsonSchema => ({
  type: "string",
  minLength,
  maxLength,
});
const nullable = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  type: [String(schema.type), "null"],
});
const array = (items: JsonSchema, maxItems = 20, minItems = 0): JsonSchema => ({
  type: "array",
  items,
  maxItems,
  minItems,
});
const boolean: JsonSchema = { type: "boolean" },
  number = (minimum = 0, maximum = 1_000_000_000): JsonSchema => ({
    type: "number",
    minimum,
    maximum,
  });
const integer = (minimum = 0, maximum = 1_000_000_000): JsonSchema => ({
  type: "integer",
  minimum,
  maximum,
});
const enumeration = (...values: string[]): JsonSchema => ({
  type: "string",
  enum: values,
});
const id = (): JsonSchema => ({ ...string(100), pattern: "^[a-zA-Z0-9_-]+$" });
const color = (): JsonSchema => ({
  ...string(7),
  pattern: "^#[0-9a-fA-F]{6}$",
});
const channel = enumeration("google", "meta", "tiktok", "website", "email");
const dates = object({ start: string(10), end: string(10) });
export const planRequestSchema = object({
  requestId: id(),
  brief: object(
    {
      text: string(6000),
      feedback: nullable(string(6000)),
      goal: string(200),
      audience: string(500),
      offer: nullable(string(1000)),
      tone: nullable(string(300)),
      keywords: array(string(100), 20),
      requiredPhrases: array(string(300), 20),
      prohibitedPhrases: array(string(300), 20),
      phraseScope: enumeration("campaign-copy", "all-copy"),
      dates: nullable(dates),
    },
    ["feedback"],
  ),
  confirmedProducts: array(
    object({
      id: id(),
      name: string(160),
      description: string(2000),
      facts: array(string(300), 30, 1),
      sourceIds: array(id(), 10, 1),
      packageText: array(string(200), 20),
      imageIds: array(id(), 10),
    }),
    6,
    1,
  ),
  factSources: array(
    object({
      id: id(),
      url: nullable(string(2048)),
      retrievedAt: string(40),
      role: enumeration("product-facts", "visual-inspiration", "brand"),
      confirmed: boolean,
    }),
    30,
    1,
  ),
  brand: object({
    name: string(160),
    palette: array(color(), 8, 1),
    tone: string(300),
    confirmed: boolean,
  }),
  references: array(
    object({
      id: id(),
      role: enumeration("product", "visual-inspiration", "brand", "landing"),
      sourceId: id(),
      text: string(2000, 0),
      selected: boolean,
    }),
    30,
  ),
  placements: array(
    object({
      id: id(),
      channel,
      name: string(160),
      media: enumeration("image", "video", "text"),
      width: nullable(integer(16, 4096)),
      height: nullable(integer(16, 4096)),
      maxTextLength: nullable(integer(1, 10000)),
    }),
    12,
    1,
  ),
  budget: nullable(
    object({
      currency: { ...string(3), pattern: "^[A-Z]{3}$" },
      periodStart: string(10),
      periodEnd: string(10),
      intent: enumeration("daily", "lifetime"),
      totalMinorUnits: integer(),
      allocations: array(object({ channel, amountMinorUnits: integer() }), 5),
      assumptions: object({
        cpaMinorUnits: nullable(integer()),
        roas: nullable(number(0, 100)),
        marginPercent: nullable(number(0, 100)),
      }),
    }),
  ),
  preferences: object({
    tone: nullable(string(300)),
    avoidCrowdedCompositions: boolean,
  }),
});
export const semanticPayloadSchema = object({
  theme: string(500),
  audience: string(1000),
  offer: nullable(string(1000)),
  productIds: array(id(), 6, 1),
  directions: array(
    object({
      id: id(),
      title: string(200),
      description: string(1500),
      palette: array(color(), 8, 1),
      imagePrompt: string(3000),
      negativePrompt: string(1500, 0),
      productLayerInstructions: string(1500),
      placementComposition: array(
        object({
          placementId: id(),
          composition: enumeration("product-right", "product-center"),
          spacing: number(0.06, 0.18),
          framing: string(500),
          focalPoint: string(500),
          negativeSpace: string(500),
          textPlacement: string(500),
        }),
        12,
        1,
      ),
    }),
    2,
    2,
  ),
  copy: array(
    object({
      placementId: id(),
      headlines: array(string(500), 15, 1),
      longHeadlines: array(string(500), 5),
      descriptions: array(string(1000), 5, 1),
      ctas: array(string(160), 5, 1),
    }),
    12,
    1,
  ),
  landing: object({
    heroTitle: string(300),
    heroBody: string(2000),
    cta: string(160),
    sections: array(
      object({
        kind: enumeration("benefit", "story", "supporting", "faq"),
        title: string(300),
        body: string(2000),
      }),
      10,
      2,
    ),
  }),
  videoBriefs: array(
    object({
      placementId: id(),
      script: string(3000),
      shots: array(string(1000), 12, 3),
      missingProductionChecks: array(string(500), 10, 1),
    }),
    6,
  ),
  conflicts: array(
    object({ code: id(), message: string(1000), requiresResolution: boolean }),
    20,
  ),
  coverage: array(
    object({
      input: string(300),
      appliedTo: array(string(200), 20),
      notAppliedReason: nullable(string(1000)),
    }),
    30,
    1,
  ),
  warnings: array(string(1000), 20),
});
export const imageRequestSchema = object({
  requestId: id(),
  prompt: string(6000),
  size: enumeration("1024x1024", "1536x1024", "1024x1536"),
  referenceImages: array(
    object({
      mimeType: enumeration("image/png", "image/jpeg"),
      base64: string(6 * 1024 * 1024),
    }),
    2,
  ),
  backgroundOnly: boolean,
});
export const uploadSchema = object({
  requestId: id(),
  mimeType: enumeration("image/png", "image/jpeg", "image/webp"),
  base64: string(6 * 1024 * 1024),
});
export function validateSchema(
  value: unknown,
  schema: JsonSchema,
  path = "$",
  depth = 0,
): void {
  if (depth > 20)
    throw new ServiceError(
      "schema-invalid",
      "Record nesting exceeds the schema limit.",
    );
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null && types.includes("null")) return;
  const expected = types.find((type) => type !== "null");
  if (expected === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new ServiceError("schema-invalid", `${path} must be an object.`);
    const record = value as Record<string, unknown>;
    for (const field of schema.required ?? [])
      if (!Object.hasOwn(record, field))
        throw new ServiceError(
          "schema-invalid",
          `${path}.${field} is required.`,
        );
    for (const [key, item] of Object.entries(record)) {
      if (schema.properties?.[key])
        validateSchema(
          item,
          schema.properties[key],
          `${path}.${key}`,
          depth + 1,
        );
      else if (schema.additionalProperties === false)
        throw new ServiceError(
          "schema-invalid",
          `${path} contains an unsupported field.`,
        );
    }
  } else if (expected === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity)
    )
      throw new ServiceError(
        "schema-invalid",
        `${path} has an invalid item count.`,
      );
    value.forEach((item, i) =>
      validateSchema(item, schema.items!, `${path}[${i}]`, depth + 1),
    );
  } else if (expected === "string") {
    if (
      typeof value !== "string" ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity) ||
      (schema.pattern && !new RegExp(schema.pattern).test(value))
    )
      throw new ServiceError(
        "schema-invalid",
        `${path} has an invalid string value.`,
      );
  } else if (expected === "boolean" && typeof value !== "boolean")
    throw new ServiceError("schema-invalid", `${path} must be boolean.`);
  else if (
    (expected === "number" || expected === "integer") &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      (expected === "integer" && !Number.isInteger(value)) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity))
  )
    throw new ServiceError("schema-invalid", `${path} has an invalid number.`);
  if (schema.enum && !schema.enum.includes(value))
    throw new ServiceError(
      "schema-invalid",
      `${path} is outside the supported choices.`,
    );
}
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().startsWith(value);
export function validatePlanRequest(
  value: unknown,
): asserts value is SemanticPlanRequest {
  validateSchema(value, planRequestSchema);
  const request = value as SemanticPlanRequest;
  if (!request.brand.confirmed)
    throw new ServiceError(
      "facts-unconfirmed",
      "Confirm brand defaults and product facts before semantic generation.",
    );
  const facts = new Map(
    request.factSources.map((source) => [source.id, source]),
  );
  if (
    facts.size !== request.factSources.length ||
    new Set(request.confirmedProducts.map((product) => product.id)).size !==
      request.confirmedProducts.length ||
    new Set(request.placements.map((placement) => placement.id)).size !==
      request.placements.length
  )
    throw new ServiceError(
      "duplicate-id",
      "Source, product and placement IDs must be unique.",
    );
  for (const product of request.confirmedProducts)
    if (
      product.sourceIds.some(
        (id) =>
          !facts.get(id)?.confirmed || facts.get(id)?.role !== "product-facts",
      )
    )
      throw new ServiceError(
        "facts-unconfirmed",
        "Each product requires confirmed factual source records.",
      );
  for (const reference of request.references)
    if (reference.selected && !facts.has(reference.sourceId))
      throw new ServiceError(
        "reference-missing",
        "A selected reference does not have a source record.",
      );
  if (
    request.brief.dates &&
    (!validDate(request.brief.dates.start) ||
      !validDate(request.brief.dates.end) ||
      request.brief.dates.start > request.brief.dates.end)
  )
    throw new ServiceError(
      "date-range",
      "Campaign dates must form a valid range.",
    );
  if (request.budget) {
    const budget = request.budget;
    if (
      !validDate(budget.periodStart) ||
      !validDate(budget.periodEnd) ||
      budget.periodStart > budget.periodEnd ||
      new Set(budget.allocations.map((item) => item.channel)).size !==
        budget.allocations.length ||
      budget.allocations.reduce((sum, item) => sum + item.amountMinorUnits, 0) >
        budget.totalMinorUnits
    )
      throw new ServiceError(
        "budget-invalid",
        "Budget dates and same-intent channel allocations must fit the stated total.",
      );
  }
  if (
    request.placements.some(
      (placement) =>
        (placement.width === null) !== (placement.height === null) ||
        (placement.media === "image" && placement.width === null),
    )
  )
    throw new ServiceError(
      "placement-invalid",
      "Image placements require paired dimensions.",
    );
}
export function validateSemanticPayload(
  value: unknown,
): asserts value is Omit<SemanticPlan, "mode" | "provenance"> {
  validateSchema(value, semanticPayloadSchema);
}
export function validateImageRequest(
  value: unknown,
): asserts value is ImageGenerationRequest {
  validateSchema(value, imageRequestSchema);
}
export function validateUploadRequest(
  value: unknown,
): asserts value is UploadRequest {
  validateSchema(value, uploadSchema);
}
