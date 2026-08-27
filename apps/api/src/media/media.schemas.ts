import { z } from 'zod';

export const sourceVideoContentTypes = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export const initiateSourceVideoUploadSchema = z
  .object({
    contentType: z.enum(sourceVideoContentTypes),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine(
        (value) =>
          Array.from(value).every((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint > 31 && codePoint !== 127;
          }),
        { message: 'File name contains unsupported characters.' },
      ),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024 * 1024),
  })
  .strict();

export type InitiateSourceVideoUploadInput = z.infer<
  typeof initiateSourceVideoUploadSchema
>;
