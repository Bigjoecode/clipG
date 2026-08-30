import { z } from 'zod';

import {
  editOperationSchema,
  editOperationTypes,
  editPlanSchema,
  editPlanSchemaVersion,
  editPlatforms,
  validateEditPlan,
  type AssetContext,
  type EditOperation,
  type EditPlan,
  type SemanticTrigger,
} from '@clipgenius/editing-language';

import type { AiErrorCategory, AiUsage } from './usage.js';

export const creativeDirectorAutonomyModes = [
  'CONSERVATIVE',
  'BALANCED',
  'CREATIVE',
] as const;

export const creativeDirectorValidationStatuses = [
  'VALID',
  'UNRESOLVED',
] as const;

const instructionText = z.string().trim().min(1).max(4_000);
const optionalInstructionText = z.string().trim().min(1).max(2_000);

const sourceMediaSchema = z
  .object({
    durationMs: z.number().int().positive().max(86_400_000),
    mediaAssetId: z.uuid(),
    source: z.literal('SOURCE_MEDIA'),
  })
  .strict();

const transcriptSegmentSchema = z
  .object({
    endMs: z.number().int().positive().max(86_400_000),
    id: z.uuid(),
    speaker: z.string().trim().min(1).max(64).nullable(),
    startMs: z.number().int().nonnegative().max(86_400_000),
    text: z.string().trim().min(1).max(20_000),
  })
  .strict()
  .refine((segment) => segment.endMs > segment.startMs, {
    message: 'Transcript segment endMs must be greater than startMs.',
    path: ['endMs'],
  });

const transcriptSchema = z
  .object({
    diarized: z.boolean(),
    id: z.uuid(),
    segments: z.array(transcriptSegmentSchema).max(20_000),
  })
  .strict();

const intelligenceOpportunitySchema = z
  .object({
    endMs: z.number().int().positive().max(86_400_000),
    id: z.uuid(),
    startMs: z.number().int().nonnegative().max(86_400_000),
    summary: z.string().trim().min(1).max(2_000),
    title: z.string().trim().min(1).max(160),
    topic: z.string().trim().min(1).max(160),
    type: z.string().trim().min(1).max(64),
  })
  .strict()
  .refine((opportunity) => opportunity.endMs > opportunity.startMs, {
    message: 'Opportunity endMs must be greater than startMs.',
    path: ['endMs'],
  });

const contentIntelligenceSchema = z
  .object({
    opportunities: z.array(intelligenceOpportunitySchema).max(100),
    summary: z.string().trim().min(1).max(4_000),
    topics: z.array(z.string().trim().min(1).max(160)).max(100),
  })
  .strict();

export const creativeDirectorAssetSchema = z
  .object({
    assetId: z.uuid(),
    durationMs: z.number().int().positive().max(86_400_000).optional(),
    kind: z.enum(['VIDEO', 'IMAGE', 'AUDIO']),
    label: z.string().trim().min(1).max(255),
    source: z.enum(['USER_ASSET', 'AI_GENERATED_ASSET', 'LICENSED_ASSET']),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  })
  .strict();

export const referenceStyleProfileSchema = z
  .object({
    brollDensity: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
    captionBehavior: z.enum(['NONE', 'MINIMAL', 'CLEAN', 'DYNAMIC']).optional(),
    creativeEnergy: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    framing: z.enum(['SOURCE', 'SPEAKER_FOCUSED', 'DYNAMIC']).optional(),
    notes: z.string().trim().min(1).max(1_000).optional(),
    pacing: z.enum(['SLOW', 'BALANCED', 'FAST']).optional(),
    transitionFrequency: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
    visualRhythm: z.enum(['CALM', 'BALANCED', 'DYNAMIC']).optional(),
    zoomFrequency: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
  })
  .strict();

const creatorPreferencesSchema = z
  .object({
    autonomy: z.enum(creativeDirectorAutonomyModes).default('BALANCED'),
    captions: z.enum(['OFF', 'MINIMAL', 'CLEAN', 'DYNAMIC']).optional(),
    pacing: z.enum(['SLOW', 'BALANCED', 'FAST']).optional(),
  })
  .strict();

