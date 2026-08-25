import { describe, expect, it } from 'vitest';
import { validateProfileForm } from './student-profile-validation';

describe('validateProfileForm', () => {
  it('normalizes bounded fields and omits completely blank links', () => {
    const form = validForm();
    form.set('displayName', '  ณัฐดนัย สุขใจ  ');
    form.set('bio', '  สนใจระบบเว็บ  ');
    form.set('linkLabel0', ' เว็บไซต์ ');
    form.set('linkUrl0', 'https://example.com');
    form.set('linkLabel1', '');
    form.set('linkUrl1', '');

    expect(validateProfileForm(form)).toEqual({
      bio: 'สนใจระบบเว็บ',
      displayName: 'ณัฐดนัย สุขใจ',
      expectedVersion: 0,
      idempotencyKey: '71000000-0000-4000-8000-000000000002',
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      photoId: null,
    });
  });

  it.each([
    ['blank display name', (form: FormData) => form.set('displayName', ' ')],
    ['incomplete link', (form: FormData) => form.set('linkLabel0', 'เว็บไซต์')],
    [
      'non-HTTPS link',
      (form: FormData) => {
        form.set('linkLabel0', 'เว็บไซต์');
        form.set('linkUrl0', 'http://example.com');
      },
    ],
    [
      'credentials in link',
      (form: FormData) => {
        form.set('linkLabel0', 'เว็บไซต์');
        form.set('linkUrl0', 'https://user:secret@example.com');
      },
    ],
  ])('rejects %s', (_scenario, mutate) => {
    const form = validForm();
    mutate(form);
    expect(validateProfileForm(form)).toBe('invalid');
  });
});

function validForm(): FormData {
  const form = new FormData();
  form.set('bio', '');
  form.set('displayName', 'ณัฐดนัย');
  form.set('expectedVersion', '0');
  form.set('idempotencyKey', '71000000-0000-4000-8000-000000000002');
  form.set('photoId', '');
  for (let index = 0; index < 5; index += 1) {
    form.set(`linkLabel${index}`, '');
    form.set(`linkUrl${index}`, '');
  }
  return form;
}
