import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OrganizationsError from '../app/organizations/error.js';

describe('OrganizationsError', () => {
  it('offers an explicit retry when the API is unavailable', () => {
    const retry = vi.fn();
    render(<OrganizationsError retry={retry} />);

    expect(
      screen.getByRole('heading', {
        name: 'ClipGenius could not reach the API',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
