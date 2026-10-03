import type {
  AssetContent,
  AssetSpec,
  CampaignBrief,
  ContextSnapshot,
  Merchant,
  ValidationFinding,
} from "../domain";
import { channelSpecs } from "./channel-specs";
export { channelSpecs } from "./channel-specs";
const finding = (
  code: string,
  message: string,
  field?: string,
): ValidationFinding => ({ code, severity: "error", message, field });
export const adsCharacterCount = (text: string): number =>
  [...text].reduce(
    (sum, character) =>
      sum +
      (/\p{Script_Extensions=Han}|\p{Script_Extensions=Hiragana}|\p{Script_Extensions=Katakana}|\p{Script_Extensions=Hangul}/u.test(
        character,
      )
        ? 2
        : 1),
    0,
  );
export function validateBrief(
  brief: CampaignBrief,
  merchant: Merchant,
): ValidationFinding[] {
  const result: ValidationFinding[] = [];
  for (const key of ["title", "goal", "audience", "direction"] as const) {
    if (!brief[key]?.trim())
      result.push(finding("brief-required", `${key} is required.`, key));
    if ((brief[key] ?? "").length > 1000)
      result.push(
        finding("brief-length", `${key} exceeds 1,000 characters.`, key),
      );
  }
  if (!brief.productIds.length)
    result.push(
      finding("brief-products", "Select at least one product.", "productIds"),
    );
  if (
    brief.productIds.some(
      (id) => !merchant.products.some((product) => product.id === id),
    )
  )
    result.push(
      finding(
        "brief-products",
        "A selected product is not in this fictional catalog.",
        "productIds",
      ),
    );
  if (new Set(brief.productIds).size !== brief.productIds.length)
    result.push(
      finding(
        "brief-products",
        "Product selections must be unique.",
        "productIds",
      ),
    );
  const quantities = brief.quantities ?? channelSpecs.defaults;
  for (const key of ["headlines", "longHeadlines", "descriptions"] as const) {
    const rule = channelSpecs[key];
    if (
      !Number.isInteger(quantities[key]) ||
      quantities[key] < rule.min ||
      quantities[key] > rule.max
    )
      result.push(
        finding(
          "brief-quantity",
          `${key} must be between ${rule.min} and ${rule.max}.`,
          key,
        ),
      );
  }
  if (
    !Number.isInteger(quantities.ctas) ||
    quantities.ctas < 1 ||
    quantities.ctas > 5
  )
    result.push(
      finding(
        "brief-quantity",
        "CTA quantity must be between 1 and 5.",
        "ctas",
      ),
    );
  for (const phrase of [
    ...(brief.requiredPhrases ?? []),
    ...(brief.prohibitedPhrases ?? []),
  ])
    if (!phrase.trim() || phrase.length > 90)
      result.push(
        finding("brief-phrase", "Phrase rules must contain 1–90 characters."),
      );
  if (
    brief.requiredPhrases?.some((required) =>
      brief.prohibitedPhrases?.some((prohibited) =>
        required.toLowerCase().includes(prohibited.toLowerCase()),
      ),
    )
  )
    result.push(
      finding(
        "brief-conflicting-phrase",
        "A required phrase conflicts with a prohibited phrase.",
      ),
    );
  return result;
}
export function validateContext(
  brief: CampaignBrief,
  context: ContextSnapshot,
): ValidationFinding[] {
  return brief.productIds
    .flatMap((id) => [`product:${id}`, `image:${id}`])
    .filter((id) => !context.selectedIds.includes(id))
    .map((id) =>
      finding(
        "context-required",
        `Required reference excluded or missing: ${id}.`,
        id,
      ),
    );
}
const unsupported =
  /\b(guaranteed|clinically proven|cures?|detox|organic|fair[- ]trade|certified|five[- ]star|5[- ]star|best[- ]selling|limited stock|selling out|carbon[- ]neutral|eco[- ]friendly|non[- ]toxic|antibacterial|disinfects?|kills (?:99|germs)|improves? (?:health|sleep)|boosts? (?:immunity|energy)|100% safe|zero waste|sustainably sourced)\b/gi;
