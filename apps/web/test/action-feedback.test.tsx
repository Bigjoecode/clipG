import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-dom', async () => {
  const reactDom =
    await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...reactDom,
    useFormStatus: () => ({ pending: true }),
  };
});

import { ActionNotice } from '../components/action-notice.js';
import { FormSubmitButton } from '../components/form-submit-button.js';

describe('action feedback', () => {
  it('renders an accessible success message', () => {
    render(<ActionNotice message="Organization saved successfully." />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Organization saved successfully.',
    );
  });

  it('disables a pending submit and shows its progress label', () => {
    render(
      <form>
        <FormSubmitButton
          className="button"
          label="Save organization"
          pendingLabel="Saving organization..."
        />
      </form>,
    );

    expect(
      screen.getByRole('button', { name: 'Saving organization...' }),
    ).toBeDisabled();
  });
});
