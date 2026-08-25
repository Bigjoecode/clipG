export interface VersionedPrompt {
  readonly id: string;
  readonly template: string;
  readonly version: number;
}

export function definePrompt(prompt: VersionedPrompt): VersionedPrompt {
  if (prompt.version < 1 || !Number.isInteger(prompt.version)) {
    throw new Error('Prompt versions must be positive integers.');
  }

  return Object.freeze({ ...prompt });
}
