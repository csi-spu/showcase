import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Textarea } from './textarea';

const ITEMS = [{ label: 'ผลงานรายวิชา', value: 'course_work' }];

describe('Student authoring controls', () => {
  afterEach(cleanup);

  it('themes Textarea with the shared operational control contract', () => {
    render(<Textarea aria-label="รายละเอียดผลงาน" />);

    const textarea = screen.getByRole('textbox', { name: 'รายละเอียดผลงาน' });
    expect(textarea.className).toContain('rounded-control');
    expect(textarea.className).toContain('border-input');
    expect(textarea.className).toContain('bg-card');
    expect(textarea.className).toContain('focus-visible:ring-2');
    expect(textarea.className).toContain('focus-visible:ring-offset-2');
  });

  it('themes the Select trigger as a touch-sized shared operational control', () => {
    render(
      <Select defaultValue="course_work" items={ITEMS}>
        <SelectTrigger aria-label="ประเภทผลงาน">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole('combobox', { name: 'ประเภทผลงาน' });
    expect(trigger.className).toContain('rounded-control');
    expect(trigger.className).toContain('border-input');
    expect(trigger.className).toContain('bg-card');
    expect(trigger.className).toContain('data-[size=default]:h-11');
    expect(trigger.className).toContain('focus-visible:ring-2');
    expect(trigger.className).toContain('focus-visible:ring-offset-2');
  });
});
