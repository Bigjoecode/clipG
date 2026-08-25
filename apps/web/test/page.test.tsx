import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from '../app/page.js';

describe('home page', () => {
  it('renders the ClipGenius product promise', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', {
        name: /one video\. an entire content campaign\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('ClipGenius')).toBeInTheDocument();
  });
});
