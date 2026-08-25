import type { CoreScope, EstimateResult } from './forgeCore';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash';
export const GEMINI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash'] as const;

export function buildEstimatorPrompt(scope: CoreScope): string {
  const scopeJson = JSON.stringify(scope.structuredData, null, 2);

  return `FORGE QUOTER — STRUCTURED MATERIAL TAKEOFF\n\nROLE\nYou are a senior construction/LBM estimator. Convert the reviewed Forge Scope record below into a practical material takeoff for a human estimator to review. Forge Scope is the controlling intake record. Do not silently override explicit inclusions, exclusions, RFIs, estimator notes, or field statuses.\n\nNON-NEGOTIABLE RULES\n1. Do not guess missing dimensions, assemblies, products, quantities, or construction methods. Put missing blockers in rfis and uncertainty in warnings.\n2. A field marked RFI, Verify, Assumption, or otherwise uncertain is not the same as a confirmed field. Preserve that uncertainty.\n3. Respect explicit exclusions. Do not add excluded or owner/by-others material to the supplied takeoff.\n4. Use drawing/source references already captured in Forge Scope when they support a line item. Do not invent sheet numbers.\n5. Quantities in items must be numeric. If an item clearly belongs but quantity cannot be supported, use quantity 0 and needsVerification=true, then explain why in notes and warnings.\n6. Use a useful construction category per line (Foundation, Floor Framing, Wall Framing, Roof Framing, Sheathing, Exterior, Openings, Deck / Stairs / Railing, Fasteners / Hardware, Drywall, Insulation, Other, etc.). Categories should fit the actual project; do not force house-floor categories onto barns/decks/sheds.\n7. Do not price material in this version. No unit cost, sell price, tax, markup, or margin. This output is the structured material takeoff that pricing will consume next.\n8. Do not duplicate the same physical material in multiple categories.\n9. Return material by purchasable unit where possible: pcs, sheets, LF, rolls, boxes, bundles, EA, etc.\n10. Before responding, internally cross-check major dimensions, framing system, openings, roof geometry, inclusions/exclusions and quantity math against the Scope record.\n\nDEFAULT ESTIMATING METHODS — APPLY ONLY WHEN THE SCOPE SUPPORTS THE ASSEMBLY\n- Conventional wood wall studs: use 1 stud per linear foot when no more specific spacing/count is provided.\n- Wall plates: pieces = wall LF × 3 ÷ 16 ft.\n- 4x8 sheathing: sheets = wall/roof area ÷ 32 sq ft, then add 7% typical waste where a waste allowance is appropriate. Do not subtract windows/doors from gross wall sheathing unless the Scope explicitly requires a different method.\n- Drywall: ceilings default to 4x12 sheets and walls to 4x8 sheets when drywall is actually included.\n- Do not apply conventional stud-wall formulas to post-frame/pole, steel-frame, timber-frame, curtain/open-wall or other incompatible systems. Use the Scope's framing system.\n\nOUTPUT\nReturn JSON only, no markdown fences and no prose outside the JSON object. Use this exact shape:\n{\n  \"projectSummary\": \"short description of what this takeoff covers\",\n  \"assumptions\": [\"only assumptions actually used in quantity math\"],\n  \"rfis\": [\"missing information that blocks or materially affects the takeoff\"],\n  \"warnings\": [\"scope conflicts, uncertain quantities, deferred engineering, by-others notes, etc.\"],\n  \"items\": [\n    {\n      \"category\": \"Wall Framing\",\n      \"sku\": \"optional SKU only if provided in Scope\",\n      \"description\": \"2x6 SPF Stud 92-5/8 in\",\n      \"quantity\": 85,\n      \"unit\": \"pcs\",\n      \"source\": \"Scope field/source reference if available\",\n      \"confidence\": \"High | Medium | Low\",\n      \"notes\": \"brief calculation or qualification\",\n      \"needsVerification\": false\n    }\n  ]\n}\n\nQUALITY BAR\n- Every item needs a non-empty description.\n- Prefer explicit calculations in notes (example: 112 LF × 1 stud/LF = 112 pcs).\n- If the Scope has insufficient information for a responsible material takeoff, it is acceptable to return a short item list plus strong rfis rather than fabricate a complete list.\n- The final output will be reviewed by a salesperson/estimator before pricing.\n\nCORE SCOPE\nScope ID: ${scope.id}\nScope version: ${scope.currentVersion}\nScope type: ${scope.scopeType || 'unspecified'}\nProject: ${scope.projectName || scope.title}\nCustomer: ${scope.customerName || 'Unassigned'}\n\nSTRUCTURED SCOPE JSON\n${scopeJson}`;
}

export function normalizeEstimate(input: any): EstimateResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('AI result must be one JSON object.');
  }

  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!rawItems.length) throw new Error('AI result contained no takeoff items.');
  if (rawItems.length > 2000) throw new Error('AI result exceeded the 2000-line safety limit.');

  const items = rawItems.map((item: any, index: number) => {
    const description = String(item?.description || '').trim();
    if (!description) throw new Error(`Takeoff item ${index + 1} has no description.`);
    const quantity = Number(item?.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error(`Takeoff item ${index + 1} has an invalid quantity.`);
    }
    const confidence = String(item?.confidence || '').trim();
    return {
      category: String(item?.category || 'Other').trim() || 'Other',
      sku: String(item?.sku || '').trim() || undefined,
      description,
      quantity,
      unit: String(item?.unit || '').trim() || undefined,
      source: String(item?.source || '').trim() || undefined,
      confidence: ['High', 'Medium', 'Low'].includes(confidence) ? confidence : undefined,
      notes: String(item?.notes || '').trim() || undefined,
      needsVerification: Boolean(item?.needsVerification ?? item?.needs_verification)
    };
  });

  const strings = (value: unknown) => Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 200)
    : [];

  return {
    projectSummary: String(input.projectSummary || input.project_summary || '').trim() || undefined,
    assumptions: strings(input.assumptions),
    rfis: strings(input.rfis),
    warnings: strings(input.warnings),
    items
  };
}