const brandDnaSchema = z
  .object({
    captionPreference: z.string().trim().min(1).max(500).optional(),
    editingPrinciples: z
      .array(z.string().trim().min(1).max(300))
      .max(20)
      .default([]),
    name: z.string().trim().min(1).max(120).optional(),
    tone: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export const creativeDirectorInputSchema = z
  .object({
    allowAiGeneratedAssets: z.boolean().default(false),
    availableAssets: z.array(creativeDirectorAssetSchema).max(500).default([]),
    brandDNA: brandDnaSchema.optional(),
    contentIntelligence: contentIntelligenceSchema.optional(),
    creatorPreferences: creatorPreferencesSchema.default({
      autonomy: 'BALANCED',
    }),
    existingEditPlan: editPlanSchema.optional(),
    platform: z.enum(editPlatforms).optional(),
    previousInstructions: z.array(optionalInstructionText).max(20).default([]),
    projectInstructions: z.array(optionalInstructionText).max(20).default([]),
    referenceStyle: referenceStyleProfileSchema.optional(),
    sourceMedia: sourceMediaSchema,
    transcript: transcriptSchema.optional(),
    userInstruction: instructionText,
  })
  .strict();

export type CreativeDirectorInput = z.infer<typeof creativeDirectorInputSchema>;
export type CreativeDirectorAsset = z.infer<typeof creativeDirectorAssetSchema>;
export type ReferenceStyleProfile = z.infer<typeof referenceStyleProfileSchema>;

export const unresolvedReferenceSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            endMs: z.number().int().positive(),
            label: z.string().trim().min(1).max(300),
            startMs: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    kind: z.enum(['PHRASE', 'TOPIC', 'SPEAKER', 'EVENT', 'ASSET', 'OTHER']),
    operationId: z.uuid().optional(),
    question: z.string().trim().min(1).max(500),
    reason: z.enum(['AMBIGUOUS', 'NOT_FOUND', 'INSUFFICIENT_EVIDENCE']),
  })
  .strict();

export const creativeDirectorModelOutputSchema = z
  .object({
    decisionSummary: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
    editPlan: editPlanSchema,
    unresolvedReferences: z
      .array(unresolvedReferenceSchema)
      .max(50)
      .default([]),
    warnings: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  })
  .strict();

export interface CreativeDirectorOutput {
  readonly editPlan: EditPlan;
  readonly decisionSummary: readonly string[];
  readonly unresolvedReferences: readonly z.infer<
    typeof unresolvedReferenceSchema
  >[];
  readonly warnings: readonly string[];
  readonly validationStatus: (typeof creativeDirectorValidationStatuses)[number];
  readonly provider: string;
  readonly model: string;
  readonly usage: AiUsage;
}

export interface CreativeDirectorProviderRequest {
  readonly input: CreativeDirectorInput;
  readonly safetyIdentifier: string;
  readonly systemPrompt: string;
}

export interface CreativeDirectorProviderResponse {
  readonly model: string;
  readonly provider: string;
  readonly raw: unknown;
  readonly usage: AiUsage;
}

export interface CreativeDirectorProvider {
  generate(
    request: CreativeDirectorProviderRequest,
  ): Promise<CreativeDirectorProviderResponse>;
}

export class CreativeDirectorProviderError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly category: AiErrorCategory = 'UNKNOWN',
    public readonly usage?: AiUsage,
  ) {
    super(message);
    this.name = 'CreativeDirectorProviderError';
  }
}

export interface CreativeDirectorOptions {
  readonly systemPrompt: string;
}

export interface CreativeDirectorRequestContext {
  readonly safetyIdentifier: string;
}

export class CreativeDirector {
  public constructor(
    private readonly provider: CreativeDirectorProvider,
    private readonly options: CreativeDirectorOptions,
  ) {}

