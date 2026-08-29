import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';

const mocks = vi.hoisted(() => ({ suggest: vi.fn() }));

vi.mock('./work.actions', () => ({ suggestWorkTagsAction: mocks.suggest }));

import { WorkTagInput } from './work-tag-input';

describe('WorkTagInput', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('suggests an existing Published Tag and selects it with Enter', async () => {
    mocks.suggest.mockResolvedValue({
      outcome: 'success',
      suggestions: [
        {
          activeWorkCount: 4,
          displayLabel: 'React',
          publicId: '64000000-0000-4000-8000-000000000001',
        },
      ],
    });
    const onChange = vi.fn();
    renderInput([], onChange);

    fireEvent.change(screen.getByRole('combobox', { name: 'ค้นหาหรือสร้างแท็ก' }), {
      target: { value: 'reac' },
    });
    expect(await screen.findByRole('option', { name: /React/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['React']);
  });

  it('creates a new provisional Tag with Enter when no suggestion matches', async () => {
    mocks.suggest.mockResolvedValue({ outcome: 'success', suggestions: [] });
    const onChange = vi.fn();
    renderInput([], onChange);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'WebXR' } });
    expect(await screen.findByRole('option', { name: /สร้างแท็ก.*WebXR/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['WebXR']);
  });

  it('does not treat a comma as a delimiter or allow it inside a Tag', () => {
    const onChange = vi.fn();
    renderInput([], onChange);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'React,Vue' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('แท็กห้ามมีเครื่องหมายจุลภาค')).toBeTruthy();
  });

  it('removes the last selected Tag with Backspace from an empty input', () => {
    const onChange = vi.fn();
    renderInput(['React', 'TypeScript'], onChange);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith(['React']);
  });

  it('moves through suggestions with the arrow keys before selecting', async () => {
    mocks.suggest.mockResolvedValue({
      outcome: 'success',
      suggestions: [
        {
          activeWorkCount: 4,
          displayLabel: 'React',
          publicId: '64000000-0000-4000-8000-000000000001',
        },
        {
          activeWorkCount: 2,
          displayLabel: 'React Native',
          publicId: '64000000-0000-4000-8000-000000000002',
        },
      ],
    });
    const onChange = vi.fn();
    renderInput([], onChange);
    const input = screen.getByRole('combobox');

    fireEvent.change(input, { target: { value: 'reac' } });
    expect(await screen.findByRole('option', { name: /React Native/ })).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['React Native']);
  });
});

function renderInput(value: string[], onChange: (value: string[]) => void) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <WorkTagInput onChange={onChange} value={value} />
    </NextIntlClientProvider>,
  );
}
