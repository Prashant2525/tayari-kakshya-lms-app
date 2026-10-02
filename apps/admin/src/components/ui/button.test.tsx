import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders its single child when asChild is used (regression: Slot needs exactly one child)', () => {
    render(
      <Button asChild>
        <a href="/roles/new">New role</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'New role' });
    expect(link.getAttribute('href')).toBe('/roles/new');
    expect(link.className).toContain('bg-primary');
  });

  it('disables itself and marks busy while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});
