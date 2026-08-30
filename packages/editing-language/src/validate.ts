import { assetContextSchema, type AssetContext } from './assets.js';
import { editPlanSchema, type EditPlan } from './edit-plan.js';
import { operationAsset, type EditOperation } from './operations.js';
import { isTimeTarget } from './targets.js';
import { rangesOverlap, type TimeRange } from './time.js';

export const editPlanIssueCodes = [
  'SCHEMA_INVALID',
  'UNSUPPORTED_SCHEMA_VERSION',
  'SOURCE_MEDIA_MISMATCH',
  'SOURCE_DURATION_MISMATCH',
  'DUPLICATE_OPERATION_ID',
  'RANGE_OUTSIDE_SOURCE',
  'ASSET_NOT_IN_CONTEXT',
  'ASSET_PROVENANCE_MISMATCH',
  'SOURCE_MEDIA_NOT_INSERTABLE',
  'AI_ASSET_NOT_PERMITTED',
  'ASSET_KIND_INVALID',
  'CONFLICTING_OPERATIONS',
  'RETENTION_WITHOUT_SELECTION',
  'TRANSITION_LONGER_THAN_RANGE',
] as const;

export type EditPlanIssueCode = (typeof editPlanIssueCodes)[number];

export interface EditPlanIssue {
  readonly code: EditPlanIssueCode;
  readonly message: string;
  readonly path?: string;
  readonly operationId?: string;
}

export type EditPlanValidation =
  | {
      readonly ok: true;
      readonly plan: EditPlan;
      /**
       * False when the plan still contains semantic targets. Such a plan is
       * structurally valid and safe to store, but a renderer cannot execute it
       * until a later milestone resolves the triggers to time ranges.
       */
      readonly renderReady: boolean;
      readonly unresolvedOperationIds: readonly string[];
    }
  | { readonly ok: false; readonly issues: readonly EditPlanIssue[] };

const assetKindByOperation: Partial<
  Record<EditOperation['type'], readonly ('VIDEO' | 'IMAGE' | 'AUDIO')[]>
> = {
  INSERT_ASSET: ['VIDEO', 'IMAGE'],
  MUSIC: ['AUDIO'],
  REPLACE_ASSET: ['VIDEO', 'IMAGE'],
};

/** Operations that claim exclusive control of the picture over a range. */
const exclusiveVisualTypes = new Set<EditOperation['type']>([
  'REMOVE',
  'REPLACE_ASSET',
]);

function timeRangeOf(operation: EditOperation): TimeRange | undefined {
  return isTimeTarget(operation.target) ? operation.target.range : undefined;
}

/**
 * Validates a plan against the assets and source it claims to edit.
 *
 * A plan is only meaningful relative to a context, so this never validates one
 * in isolation: the same operations are correct for one project and reference
 * non-existent media in another. Model output is untrusted, and anything that
 * cannot be executed faithfully is rejected here rather than degraded later.
 */
