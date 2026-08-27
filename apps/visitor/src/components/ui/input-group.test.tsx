import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InputGroup, InputGroupInput } from './input-group';

describe('InputGroup', () => {
  it('does not override the light-only application surface in dark OS mode', () => {
    const html = renderToStaticMarkup(
      <InputGroup className="bg-card">
        <InputGroupInput aria-label="ค้นหา" />
      </InputGroup>,
    );

    expect(html).toContain('bg-card');
    expect(html).not.toContain('dark:bg-input/30');
  });
});
