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

  it('does not submit a surrounding form unless it is a submit button (regression: media picker saved the form)', () => {
    let submits = 0;
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submits += 1;
        }}
      >
        <Button>Choose</Button>
        <Button type="submit">Save</Button>
      </form>,
    );
    screen.getByRole('button', { name: 'Choose' }).click();
    expect(submits).toBe(0);
    screen.getByRole('button', { name: 'Save' }).click();
    expect(submits).toBe(1);
  });

  it('disables itself and marks busy while loading', () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});
