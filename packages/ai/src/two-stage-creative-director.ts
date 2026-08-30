import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  editOperationSchema,
  editOperationTypes,
  editPlanSchema,
  editPlatforms,
  validateEditPlan,
  type EditOperation,
  type EditOperationType,
  type EditPlan,
} from '@clipgenius/editing-language';

import {
  CreativeDirectorProviderError,
  creativeDirectorInputSchema,
  creativeDirectorUserPrompt,
  parseCreativeDirectorOutput,
  type CreativeDirectorInput,
  type CreativeDirectorOutput,
  type CreativeDirectorProviderResponse,
  type CreativeDirectorRequestContext,
} from './creative-director.js';
import { estimateAiCost } from './pricing.js';
import { emptyAiUsage, type AiErrorCategory, type AiUsage } from './usage.js';

export const creativeDirectorStages = [
  'INTENT',
  'OPERATIONS',
  'REPAIR',
] as const;
export type CreativeDirectorStage = (typeof creativeDirectorStages)[number];
export const targetKinds = ['TIME', 'SEMANTIC'] as const;
export const semanticKinds = ['PHRASE', 'TOPIC', 'SPEAKER', 'EVENT'] as const;

const intentTargetSchema = z
  .object({
    kind: z.enum(targetKinds),
    semanticKind: z.enum(semanticKinds).optional(),
  })
  .strict()
  .refine(
    (target) => target.kind !== 'SEMANTIC' || target.semanticKind !== undefined,
    { message: 'semanticKind is required for a semantic target.' },
  );

export const operationIntentSchema = z
  .object({
    assetId: z.uuid().optional(),
    id: z.uuid(),
    instruction: z.string().trim().min(1).max(500),
    target: intentTargetSchema,
    type: z.enum(editOperationTypes),
  })
  .strict();

export const operationIntentDraftSchema = operationIntentSchema.omit({
  id: true,
});

export const operationIntentPlanSchema = z
  .object({
    aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:5']),
    decisionSummary: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
    intents: z.array(operationIntentSchema).min(1).max(40),
    objective: z.string().trim().min(1).max(500),
    planId: z.uuid(),
    platform: z.enum(editPlatforms),
    retention: z.enum(['KEEP_ALL_EXCEPT_REMOVED', 'KEEP_ONLY_SELECTED']),
    warnings: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  })
  .strict();

export const operationIntentPlanDraftSchema = operationIntentPlanSchema
  .omit({ intents: true, planId: true })
  .extend({
    intents: z.array(operationIntentDraftSchema).min(1).max(40),
  })
  .strict();

export type OperationIntent = z.infer<typeof operationIntentSchema>;
export type OperationIntentPlan = z.infer<typeof operationIntentPlanSchema>;

function intentDraftValue(raw: unknown): unknown {
  const record = isRecord(raw) ? raw : {};
  const rawIntents: readonly unknown[] = Array.isArray(record.intents)
    ? (record.intents as unknown[])
    : [];
  const plan = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'planId'),
  );
  return {
    ...plan,
    intents: rawIntents.map((intent) => {
      if (!isRecord(intent)) return intent;
      return Object.fromEntries(
        Object.entries(intent).filter(([key]) => key !== 'id'),
      );
    }),
  };
}

function normalizeIntentPlan(raw: unknown): OperationIntentPlan {
  const record = isRecord(raw) ? raw : {};
  const rawIntents = Array.isArray(record.intents) ? record.intents : [];
  const draft = operationIntentPlanDraftSchema.parse(intentDraftValue(raw));
  const suppliedPlanId = z.uuid().safeParse(record.planId);
  return operationIntentPlanSchema.parse({
    ...draft,
    intents: draft.intents.map((intent, index) => {
      const supplied = z
        .uuid()
        .safeParse(
          isRecord(rawIntents[index]) ? rawIntents[index].id : undefined,
        );
      return { ...intent, id: supplied.success ? supplied.data : randomUUID() };
    }),
    planId: suppliedPlanId.success ? suppliedPlanId.data : randomUUID(),
  });
}