export function validateClaims(
  text: string,
  brief: CampaignBrief,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  for (const phrase of brief.prohibitedPhrases ?? [])
    if (text.toLowerCase().includes(phrase.toLowerCase()))
      findings.push(
        finding("prohibited-phrase", `Prohibited phrase found: “${phrase}”.`),
      );
  const matches = [
    ...new Set(
      text.match(unsupported)?.map((match) => match.toLowerCase()) ?? [],
    ),
  ];
  if (matches.length)
    findings.push(
      finding(
        "unsupported-claim",
        `Unsupported claim vocabulary: ${matches.join(", ")}.`,
      ),
    );
  return findings;
}
export function validateAsset(
  content: AssetContent,
  spec: AssetSpec,
  brief: CampaignBrief,
  context: ContextSnapshot,
  merchant: Merchant,
): ValidationFinding[] {
  const result = validateContext(brief, context);
  const text =
    content.type === "image"
      ? `${content.alt} ${content.generationBrief} ${content.svg.replace(/<[^>]*>/g, " ")}`
      : JSON.stringify(content);
  result.push(...validateClaims(text, brief));
  if (content.type !== spec.kind)
    result.push(
      finding("asset-type", "Output type does not match its specification."),
    );
  if (content.type === "copy") {
    for (const key of ["headlines", "longHeadlines", "descriptions"] as const) {
      const rule = channelSpecs[key];
      if (content[key].length < rule.min || content[key].length > rule.max)
        result.push(
          finding(
            "channel-count",
            `${key} requires ${rule.min}–${rule.max} items.`,
            key,
          ),
        );
      content[key].forEach((item, i) => {
        if (!item.trim() || adsCharacterCount(item) > rule.maxLength)
          result.push(
            finding(
              "channel-length",
              `${key} ${i + 1} must contain 1–${rule.maxLength} weighted characters.`,
              `${key}.${i}`,
            ),
          );
      });
    }
    if (
      !content.headlines.some(
        (item) =>
          adsCharacterCount(item) <= channelSpecs.headlines.atLeastOneMaxLength,
      )
    )
      result.push(
        finding(
          "channel-short-headline",
          "At least one headline must contain 15 weighted characters or fewer.",
          "headlines",
        ),
      );
    if (
      content.descriptions.length !==
        (brief.quantities?.descriptions ??
          channelSpecs.defaults.descriptions) ||
      content.headlines.length !==
        (brief.quantities?.headlines ?? channelSpecs.defaults.headlines) ||
      content.longHeadlines.length !==
        (brief.quantities?.longHeadlines ?? channelSpecs.defaults.longHeadlines)
    )
      result.push(
        finding(
          "requested-count",
          "Copy quantities do not match the current brief.",
        ),
      );
    if (
      content.ctas.length < channelSpecs.ctas.min ||
      content.ctas.length > channelSpecs.ctas.max ||
      content.ctas.length !==
        (brief.quantities?.ctas ?? channelSpecs.defaults.ctas) ||
      content.ctas.some(
        (item) =>
          !item.trim() || adsCharacterCount(item) > channelSpecs.ctas.maxLength,
      )
    )
      result.push(
        finding(
          "copy-cta",
          "CTA items must match the requested count (1–5), with 1–40 weighted characters per item. These are Orbit review defaults.",
        ),
      );
    for (const phrase of brief.requiredPhrases ?? [])
      if (!text.toLowerCase().includes(phrase.toLowerCase()))
        result.push(
          finding(
            "required-phrase",
            `Required phrase missing from copy: “${phrase}”.`,
          ),
        );
    const selected = merchant.products.filter((product) =>
      brief.productIds.includes(product.id),
    );
    if (
      !selected.every(
        (product) =>
          content.productDescription.includes(product.name) &&
          content.productDescription.includes(product.description),
      )
    )
      result.push(
        finding(
          "product-facts",
          "Product suggestions must retain the selected product names and catalog descriptions.",
        ),
      );
  }
  if (content.type === "image") {
    if (
      !channelSpecs.imageSizes.some(
        ([width, height]) =>
          width === content.width && height === content.height,
      ) ||
      content.width !== spec.width ||
      content.height !== spec.height
    )
      result.push(
        finding(
          "image-dimensions",
          "Image dimensions must match the configured composition size.",
        ),
      );
    if (
      /<(?:script|foreignObject|iframe)\b|(?:href|src)\s*=|on\w+\s*=/i.test(
        content.svg,
      )
    )
      result.push(
        finding(
          "unsafe-svg",
          "SVG contains an active element or an external reference.",
        ),
      );
    const selected = merchant.products.filter((product) =>
      brief.productIds.includes(product.id),
    );
    for (const product of selected)
      if (
        !product.packageLabel.every((line) =>
          content.svg.includes(escapeXml(line)),
        )
      )
        result.push(
          finding(
            "package-facts",
            `Stable package text missing for ${product.name}.`,
          ),
        );
    result.push({
      code: "svg-review-only",
      severity: "warning",
      message: channelSpecs.formatNote,
    });
  }
  if (
    content.type === "landing" &&
    (!content.hero.title.trim() ||
      !content.hero.cta.trim() ||
      content.benefits.length < 2 ||
      !content.story.body.trim() ||
      !content.supporting.body.trim())
  )
    result.push(
      finding(
        "landing-required",
        "Landing page requires hero, benefits, product story, supporting content, and CTA.",
      ),
    );
  if (
    content.type === "video" &&
    (!content.script.trim() ||
      content.shots.length < 3 ||
      content.shots.reduce((sum, shot) => sum + shot.seconds, 0) !==
        content.durationSeconds)
  )
    result.push(
      finding(
        "video-required",
        "Video brief requires a script and a shot sequence with matching duration.",
      ),
    );
  if (
    content.type === "blueprint" &&
    (!content.summary.trim() ||
      content.checklist.length < 3 ||
      content.checklist.some((item) => !item.trim()))
  )
    result.push(
      finding(
        "blueprint-required",
        "Blueprint requires a summary and at least three nonempty checklist items.",
      ),
    );
  result.push({
    code: "deterministic-limits",
    severity: "info",
    message:
      "Checks cover configured counts, lengths, references, stable package text and a limited claim vocabulary. Merchant review remains necessary.",
  });
  return result;
}
export function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}
