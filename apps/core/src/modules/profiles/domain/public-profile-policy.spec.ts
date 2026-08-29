import { evaluatePublicProfile, type PublicProfileDraftInput } from './public-profile-policy';

const VALID_PROFILE: PublicProfileDraftInput = {
  bio: 'สนใจการออกแบบระบบที่ดูแลได้ในระยะยาว',
  links: [
    { label: 'เว็บไซต์', url: 'https://example.com' },
    { label: 'GitHub', url: 'https://github.com/example' },
  ],
  photoId: null,
};

describe('Public Profile policy', () => {
  it('normalizes bounded fields and accepts up to five unique HTTPS links', () => {
    expect(
      evaluatePublicProfile({
        ...VALID_PROFILE,
        bio: '  สนใจระบบเว็บ  ',
        links: [
          { label: ' เว็บไซต์ ', url: 'https://example.com/portfolio' },
          { label: 'GitHub', url: 'https://github.com/example' },
          { label: 'LinkedIn', url: 'https://linkedin.com/in/example' },
          { label: 'บทความ', url: 'https://example.com/writing' },
          { label: 'ผลงาน', url: 'https://example.com/work' },
        ],
      }),
    ).toEqual({
      isValid: true,
      profile: {
        ...VALID_PROFILE,
        bio: 'สนใจระบบเว็บ',
        links: [
          { label: 'เว็บไซต์', url: 'https://example.com/portfolio' },
          { label: 'GitHub', url: 'https://github.com/example' },
          { label: 'LinkedIn', url: 'https://linkedin.com/in/example' },
          { label: 'บทความ', url: 'https://example.com/writing' },
          { label: 'ผลงาน', url: 'https://example.com/work' },
        ],
      },
    });
  });

  it.each([
    ['long bio', { ...VALID_PROFILE, bio: 'ก'.repeat(501) }],
    [
      'too many links',
      {
        ...VALID_PROFILE,
        links: [...VALID_PROFILE.links, ...VALID_PROFILE.links, ...VALID_PROFILE.links],
      },
    ],
    ['blank link label', { ...VALID_PROFILE, links: [{ label: ' ', url: 'https://example.com' }] }],
    [
      'long link label',
      { ...VALID_PROFILE, links: [{ label: 'ก'.repeat(51), url: 'https://example.com' }] },
    ],
    [
      'non-HTTPS link',
      { ...VALID_PROFILE, links: [{ label: 'เว็บไซต์', url: 'http://example.com' }] },
    ],
    ['relative link', { ...VALID_PROFILE, links: [{ label: 'เว็บไซต์', url: '/profile' }] }],
    [
      'credential-bearing link',
      { ...VALID_PROFILE, links: [{ label: 'เว็บไซต์', url: 'https://user:secret@example.com' }] },
    ],
    [
      'long URL',
      {
        ...VALID_PROFILE,
        links: [{ label: 'เว็บไซต์', url: `https://example.com/${'a'.repeat(2030)}` }],
      },
    ],
    [
      'duplicate URL',
      {
        ...VALID_PROFILE,
        links: [
          { label: 'หนึ่ง', url: 'https://example.com' },
          { label: 'สอง', url: 'https://example.com/' },
        ],
      },
    ],
  ])('rejects %s', (_scenario, input) => {
    expect(evaluatePublicProfile(input)).toEqual({ isValid: false });
  });
});
