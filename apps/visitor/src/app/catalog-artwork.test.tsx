import { describe, expect, it } from 'vitest';
import { personInitials, portraitFallbackVariant } from './catalog-artwork';

describe('personInitials', () => {
  it('takes the first consonant of each name', () => {
    expect(personInitials({ firstName: 'กชกร', lastName: 'ฉวีกุลมหันต์' })).toBe('กฉ');
    expect(personInitials({ firstName: 'ธนวัฒน์', lastName: 'อยู่ดี' })).toBe('ธอ');
  });

  it('skips a leading vowel, which is written before the consonant it follows', () => {
    expect(personInitials({ firstName: 'แพรวา', lastName: 'ใจงาม' })).toBe('พจ');
    expect(personInitials({ firstName: 'กนกพร', lastName: 'ไชยเค้า' })).toBe('กช');
  });

  it('drops combining vowels and tone marks', () => {
    expect(personInitials({ firstName: 'กนก', lastName: 'รัตนเรืองรักษ์' })).toBe('กร');
    expect(personInitials({ firstName: 'อารียา', lastName: 'สุขใจ' })).toBe('อส');
  });

  it('upper-cases initials for names in other scripts', () => {
    expect(personInitials({ firstName: 'chayada', lastName: 'kim' })).toBe('CK');
  });

  it('falls back to an em dash when neither name has a letter', () => {
    expect(personInitials({ firstName: '', lastName: '  ' })).toBe('—');
  });
});

describe('portraitFallbackVariant', () => {
  it('is stable for a given Public ID', () => {
    const publicId = '81000000-0000-4000-8000-000000000001';

    expect(portraitFallbackVariant(publicId)).toBe(portraitFallbackVariant(publicId));
  });

  it('stays within the palette', () => {
    const variants = Array.from({ length: 64 }, (_unused, index) =>
      portraitFallbackVariant(`8100000${index}-0000-4000-8000-00000000000${index}`),
    );

    expect(variants.every((variant) => Number.isInteger(variant) && variant >= 0)).toBe(true);
    expect(new Set(variants).size).toBeGreaterThan(1);
  });
});