export function validateEditPlan(
  input: unknown,
  contextInput: AssetContext,
): EditPlanValidation {
  const contextResult = assetContextSchema.safeParse(contextInput);
  if (!contextResult.success) {
    return {
      issues: [
        {
          code: 'SCHEMA_INVALID',
          message: 'The asset context is not valid.',
        },
      ],
      ok: false,
    };
  }
  const context = contextResult.data;

  const parsed = editPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        code: issue.path.includes('schemaVersion')
          ? ('UNSUPPORTED_SCHEMA_VERSION' as const)
          : ('SCHEMA_INVALID' as const),
        message: issue.message,
        path: issue.path.join('.'),
      })),
      ok: false,
    };
  }

  const plan = parsed.data;
  const issues: EditPlanIssue[] = [];
  const seenIds = new Set<string>();
  const assetsById = new Map(
    context.assets.map((asset) => [asset.assetId, asset]),
  );

  if (plan.source.mediaAssetId !== context.sourceMediaId) {
    issues.push({
      code: 'SOURCE_MEDIA_MISMATCH',
      message: `Plan source ${plan.source.mediaAssetId} does not match the authoritative source ${context.sourceMediaId}.`,
      path: 'source.mediaAssetId',
    });
  }

  if (plan.source.durationMs !== context.sourceDurationMs) {
    issues.push({
      code: 'SOURCE_DURATION_MISMATCH',
      message: `Plan source duration ${plan.source.durationMs}ms does not match the authoritative duration ${context.sourceDurationMs}ms.`,
      path: 'source.durationMs',
    });
  }

  for (const operation of plan.operations) {
    if (seenIds.has(operation.id)) {
      issues.push({
        code: 'DUPLICATE_OPERATION_ID',
        message: `Operation id ${operation.id} appears more than once.`,
        operationId: operation.id,
      });
    }
    seenIds.add(operation.id);

    const range = timeRangeOf(operation);
    if (range !== undefined && range.endMs > context.sourceDurationMs) {
      issues.push({
        code: 'RANGE_OUTSIDE_SOURCE',
        message: `Operation ends at ${range.endMs}ms but the authoritative source is ${context.sourceDurationMs}ms long.`,
        operationId: operation.id,
      });
    }

    if (
      operation.type === 'TRANSITION' &&
      range !== undefined &&
      operation.transition.durationMs > range.endMs - range.startMs
    ) {
      issues.push({
        code: 'TRANSITION_LONGER_THAN_RANGE',
        message: 'The transition is longer than the range it occupies.',
        operationId: operation.id,
      });
    }

    const asset = operationAsset(operation);
    if (asset !== undefined) {
      if (asset.source === 'SOURCE_MEDIA') {
        issues.push({
          code: 'SOURCE_MEDIA_NOT_INSERTABLE',
          message:
            'Original source media is the base of the timeline and cannot be inserted as an overlay asset.',
          operationId: operation.id,
        });
      } else if (
        asset.source === 'AI_GENERATED_ASSET' &&
        !context.allowAiGeneratedAssets
      ) {
        issues.push({
          code: 'AI_ASSET_NOT_PERMITTED',
          message:
            'AI-generated media may only be used when the user has explicitly enabled it.',
          operationId: operation.id,
        });
      }

      const available = assetsById.get(asset.assetId);
      if (available === undefined) {
        issues.push({
          code: 'ASSET_NOT_IN_CONTEXT',
          message: `Asset ${asset.assetId} is not available to this project.`,
          operationId: operation.id,
        });
      } else {
        if (available.source !== asset.source) {
          issues.push({
            code: 'ASSET_PROVENANCE_MISMATCH',
            message: `Asset ${asset.assetId} is ${available.source} but the operation claims ${asset.source}.`,
            operationId: operation.id,
          });
        }
        const allowedKinds = assetKindByOperation[operation.type];
        if (
          allowedKinds !== undefined &&
          !allowedKinds.includes(available.kind)
        ) {
          issues.push({
            code: 'ASSET_KIND_INVALID',
            message: `${operation.type} cannot use a ${available.kind} asset.`,
            operationId: operation.id,
          });
        }
      }
    }
  }

  if (
    plan.retention === 'KEEP_ONLY_SELECTED' &&
    !plan.operations.some((operation) => operation.type === 'KEEP')
  ) {
    issues.push({
      code: 'RETENTION_WITHOUT_SELECTION',
      message:
        'KEEP_ONLY_SELECTED requires at least one KEEP operation, otherwise nothing survives.',
    });
  }

  issues.push(...detectConflicts(plan));

  if (issues.length > 0) {
    return { issues, ok: false };
  }

  const unresolvedOperationIds = plan.operations
    .filter((operation) => !isTimeTarget(operation.target))
    .map((operation) => operation.id);

  return {
    ok: true,
    plan,
    renderReady: unresolvedOperationIds.length === 0,
    unresolvedOperationIds,
  };
}

/**
 * Deterministic detection of the conflicts that are unambiguous.
 *
 * Only cases with no sensible interpretation are reported: two operations both
 * claiming to own the picture over the same span, or the same span being both
 * removed and kept. Overlapping zooms, captions, or music are legitimate
 * layering and are left alone — resolving genuinely ambiguous intent is not
 * something a validator should guess at.
 */
function detectConflicts(plan: EditPlan): EditPlanIssue[] {
  const issues: EditPlanIssue[] = [];
  const timed = plan.operations
    .map((operation) => ({ operation, range: timeRangeOf(operation) }))
    .filter(
      (entry): entry is { operation: EditOperation; range: TimeRange } =>
        entry.range !== undefined,
    );

  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const left = timed[i];
      const right = timed[j];
      if (left === undefined || right === undefined) {
        continue;
      }
      if (!rangesOverlap(left.range, right.range)) {
        continue;
      }

      const bothExclusive =
        exclusiveVisualTypes.has(left.operation.type) &&
        exclusiveVisualTypes.has(right.operation.type);
      const removeVersusKeep =
        (left.operation.type === 'REMOVE' && right.operation.type === 'KEEP') ||
        (left.operation.type === 'KEEP' && right.operation.type === 'REMOVE');
      const duplicateSpeed =
        left.operation.type === 'SPEED' && right.operation.type === 'SPEED';

      if (bothExclusive || removeVersusKeep || duplicateSpeed) {
        issues.push({
          code: 'CONFLICTING_OPERATIONS',
          message: `${left.operation.type} and ${right.operation.type} both claim the same range.`,
          operationId: right.operation.id,
        });
      }
    }
  }

  return issues;
}

/**
 * Round-trips a plan through JSON. Storage and transport must not change
 * meaning, so this is the supported way to read a stored plan back.
 */
export function parseEditPlan(
  serialized: string,
  context: AssetContext,
): EditPlanValidation {
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return {
      issues: [
        { code: 'SCHEMA_INVALID', message: 'The edit plan is not valid JSON.' },
      ],
      ok: false,
    };
  }
  return validateEditPlan(raw, context);
}

export function serializeEditPlan(plan: EditPlan): string {
  return JSON.stringify(plan);
}
