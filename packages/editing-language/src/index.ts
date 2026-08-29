/**
 * The ClipGenius Editing Language.
 *
 * A deterministic, typed, versioned description of *what* should happen to a
 * piece of media. It deliberately knows nothing about FFmpeg, Remotion, browser
 * APIs, or any AI provider: a rendering engine reads a validated plan and
 * decides how to execute it, and swapping that engine must not require changing
 * a single stored plan.
 *
 * The contract is:
 *
 *   user or AI instruction -> EditPlan -> validation -> renderer
 *
 * Nothing downstream of validation is allowed to reinterpret a plan, and nothing
 * upstream may hand a renderer a plan that has not passed it.
 */
export {
  assetContextSchema,
  assetKinds,
  assetReferenceSchema,
  availableAssetSchema,
  mediaSources,
} from './assets.js';
export type {
  AssetContext,
  AssetKind,
  AssetReference,
  AvailableAsset,
  MediaSource,
} from './assets.js';

export {
  editPlanMetadataSchema,
  editPlanOutputSchema,
  editPlanSchema,
  editPlanSchemaVersion,
  editPlanSourceSchema,
  editPlatforms,
  retentionModes,
  supportedEditPlanSchemaVersions,
} from './edit-plan.js';
export type {
  EditPlan,
  EditPlanMetadata,
  EditPlanSource,
} from './edit-plan.js';

export {
  aspectRatioSchema,
  aspectRatios,
  easings,
  easingSchema,
  fitModes,
  gainDecibelsSchema,
  normalizedPointSchema,
  normalizedRectSchema,
  textPositions,
  textStyleSchema,
  transitionSchema,
  transitionTypes,
} from './effects.js';
export type { NormalizedPoint, NormalizedRect, TextStyle } from './effects.js';

export {
  editOperationSchema,
  editOperationTypes,
  operationAsset,
  operationIntents,
} from './operations.js';
export type { EditOperation, EditOperationType } from './operations.js';

export {
  isTimeTarget,
  occurrenceSchema,
  operationTargetSchema,
  phraseMatchModes,
  semanticTriggerSchema,
  triggerOccurrences,
} from './targets.js';
export type { OperationTarget, SemanticTrigger } from './targets.js';

export {
  durationMillisecondsSchema,
  formatTimecode,
  maxTimelineMilliseconds,
  millisecondsSchema,
  millisecondsToSeconds,
  rangeContains,
  rangeDurationMs,
  rangesOverlap,
  secondsToMilliseconds,
  timeRangeSchema,
} from './time.js';
export type { TimeRange } from './time.js';

export {
  editPlanIssueCodes,
  parseEditPlan,
  serializeEditPlan,
  validateEditPlan,
} from './validate.js';
export type {
  EditPlanIssue,
  EditPlanIssueCode,
  EditPlanValidation,
} from './validate.js';

export {
  apostlesImagesExample,
  exampleAssetContext,
  exampleEditPlans,
  insertUserVideoExample,
  reframeVerticalExample,
  removeOpeningExample,
  slowZoomExample,
  smallerCaptionsExample,
  trimIntroExample,
} from './examples.js';
