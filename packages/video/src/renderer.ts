import type {
  AssetContext,
  AssetKind,
  EditPlan,
  MediaSource,
} from '@clipgenius/editing-language';
import { validateEditPlan } from '@clipgenius/editing-language';

const validatedPlan = Symbol('validated-render-plan');

export type RenderErrorCategory =
  | 'INVALID_EDIT_PLAN'
  | 'MISSING_SOURCE_MEDIA'
  | 'MISSING_ASSET'
  | 'UNSUPPORTED_OPERATION'
  | 'UNSUPPORTED_CODEC'
  | 'RENDERER_FAILURE'
  | 'STORAGE_FAILURE'
  | 'TIMEOUT';

export class RenderError extends Error {
  public constructor(
    public readonly category: RenderErrorCategory,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'RenderError';
  }
}

/** Opaque proof that canonical validation ran and no semantic target remains. */
export interface ValidatedEditPlan {
  readonly plan: EditPlan;
  readonly [validatedPlan]: true;
}

export function validatePlanForRendering(
  input: unknown,
  context: AssetContext,
): ValidatedEditPlan {
  const validation = validateEditPlan(input, context);
  if (!validation.ok) {
    throw new RenderError(
      'INVALID_EDIT_PLAN',
      `EditPlan validation failed: ${validation.issues
        .map((issue) => issue.code)
        .join(', ')}.`,
    );
  }
  if (!validation.renderReady) {
    throw new RenderError(
      'INVALID_EDIT_PLAN',
      `EditPlan contains unresolved semantic operations: ${validation.unresolvedOperationIds.join(', ')}.`,
    );
  }
  return Object.freeze({
    plan: validation.plan,
    [validatedPlan]: true as const,
  });
}

export interface RenderSource {
  readonly hasAudio: boolean;
  readonly mediaAssetId: string;
  /** Absolute worker-local path. Never a URL or an EditPlan field. */
  readonly path: string;
}

export interface ResolvedRenderAsset {
  readonly assetId: string;
  readonly kind: AssetKind;
  /** Absolute worker-local path resolved by the trusted application layer. */
  readonly path: string;
  readonly source: Exclude<MediaSource, 'SOURCE_MEDIA'>;
}

export interface RenderRequest {
  readonly assets: readonly ResolvedRenderAsset[];
  /** Absolute path for a new MP4 artifact. */
  readonly outputPath: string;
  readonly plan: ValidatedEditPlan;
  readonly source: RenderSource;
}

export interface RenderedMedia {
  readonly audioCodec: string | null;
  readonly container: 'mp4';
  readonly durationMs: number;
  readonly height: number;
  readonly path: string;
  readonly sizeBytes: number;
  readonly videoCodec: string;
  readonly width: number;
}

export interface RenderResult {
  readonly backend: string;
  readonly media: RenderedMedia;
  readonly renderDurationMs: number;
  readonly status: 'SUCCEEDED';
  readonly version: string;
  readonly warnings: readonly string[];
}

export interface Renderer {
  render(request: RenderRequest): Promise<RenderResult>;
}