export type CreativeDirectorSchemaRequest =
  | { readonly kind: 'INTENT' }
  | {
      readonly groups: readonly OperationSchemaGroup[];
      readonly kind: 'OPERATIONS';
    }
  | {
      readonly kind: 'OPERATION';
      readonly semanticKind?: (typeof semanticKinds)[number];
      readonly targetKind: (typeof targetKinds)[number];
      readonly type: EditOperationType;
    };

export interface OperationSchemaGroup {
  readonly count: number;
  readonly key: string;
  readonly semanticKind?: (typeof semanticKinds)[number];
  readonly targetKind: (typeof targetKinds)[number];
  readonly type: EditOperationType;
}

export interface StagedCreativeDirectorProviderRequest {
  readonly input: string;
  readonly safetyIdentifier: string;
  readonly schema: CreativeDirectorSchemaRequest;
  readonly stage: CreativeDirectorStage;
  readonly systemPrompt: string;
}

export interface StagedCreativeDirectorProvider {
  generateStage(
    request: StagedCreativeDirectorProviderRequest,
  ): Promise<CreativeDirectorProviderResponse>;
}

export interface CreativeDirectorAttempt {
  readonly attempt: number;
  readonly errorCategory?: AiErrorCategory;
  readonly estimatedCostMicros: bigint | null;
  readonly latencyMs: number;
  readonly model: string;
  readonly provider: string;
  readonly stage: CreativeDirectorStage;
  readonly status: 'SUCCEEDED' | 'FAILED';
  readonly usage: AiUsage;
}

export interface CreativeDirectorReliabilityMetrics {
  readonly assetResolutionSuccessRate: number;
  readonly averageProviderCalls: number;
  readonly estimatedCostMicros: bigint | null;
  readonly finalValidEditPlanRate: number;
  readonly providerCalls: number;
  readonly repairSuccessRate: number;
  readonly stage1SuccessRate: number;
  readonly stage2FirstPassValidRate: number;
  readonly totalLatencyMs: number;
  readonly unresolvedSemanticRate: number;
}

export interface TwoStageCreativeDirectorOutput extends CreativeDirectorOutput {
  readonly attempts: readonly CreativeDirectorAttempt[];
  readonly metrics: CreativeDirectorReliabilityMetrics;
}

export interface TwoStageCreativeDirectorOptions {
  readonly systemPrompt: string;
}

type AttemptObserver = (
  attempt: CreativeDirectorAttempt,
) => Promise<void> | void;

function sumUsage(attempts: readonly CreativeDirectorAttempt[]): AiUsage {
  const sum = (field: keyof AiUsage): number | null => {
    const values = attempts
      .map((attempt) => attempt.usage[field])
      .filter((value): value is number => typeof value === 'number');
    return values.length === 0
      ? null
      : values.reduce((total, value) => total + value, 0);
  };
  return {
    audioSeconds: sum('audioSeconds'),
    cachedInputTokens: sum('cachedInputTokens'),
    cacheWriteTokens: sum('cacheWriteTokens'),
    inputTokens: sum('inputTokens'),
    latencyMs: attempts.reduce(
      (total, attempt) => total + attempt.latencyMs,
      0,
    ),
    outputTokens: sum('outputTokens'),
    reasoningTokens: sum('reasoningTokens'),
    requestId: null,
  };
}

function groupKey(intent: OperationIntent): string {
  return [
    intent.type,
    intent.target.kind,
    intent.target.semanticKind ?? 'NONE',
  ].join('__');
}

