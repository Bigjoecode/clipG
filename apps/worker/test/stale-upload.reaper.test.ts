import { describe, expect, it, vi } from 'vitest';

import { StaleUploadReaper } from '../src/media/stale-upload.reaper.js';

describe('StaleUploadReaper', () => {
  it('fails only pending uploads older than the configured cutoff', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const reaper = new StaleUploadReaper(
      { mediaAsset: { updateMany } } as never,
      { maxAgeHours: 24 },
    );
    const now = new Date('2026-08-28T12:00:00.000Z');

    await expect(reaper.reap(now)).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        failureReason: 'The upload was abandoned before it completed.',
        status: 'FAILED',
      },
      where: {
        createdAt: { lt: new Date('2026-08-27T12:00:00.000Z') },
        status: 'UPLOAD_PENDING',
      },
    });
  });
});
