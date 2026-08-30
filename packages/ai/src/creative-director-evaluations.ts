import type { CreativeDirectorInput } from './creative-director.js';

export const creativeDirectorEvaluationDimensions = [
  'INSTRUCTION_FIDELITY',
  'TIMESTAMP_ACCURACY',
  'ASSET_ACCURACY',
  'SEMANTIC_RESOLUTION',
  'SOURCE_PRESERVATION',
  'EDIT_PLAN_VALIDITY',
] as const;

export interface CreativeDirectorEvaluationFixture {
  readonly id: string;
  readonly category: string;
  readonly input: CreativeDirectorInput;
  readonly measures: readonly (typeof creativeDirectorEvaluationDimensions)[number][];
}

const sourceMedia = {
  durationMs: 120_000,
  mediaAssetId: '11111111-1111-4111-8111-111111111111',
  source: 'SOURCE_MEDIA' as const,
};
const videoAsset = {
  assetId: '22222222-2222-4222-8222-222222222222',
  durationMs: 30_000,
  kind: 'VIDEO' as const,
  label: 'Jerusalem video',
  source: 'USER_ASSET' as const,
  tags: ['jerusalem'],
};
const imageAsset = {
  assetId: '33333333-3333-4333-8333-333333333333',
  kind: 'IMAGE' as const,
  label: 'Paul portrait',
  source: 'USER_ASSET' as const,
  tags: ['paul', 'apostles'],
};
const transcript = {
  diarized: true,
  id: '44444444-4444-4444-8444-444444444444',
  segments: [
    {
      endMs: 8_000,
      id: '55555555-5555-4555-8555-555555555551',
      speaker: 'Speaker 1',
      startMs: 0,
      text: 'Welcome. Today we begin with faith.',
    },
    {
      endMs: 28_000,
      id: '55555555-5555-4555-8555-555555555552',
      speaker: 'Speaker 1',
      startMs: 20_000,
      text: 'The apostles carried this message forward.',
    },
    {
      endMs: 68_000,
      id: '55555555-5555-4555-8555-555555555553',
      speaker: 'Speaker 2',
      startMs: 60_000,
      text: 'Paul also spoke about faith and action.',
    },
  ],
};
const contentIntelligence = {
  opportunities: [
    {
      endMs: 28_000,
      id: '66666666-6666-4666-8666-666666666661',
      startMs: 20_000,
      summary: 'A teaching about the apostles carrying the message.',
      title: 'The apostles and the message',
      topic: 'apostles',
      type: 'INSIGHT',
    },
    {
      endMs: 68_000,
      id: '66666666-6666-4666-8666-666666666662',
      startMs: 60_000,
      summary: 'Paul connects faith with action.',
      title: 'Faith requires action',
      topic: 'Paul',
      type: 'INSIGHT',
    },
  ],
  summary: 'A sermon about faith, the apostles, and action.',
  topics: ['faith', 'apostles', 'Paul'],
};

function fixture(
  id: string,
  category: string,
  userInstruction: string,
  measures: CreativeDirectorEvaluationFixture['measures'],
  overrides: Partial<CreativeDirectorInput> = {},
): CreativeDirectorEvaluationFixture {
  return {
    category,
    id,
    input: {
      allowAiGeneratedAssets: false,
      availableAssets: [videoAsset, imageAsset],
      contentIntelligence,
      creatorPreferences: { autonomy: 'BALANCED' },
      previousInstructions: [],
      projectInstructions: [],
      sourceMedia,
      transcript,
      userInstruction,
      ...overrides,
    },
    measures,
  };
}

const validity = ['SOURCE_PRESERVATION', 'EDIT_PLAN_VALIDITY'] as const;

/**
 * A deterministic coverage set, not a quality benchmark. Model quality needs a
 * larger, human-labelled evaluation corpus before any broad claim is made.
 */
export const creativeDirectorEvaluationFixtures = [
  fixture(
    'remove-timestamp',
    'REMOVE_TIMESTAMP',
    'Remove the first 8 seconds.',
    ['INSTRUCTION_FIDELITY', 'TIMESTAMP_ACCURACY', ...validity],
  ),
  fixture(
    'insert-user-asset',
    'INSERT_USER_ASSET',
    'Insert my Jerusalem video at 20 seconds for 5 seconds.',
    [
      'INSTRUCTION_FIDELITY',
      'TIMESTAMP_ACCURACY',
      'ASSET_ACCURACY',
      ...validity,
    ],
  ),
  fixture(
    'phrase-reference',
    'PHRASE',
    "When I say 'carried this message', add emphasis.",
    ['SEMANTIC_RESOLUTION', ...validity],
  ),
  fixture(
    'topic-reference',
    'TOPIC',
    'When I discuss the apostles, show my image.',
    ['ASSET_ACCURACY', 'SEMANTIC_RESOLUTION', ...validity],
  ),
  fixture('speaker-reference', 'SPEAKER', 'Emphasize Speaker 2.', [
    'SEMANTIC_RESOLUTION',
    ...validity,
  ]),
  fixture('event-reference', 'EVENT', 'Highlight the faith insight.', [
    'SEMANTIC_RESOLUTION',
    ...validity,
  ]),
  fixture(
    'caption-instruction',
    'CAPTION',
    'Make the captions smaller and clean.',
    ['INSTRUCTION_FIDELITY', ...validity],
  ),
  fixture(
    'visual-effect',
    'VISUAL',
    'Add a subtle slow zoom from 20 to 28 seconds.',
    ['INSTRUCTION_FIDELITY', 'TIMESTAMP_ACCURACY', ...validity],
  ),
  fixture(
    'platform',
    'PLATFORM',
    'Make this engaging for Instagram.',
    ['INSTRUCTION_FIDELITY', ...validity],
    { platform: 'INSTAGRAM' },
  ),
  fixture(
    'general-direction',
    'AUTONOMY',
    'Make this more engaging without changing my words.',
    ['INSTRUCTION_FIDELITY', ...validity],
  ),
  fixture(
    'conflict',
    'CONFLICT',
    'Use clean static captions, regardless of other preferences.',
    ['INSTRUCTION_FIDELITY', ...validity],
    {
      brandDNA: {
        captionPreference: 'Large animated captions',
        editingPrinciples: [],
      },
    },
  ),
  fixture(
    'ambiguous-semantic',
    'AMBIGUOUS',
    'Whenever I mention faith, add emphasis.',
    ['SEMANTIC_RESOLUTION', ...validity],
  ),
  fixture(
    'missing-asset',
    'MISSING_ASSET',
    'Insert my Rome video at 20 seconds.',
    ['ASSET_ACCURACY', ...validity],
  ),
  fixture('invalid-provenance', 'PROVENANCE', 'Use only my uploaded assets.', [
    'ASSET_ACCURACY',
    ...validity,
  ]),
  fixture(
    'reference-conflict',
    'REFERENCE_PRECEDENCE',
    'Do not animate captions.',
    ['INSTRUCTION_FIDELITY', ...validity],
    { referenceStyle: { captionBehavior: 'DYNAMIC' } },
  ),
  fixture('source-preservation', 'SOURCE_PRESERVATION', 'Make it cinematic.', [
    'SOURCE_PRESERVATION',
    'EDIT_PLAN_VALIDITY',
  ]),
  fixture('revision', 'REVISION', 'Make the captions smaller.', [
    'INSTRUCTION_FIDELITY',
    ...validity,
  ]),
] as const satisfies readonly CreativeDirectorEvaluationFixture[];
