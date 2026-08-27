import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LoginPage from '../app/login/page.js';
import SignupPage from '../app/signup/page.js';

describe('authentication pages', () => {
  it('renders the email and password login form', async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('renders successful authentication feedback', async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({
          message: 'Signed out successfully.',
        }),
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Signed out successfully.',
    );
  });

  it('renders safe signup validation feedback', async () => {
    render(
      await SignupPage({
        searchParams: Promise.resolve({ error: 'Use a stronger password.' }),
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Use a stronger password.')).toBeInTheDocument();
  });
});