function operationGroups(
  intents: readonly OperationIntent[],
): readonly OperationSchemaGroup[] {
  const groups = new Map<string, OperationSchemaGroup>();
  for (const intent of intents) {
    const key = groupKey(intent);
    const existing = groups.get(key);
    groups.set(key, {
      count: (existing?.count ?? 0) + 1,
      key,
      ...(intent.target.semanticKind === undefined
        ? {}
        : { semanticKind: intent.target.semanticKind }),
      targetKind: intent.target.kind,
      type: intent.type,
    });
  }
  return [...groups.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseGroupedOperations(
  raw: unknown,
  intents: readonly OperationIntent[],
): Map<string, unknown> {
  if (!isRecord(raw) || !isRecord(raw.groups)) {
    return new Map();
  }
  const output = new Map<string, unknown>();
  const intentsByGroup = new Map<string, OperationIntent[]>();
  for (const intent of intents) {
    const key = groupKey(intent);
    intentsByGroup.set(key, [...(intentsByGroup.get(key) ?? []), intent]);
  }
  for (const [key, groupIntents] of intentsByGroup) {
    const values = raw.groups[key];
    if (!Array.isArray(values) || values.length !== groupIntents.length) {
      continue;
    }
    values.forEach((value, index) => {
      const intent = groupIntents[index];
      if (intent !== undefined) output.set(intent.id, value);
    });
  }
  return output;
}

function operationIssues(
  raw: unknown,
  intent: OperationIntent,
): readonly string[] {
  const parsed = editOperationSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'operation'}: ${issue.message}`,
    );
  }
  const issues: string[] = [];
  if (parsed.data.id !== intent.id) issues.push(`id must be ${intent.id}`);
  if (parsed.data.type !== intent.type)
    issues.push(`type must be ${intent.type}`);
  if (parsed.data.target.kind !== intent.target.kind) {
    issues.push(`target.kind must be ${intent.target.kind}`);
  } else if (
    parsed.data.target.kind === 'SEMANTIC' &&
    parsed.data.target.trigger.kind !== intent.target.semanticKind
  ) {
    issues.push(`target.trigger.kind must be ${intent.target.semanticKind}`);
  }
  if (
    intent.assetId !== undefined &&
    'asset' in parsed.data &&
    parsed.data.asset.assetId !== intent.assetId
  ) {
    issues.push(`asset.assetId must be ${intent.assetId}`);
  }
  return issues;
}

function planFrom(
  intentPlan: OperationIntentPlan,
  input: CreativeDirectorInput,
  operations: readonly EditOperation[],
): EditPlan {
  return editPlanSchema.parse({
    id: intentPlan.planId,
    metadata: {
      createdBy: 'AI',
      ...(input.existingEditPlan === undefined
        ? {}
        : { parentPlanId: input.existingEditPlan.id }),
    },
    objective: intentPlan.objective,
    operations,
    output: { aspectRatio: intentPlan.aspectRatio },
    platform: intentPlan.platform,
    retention: intentPlan.retention,
    schemaVersion: '1.0',
    source: input.sourceMedia,
  });
}

function canonicalAssetContext(input: CreativeDirectorInput) {
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

function intentPrompt(input: CreativeDirectorInput): string {
  return JSON.stringify({
    task: 'Identify the minimal ordered operation intents. Do not generate operation fields.',
    ...(JSON.parse(creativeDirectorUserPrompt(input)) as Record<
      string,
      unknown
    >),
  });
}

function operationPrompt(
  input: CreativeDirectorInput,
  plan: OperationIntentPlan,
): string {
  return JSON.stringify({
    availableAssets: input.availableAssets,
    contentEvidence: {
      contentIntelligence: input.contentIntelligence,
      transcript: input.transcript,
    },
    intentPlan: plan,
    sourceMedia: input.sourceMedia,
    task: 'Generate exactly one complete canonical operation for each intent, in group order.',
    userInstruction: input.userInstruction,
  });
}

function repairPrompt(
  input: CreativeDirectorInput,
  intent: OperationIntent,
  invalid: unknown,
  issues: readonly string[],
): string {
  const asset = input.availableAssets.find(
    (candidate) => candidate.assetId === intent.assetId,
  );
  return JSON.stringify({
    intent,
    invalidOperation: invalid,
    issues,
    relevantAsset: asset,
    sourceDurationMs: input.sourceMedia.durationMs,
    task: 'Regenerate this operation completely. Do not invent creative values or asset IDs.',
    userInstruction: input.userInstruction,
  });
}

export class TwoStageCreativeDirector {
  public constructor(
    private readonly provider: StagedCreativeDirectorProvider,
    private readonly options: TwoStageCreativeDirectorOptions,
  ) {}

  public async direct(
    inputValue: unknown,
    context: CreativeDirectorRequestContext & {
      readonly onAttempt?: AttemptObserver;
    },
  ): Promise<TwoStageCreativeDirectorOutput> {
    const input = creativeDirectorInputSchema.parse(inputValue);
    const attempts: CreativeDirectorAttempt[] = [];
    let nextAttempt = 1;
    const invoke = async (
      stage: CreativeDirectorStage,
      prompt: string,
      schema: CreativeDirectorSchemaRequest,
      validate: (raw: unknown) => readonly string[],
    ): Promise<CreativeDirectorProviderResponse> => {
      let response: CreativeDirectorProviderResponse;
      try {
        response = await this.provider.generateStage({
          input: prompt,
          safetyIdentifier: context.safetyIdentifier,
          schema,
          stage,
          systemPrompt: this.options.systemPrompt,
        });
      } catch (error) {
        const providerError =
          error instanceof CreativeDirectorProviderError ? error : undefined;
        const usage = providerError?.usage ?? emptyAiUsage(0);
        const failed = this.attempt(
          nextAttempt++,
          stage,
          'FAILED',
          providerError?.category ?? 'UNKNOWN',
          providerError?.usage === undefined ? 'unknown' : 'gemini',
          providerError?.usage === undefined ? 'unknown' : 'gemini-3.6-flash',
          usage,
        );
        attempts.push(failed);
        await context.onAttempt?.(failed);
        throw error;
      }
      const issues = validate(response.raw);
      const status = issues.length === 0 ? 'SUCCEEDED' : 'FAILED';
      const attempt = this.attempt(
        nextAttempt++,
        stage,
        status,
        status === 'FAILED' ? 'INVALID_RESPONSE' : undefined,
        response.provider,
        response.model,
        response.usage,
      );
      attempts.push(attempt);
      await context.onAttempt?.(attempt);
      if (issues.length > 0 && stage === 'INTENT') {
        throw new CreativeDirectorProviderError(
          `Creative Director Stage 1 was invalid: ${issues.slice(0, 10).join('; ')}`,
          true,
          'INVALID_RESPONSE',
          response.usage,
        );
      }
      return response;
    };

    const stage1 = await invoke(
      'INTENT',
      intentPrompt(input),
      { kind: 'INTENT' },
      (raw) => {
        const parsed = operationIntentPlanDraftSchema.safeParse(
          intentDraftValue(raw),
        );
        return parsed.success
          ? []
          : parsed.error.issues.map(
              (issue) => `${issue.path.join('.')}: ${issue.message}`,
            );
      },
    );
    const intentPlan = normalizeIntentPlan(stage1.raw);
    if (
      input.platform !== undefined &&
      intentPlan.platform !== input.platform
    ) {
      throw new CreativeDirectorProviderError(
        'Stage 1 ignored the required platform.',
        true,
        'INVALID_RESPONSE',
        stage1.usage,
      );
    }

    const groups = operationGroups(intentPlan.intents);
    const stage2 = await invoke(
      'OPERATIONS',
      operationPrompt(input, intentPlan),
      { groups, kind: 'OPERATIONS' },
      (raw) => {
        const candidates = parseGroupedOperations(raw, intentPlan.intents);
        return intentPlan.intents.flatMap((intent) => {
          const candidate = candidates.get(intent.id);
          return candidate === undefined
            ? [
                `groups.${groupKey(intent)} must contain the operation for ${intent.id}`,
              ]
            : operationIssues(candidate, intent);
        });
      },
    );
    const rawOperations = parseGroupedOperations(
      stage2.raw,
      intentPlan.intents,
    );
    const operations: EditOperation[] = [];
    const repairedIds = new Set<string>();
    let firstPassValid = 0;
    let repairSuccess = 0;

    for (const intent of intentPlan.intents) {
      let raw = rawOperations.get(intent.id);
      let issues = operationIssues(raw, intent);
      if (issues.length === 0) {
        firstPassValid += 1;
      } else {
        repairedIds.add(intent.id);
        const repair = await invoke(
          'REPAIR',
          repairPrompt(input, intent, raw, issues),
          {
            kind: 'OPERATION',
            ...(intent.target.semanticKind === undefined
              ? {}
              : { semanticKind: intent.target.semanticKind }),
            targetKind: intent.target.kind,
            type: intent.type,
          },
          (candidate) => operationIssues(candidate, intent),
        );
        raw = repair.raw;
        issues = operationIssues(raw, intent);
        if (issues.length > 0) {
          throw new CreativeDirectorProviderError(
            `Creative Director repair budget exhausted for ${intent.type}: ${issues.join('; ')}`,
            false,
            'INVALID_RESPONSE',
            repair.usage,
          );
        }
        repairSuccess += 1;
      }
      operations.push(editOperationSchema.parse(raw));
    }

    let plan = planFrom(intentPlan, input, operations);
    let canonical = validateEditPlan(plan, canonicalAssetContext(input));
    if (!canonical.ok) {
      for (const issue of canonical.issues) {
        if (
          issue.operationId === undefined ||
          repairedIds.has(issue.operationId)
        )
          continue;
        const index = operations.findIndex(
          (operation) => operation.id === issue.operationId,
        );
        const intent = intentPlan.intents.find(
          (candidate) => candidate.id === issue.operationId,
        );
        if (index < 0 || intent === undefined) continue;
        repairedIds.add(intent.id);
        const repair = await invoke(
          'REPAIR',
          repairPrompt(input, intent, operations[index], [issue.message]),
          {
            kind: 'OPERATION',
            ...(intent.target.semanticKind === undefined
              ? {}
              : { semanticKind: intent.target.semanticKind }),
            targetKind: intent.target.kind,
            type: intent.type,
          },
          (candidate) => operationIssues(candidate, intent),
        );
        operations[index] = editOperationSchema.parse(repair.raw);
        repairSuccess += 1;
      }
      plan = planFrom(intentPlan, input, operations);
      canonical = validateEditPlan(plan, canonicalAssetContext(input));
      if (!canonical.ok) {
        throw new CreativeDirectorProviderError(
          `Canonical EditPlan validation failed: ${canonical.issues.map((issue) => issue.code).join(', ')}.`,
          false,
          'INVALID_RESPONSE',
          sumUsage(attempts),
        );
      }
    }

    const usage = sumUsage(attempts);
    const output = parseCreativeDirectorOutput(
      {
        decisionSummary: intentPlan.decisionSummary,
        editPlan: plan,
        unresolvedReferences: [],
        warnings: intentPlan.warnings,
      },
      input,
      { model: stage2.model, provider: stage2.provider, usage },
    );
    const unresolved = output.unresolvedReferences.length;
    const assetIntents = intentPlan.intents.filter(
      (intent) => intent.assetId !== undefined,
    );
    const estimatedCosts = attempts.map(
      (attempt) => attempt.estimatedCostMicros,
    );
    const estimatedCostMicros = estimatedCosts.every((cost) => cost === null)
      ? null
      : estimatedCosts.reduce<bigint>(
          (total, cost) => total + (cost ?? 0n),
          0n,
        );
    return {
      ...output,
      attempts,
      metrics: {
        assetResolutionSuccessRate:
          assetIntents.length === 0
            ? 1
            : assetIntents.filter((intent) =>
                operations.some(
                  (operation) =>
                    operation.id === intent.id &&
                    'asset' in operation &&
                    operation.asset.assetId === intent.assetId,
                ),
              ).length / assetIntents.length,
        averageProviderCalls: attempts.length,
        estimatedCostMicros,
        finalValidEditPlanRate: 1,
        providerCalls: attempts.length,
        repairSuccessRate:
          repairedIds.size === 0 ? 1 : repairSuccess / repairedIds.size,
        stage1SuccessRate: 1,
        stage2FirstPassValidRate: firstPassValid / intentPlan.intents.length,
        totalLatencyMs: usage.latencyMs,
        unresolvedSemanticRate: unresolved / intentPlan.intents.length,
      },
    };
  }

  private attempt(
    attempt: number,
    stage: CreativeDirectorStage,
    status: 'SUCCEEDED' | 'FAILED',
    errorCategory: AiErrorCategory | undefined,
    provider: string,
    model: string,
    usage: AiUsage,
  ): CreativeDirectorAttempt {
    return {
      attempt,
      ...(errorCategory === undefined ? {} : { errorCategory }),
      estimatedCostMicros: estimateAiCost({
        model,
        operation: 'CREATIVE_DIRECTOR',
        provider,
        usage,
      }).estimatedCostMicros,
      latencyMs: usage.latencyMs,
      model,
      provider,
      stage,
      status,
      usage,
    };
  }
}
