import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PasswordStrength, type PasswordStrengthMessageKey } from '@showcase/ui/password-strength';

afterEach(cleanup);

const MESSAGES: Record<PasswordStrengthMessageKey, string> = {
  label: 'ความปลอดภัยของรหัสผ่าน',
  'levels.fair': 'พอใช้',
  'levels.good': 'เกือบพร้อม',
  'levels.strong': 'แข็งแรง',
  'levels.weak': 'ต้องปรับปรุง',
  notPassed: 'ยังไม่ผ่าน',
  passed: 'ผ่าน',
  'requirements.length': '12–128 ตัวอักษร',
  'requirements.lowercase': 'ตัวพิมพ์เล็ก',
  'requirements.number': 'ตัวเลข',
  'requirements.symbol': 'อักขระพิเศษ',
  'requirements.uppercase': 'ตัวพิมพ์ใหญ่',
};

function translate(key: PasswordStrengthMessageKey): string {
  return MESSAGES[key];
}

function renderStrength(password: string) {
  return render(
    <PasswordStrength id="new-password-strength" password={password} translate={translate} />,
  );
}

describe('PasswordStrength', () => {
  it('exposes the strength level as the meter value text', () => {
    renderStrength('aA1');

    const meter = screen.getByRole('progressbar');
    expect(meter.getAttribute('aria-valuenow')).toBe('60');
    expect(meter.getAttribute('aria-valuetext')).toBe('เกือบพร้อม');
    expect(screen.getByRole('region', { name: 'ความปลอดภัยของรหัสผ่าน' }).id).toBe(
      'new-password-strength',
    );
  });

  it('states each requirement in text as well as with an icon', () => {
    renderStrength('lowercase-only');

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'ผ่าน12–128 ตัวอักษร',
      'ผ่านตัวพิมพ์เล็ก',
      'ยังไม่ผ่านตัวพิมพ์ใหญ่',
      'ยังไม่ผ่านตัวเลข',
      'ผ่านอักขระพิเศษ',
    ]);
    expect(items.map((item) => item.getAttribute('data-satisfied'))).toEqual([
      'true',
      'true',
      'false',
      'false',
      'true',
    ]);
    expect(items.every((item) => item.querySelector('svg[aria-hidden="true"]') !== null)).toBe(
      true,
    );
  });

  it('reports full strength once every requirement passes', () => {
    renderStrength('StrongPassword1!');

    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('แข็งแรง');
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .every((item) => item.getAttribute('data-satisfied') === 'true'),
    ).toBe(true);
  });
});