  public async direct(
    inputValue: unknown,
    context: CreativeDirectorRequestContext,
  ): Promise<CreativeDirectorOutput> {
    const input = creativeDirectorInputSchema.parse(inputValue);
    const response = await this.provider.generate({
      input,
      safetyIdentifier: context.safetyIdentifier,
      systemPrompt: this.options.systemPrompt,
    });
    return parseCreativeDirectorOutput(response.raw, input, response);
  }
}

interface SemanticCandidate {
  readonly endMs: number;
  readonly label: string;
  readonly startMs: number;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function semanticCandidates(
  trigger: SemanticTrigger,
  input: CreativeDirectorInput,
): readonly SemanticCandidate[] {
  if (trigger.kind === 'PHRASE') {
    const phrase = normalize(trigger.phrase);
    return (input.transcript?.segments ?? [])
      .filter((segment) => normalize(segment.text).includes(phrase))
      .map((segment) => ({
        endMs: segment.endMs,
        label: segment.text.slice(0, 300),
        startMs: segment.startMs,
      }));
  }
  if (trigger.kind === 'SPEAKER') {
    const speaker = normalize(trigger.speaker);
    return (input.transcript?.segments ?? [])
      .filter(
        (segment) =>
          segment.speaker !== null && normalize(segment.speaker) === speaker,
      )
      .map((segment) => ({
        endMs: segment.endMs,
        label: `${segment.speaker}: ${segment.text}`.slice(0, 300),
        startMs: segment.startMs,
      }));
  }

  const needle = normalize(
    trigger.kind === 'TOPIC' ? trigger.topic : trigger.description,
  );
  return (input.contentIntelligence?.opportunities ?? [])
    .filter((opportunity) => {
      const haystack = normalize(
        [
          opportunity.topic,
          opportunity.title,
          opportunity.summary,
          opportunity.type,
        ].join(' '),
      );
      return (
        haystack.includes(needle) ||
        needle.includes(normalize(opportunity.topic))
      );
    })
    .map((opportunity) => ({
      endMs: opportunity.endMs,
      label: opportunity.title,
      startMs: opportunity.startMs,
    }));
}

function selectCandidate(
  operation: EditOperation,
  candidates: readonly SemanticCandidate[],
  userInstruction: string,
): SemanticCandidate | undefined {
  if (operation.target.kind !== 'SEMANTIC' || candidates.length === 0) {
    return undefined;
  }
  const occurrence = operation.target.occurrence;
  if (candidates.length === 1) {
    return candidates[0];
  }
  const instruction = normalize(userInstruction);
  if (
    occurrence.select === 'FIRST' &&
    /\b(first|initial|earliest)\b/u.test(instruction)
  ) {
    return candidates[0];
  }
  if (
    occurrence.select === 'LAST' &&
    /\b(last|final|latest)\b/u.test(instruction)
  ) {
    return candidates.at(-1);
  }
  if (
    occurrence.select === 'NTH' &&
    occurrence.index !== undefined &&
    instruction.includes(String(occurrence.index))
  ) {
    return candidates[occurrence.index - 1];
  }
  return undefined;
}

function resolvedOperation(
  operation: EditOperation,
  candidate: SemanticCandidate,
  sourceDurationMs: number,
): EditOperation {
  if (operation.target.kind !== 'SEMANTIC') {
    return operation;
  }
  const startMs = Math.max(0, candidate.startMs - operation.target.leadMs);
  const endMs = Math.min(
    sourceDurationMs,
    operation.target.durationMs === undefined
      ? candidate.endMs + operation.target.trailMs
      : startMs + operation.target.durationMs,
  );
  return editOperationSchema.parse({
    ...operation,
    target: {
      kind: 'TIME',
      range: { endMs: Math.max(startMs + 1, endMs), startMs },
    },
  });
}

function assetContext(input: CreativeDirectorInput): AssetContext {
  return {
    allowAiGeneratedAssets: input.allowAiGeneratedAssets,
    assets: input.availableAssets.map((asset) => ({
      assetId: asset.assetId,
      ...(asset.durationMs === undefined
        ? {}
        : { durationMs: asset.durationMs }),
      kind: asset.kind,
      source: asset.source,
    })),
    sourceDurationMs: input.sourceMedia.durationMs,
    sourceMediaId: input.sourceMedia.mediaAssetId,
  };
}

/**
 * Removes fields the canonical schema does not recognise, reporting each one.
 *
 * Providers are sent a flattened response schema: the Editing Language's
 * operation and target unions are discriminated, but a structured-output schema
 * that preserves those branches is either rejected or not enforced, so every
 * variant's fields are merged into one object. That flattening loses mutual
 * exclusivity, and models reliably take the invitation — attaching
 * `keepSourceAudio` to an INSERT_ASSET, or a `range` to a SEMANTIC target.
 * Live runs failed this way every time before this step existed.
 *
 * The offending keys come from Zod's own `unrecognized_keys` issues rather than
 * a hand-maintained list, so this cannot drift from the canonical schema. Only
 * keys the canonical schema rejects outright are removed, nothing is rewritten,
 * and every removal is surfaced as a warning — a pruned field means the model
 * tried to express something the operation cannot carry, which the operator
 * should see rather than have silently discarded.
 */
function pruneUnrecognizedKeys(raw: unknown): {
  readonly value: unknown;
  readonly removed: readonly string[];
} {
  const removed: string[] = [];
  const value: unknown = structuredClone(raw);

  // Each pass can expose the next layer, so iterate until clean; the bound stops
  // a pathological response from looping.
  for (let pass = 0; pass < 5; pass += 1) {
    const attempt = creativeDirectorModelOutputSchema.safeParse(value);
    if (attempt.success) {
      break;
    }
    const unrecognized = attempt.error.issues.filter(
      (issue) => issue.code === 'unrecognized_keys',
    );
    if (unrecognized.length === 0) {
      break;
    }
    for (const issue of unrecognized) {
      const parent = issue.path.reduce<unknown>(
        (node, key) =>
          node !== null && typeof node === 'object'
            ? (node as Record<string, unknown>)[String(key)]
            : undefined,
        value,
      );
      if (parent === null || typeof parent !== 'object') {
        continue;
      }
      for (const key of issue.keys) {
        delete (parent as Record<string, unknown>)[key];
        removed.push([...issue.path, key].join('.'));
      }
    }
  }

  return { removed, value };
}

export function parseCreativeDirectorOutput(
  raw: unknown,
  input: CreativeDirectorInput,
  source: {
    readonly model: string;
    readonly provider: string;
    readonly usage: AiUsage;
  },
): CreativeDirectorOutput {
  const pruned = pruneUnrecognizedKeys(raw);
  const parsed = creativeDirectorModelOutputSchema.safeParse(pruned.value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`)
      .join('; ');
    throw new CreativeDirectorProviderError(
      `The model returned creative direction that did not match the required schema. ${issues}`,
      true,
      'INVALID_RESPONSE',
      source.usage,
    );
  }

  if (
    input.platform !== undefined &&
    parsed.data.editPlan.platform !== input.platform
  ) {
    throw new CreativeDirectorProviderError(
      'The model ignored the required output platform.',
      true,
      'INVALID_RESPONSE',
      source.usage,
    );
  }
  const parentPlanId = parsed.data.editPlan.metadata.parentPlanId;
  if (
    (input.existingEditPlan === undefined && parentPlanId !== undefined) ||
    (input.existingEditPlan !== undefined &&
      parentPlanId !== input.existingEditPlan.id)
  ) {
    throw new CreativeDirectorProviderError(
      'The model returned an invalid EditPlan revision link.',
      true,
      'INVALID_RESPONSE',
      source.usage,
    );
  }

  const explicitlyUnresolved = new Set(
    parsed.data.unresolvedReferences.flatMap((reference) =>
      reference.operationId === undefined ? [] : [reference.operationId],
    ),
  );
  const generatedUnresolved: z.infer<typeof unresolvedReferenceSchema>[] = [];
  const operations = parsed.data.editPlan.operations.map((operation) => {
    if (
      operation.target.kind !== 'SEMANTIC' ||
      explicitlyUnresolved.has(operation.id)
    ) {
      return operation;
    }
    const candidates = semanticCandidates(operation.target.trigger, input);
    const selected = selectCandidate(
      operation,
      candidates,
      input.userInstruction,
    );
    if (selected !== undefined) {
      return resolvedOperation(
        operation,
        selected,
        input.sourceMedia.durationMs,
      );
    }
    generatedUnresolved.push({
      candidates: candidates.slice(0, 20),
      kind: operation.target.trigger.kind,
      operationId: operation.id,
      question:
        candidates.length === 0
          ? `I could not find a reliable ${operation.target.trigger.kind.toLowerCase()} match. What should I use?`
          : `I found ${candidates.length} possible matches. Which occurrence should I use?`,
      reason: candidates.length === 0 ? 'NOT_FOUND' : 'AMBIGUOUS',
    });
    return operation;
  });

  const plan = editPlanSchema.parse({ ...parsed.data.editPlan, operations });
  const validation = validateEditPlan(plan, assetContext(input));
  if (!validation.ok) {
    throw new CreativeDirectorProviderError(
      `The model returned an EditPlan rejected by canonical validation: ${validation.issues
        .map((issue) => issue.code)
        .join(', ')}.`,
      true,
      'INVALID_RESPONSE',
      source.usage,
    );
  }
  const unresolvedReferences = [
    ...parsed.data.unresolvedReferences,
    ...generatedUnresolved,
  ];
  const unresolvedIds = new Set(
    unresolvedReferences.flatMap((reference) =>
      reference.operationId === undefined ? [] : [reference.operationId],
    ),
  );
  for (const operationId of validation.unresolvedOperationIds) {
    if (!unresolvedIds.has(operationId)) {
      throw new CreativeDirectorProviderError(
        'The model left a semantic operation unresolved without explaining it.',
        true,
        'INVALID_RESPONSE',
        source.usage,
      );
    }
  }

  return {
    decisionSummary: parsed.data.decisionSummary,
    editPlan: validation.plan,
    model: source.model,
    provider: source.provider,
    unresolvedReferences,
    usage: source.usage,
    validationStatus:
      validation.renderReady && unresolvedReferences.length === 0
        ? 'VALID'
        : 'UNRESOLVED',
    warnings: [
      ...parsed.data.warnings,
      // A pruned field means the model tried to express something the operation
      // cannot carry. Surfacing it keeps the normalization visible.
      ...pruned.removed.map(
        (path) =>
          `Ignored ${path}: the field is not part of that operation's schema.`,
      ),
    ].slice(0, 30),
  };
}

/** Provider-neutral, precedence-labelled payload. Transcript text stays data. */
export function creativeDirectorUserPrompt(
  input: CreativeDirectorInput,
): string {
  return JSON.stringify({
    availableAssets: input.availableAssets,
    contentEvidence: {
      contentIntelligence: input.contentIntelligence,
      transcript: input.transcript,
    },
    existingEditPlan: input.existingEditPlan,
    instructionLayers: {
      currentUser: input.userInstruction,
      project: input.projectInstructions,
      brandDNA: input.brandDNA,
      referenceStyle: input.referenceStyle,
      creatorPreferences: input.creatorPreferences,
      previousRevisionContext: input.previousInstructions,
    },
    editingLanguageContract: {
      operationTypes: editOperationTypes,
      schemaVersion: editPlanSchemaVersion,
      semanticTriggerKinds: ['PHRASE', 'TOPIC', 'SPEAKER', 'EVENT'],
      targetKinds: ['TIME', 'SEMANTIC'],
      unsupportedAliases: [
        'CUT',
        'SPLIT',
        'TRIM',
        'EXPLICIT_RANGE',
        'TRIGGER_TARGET',
      ],
    },
    outputPlatform: input.platform,
    sourceMedia: input.sourceMedia,
  });
}
