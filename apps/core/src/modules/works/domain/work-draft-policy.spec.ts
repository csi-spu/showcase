import { evaluateWorkDraft, type WorkCategory, type WorkDraftInput } from './work-draft-policy';

const CATEGORIES: WorkCategory[] = ['course_work', 'competition_entry', 'academic_article'];

describe('Work Draft policy', () => {
  it.each(CATEGORIES)('uses the same bounded field contract for %s', (category) => {
    expect(
      evaluateWorkDraft(
        validDraft({
          category,
          description: '  รายละเอียดผลงาน  ',
          links: [{ label: ' เว็บไซต์ ', url: 'https://example.com' }],
          summary: '  สรุปผลงาน  ',
          tags: ['  React  ', ' Web   App '],
          title: '  ระบบแนะนำผลงาน  ',
        }),
        { currentAcademicYear: 2569, entryYear: 2566 },
      ),
    ).toEqual({
      draft: {
        academicPeriod: { semester: '1', year: 2569 },
        category,
        description: 'รายละเอียดผลงาน',
        links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
        summary: 'สรุปผลงาน',
        tags: [
          { displayLabel: 'React', normalizedIdentity: 'react' },
          { displayLabel: 'Web App', normalizedIdentity: 'web app' },
        ],
        title: 'ระบบแนะนำผลงาน',
        videoLinks: [],
      },
      isValid: true,
    });
  });

  it('normalizes Tag identity with NFKC, collapsed whitespace, and Unicode case folding', () => {
    const result = evaluateWorkDraft(validDraft({ tags: ['Ｒｅａｃｔ   Weiẞ'] }), {
      currentAcademicYear: 2569,
      entryYear: 2566,
    });

    expect(result).toMatchObject({
      draft: {
        tags: [{ displayLabel: 'React Weiẞ', normalizedIdentity: 'react weiss' }],
      },
      isValid: true,
    });
  });

  it('normalizes unique HTTPS YouTube and TikTok Video Links to provider IDs', () => {
    expect(
      evaluateWorkDraft(
        validDraft({
          videoLinks: [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
            'https://www.tiktok.com/@showcase/video/7345678901234567890?lang=th',
          ],
        }),
        { currentAcademicYear: 2569, entryYear: 2566 },
      ),
    ).toMatchObject({
      draft: {
        videoLinks: [
          {
            provider: 'youtube',
            providerVideoId: 'dQw4w9WgXcQ',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          },
          {
            provider: 'tiktok',
            providerVideoId: '7345678901234567890',
            url: 'https://www.tiktok.com/@showcase/video/7345678901234567890',
          },
        ],
      },
      isValid: true,
    });
  });

  it.each([
    ['an arbitrary provider', ['https://vimeo.com/123456']],
    ['a non-HTTPS provider URL', ['http://youtube.com/watch?v=dQw4w9WgXcQ']],
    [
      'a duplicate provider video ID',
      ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ],
    [
      'more than three URLs',
      [
        'https://youtu.be/dQw4w9WgXcQ',
        'https://youtu.be/9bZkp7q19f0',
        'https://youtu.be/3JZ_D3ELwOQ',
        'https://youtu.be/kJQP7kiw5Fk',
      ],
    ],
  ])('rejects %s', (_scenario, videoLinks) => {
    expect(
      evaluateWorkDraft(validDraft({ videoLinks }), { currentAcademicYear: 2569, entryYear: 2566 }),
    ).toEqual({ isValid: false });
  });

  it.each([
    ['blank title', validDraft({ title: ' ' })],
    ['oversized title', validDraft({ title: 'ก'.repeat(151) })],
    ['blank summary', validDraft({ summary: ' ' })],
    ['oversized summary', validDraft({ summary: 'ก'.repeat(301) })],
    ['blank description', validDraft({ description: ' ' })],
    ['oversized description', validDraft({ description: 'ก'.repeat(10_001) })],
    ['too many links', validDraft({ links: sixLinks() })],
    ['too many Tags', validDraft({ tags: ['1', '2', '3', '4', '5', '6'] })],
    ['blank link label', validDraft({ links: [{ label: ' ', url: 'https://example.com' }] })],
    ['non-HTTPS link', validDraft({ links: [{ label: 'เว็บไซต์', url: 'http://example.com' }] })],
    [
      'link containing credentials',
      validDraft({ links: [{ label: 'เว็บไซต์', url: 'https://user:secret@example.com' }] }),
    ],
    [
      'link longer than 2,048 characters after URL canonicalization',
      validDraft({
        links: [{ label: 'เว็บไซต์', url: `https://example.com/${'ก'.repeat(700)}` }],
      }),
    ],
    ['blank Tag', validDraft({ tags: [' '] })],
    ['oversized Tag', validDraft({ tags: ['ก'.repeat(51)] })],
  ])('rejects %s', (_scenario, draft) => {
    expect(evaluateWorkDraft(draft, { currentAcademicYear: 2569, entryYear: 2566 })).toEqual({
      isValid: false,
    });
  });

  it('rejects duplicate canonical links and duplicate normalized Tags', () => {
    expect(
      evaluateWorkDraft(
        validDraft({
          links: [
            { label: 'หนึ่ง', url: 'https://example.com' },
            { label: 'สอง', url: 'https://example.com/' },
          ],
        }),
        { currentAcademicYear: 2569, entryYear: 2566 },
      ),
    ).toEqual({ isValid: false });

    expect(
      evaluateWorkDraft(validDraft({ tags: ['Ｒｅａｃｔ', 'react'] }), {
        currentAcademicYear: 2569,
        entryYear: 2566,
      }),
    ).toEqual({ isValid: false });

    expect(
      evaluateWorkDraft(validDraft({ tags: ['Straße', 'STRASSE'] }), {
        currentAcademicYear: 2569,
        entryYear: 2566,
      }),
    ).toEqual({ isValid: false });
  });

  it.each([2565, 2570])('rejects Academic Period year %s outside the Submitter range', (year) => {
    expect(
      evaluateWorkDraft(validDraft({ academicPeriod: { semester: 'summer', year } }), {
        currentAcademicYear: 2569,
        entryYear: 2566,
      }),
    ).toEqual({ isValid: false });
  });
});

function validDraft(overrides: Partial<WorkDraftInput> = {}): WorkDraftInput {
  return {
    academicPeriod: { semester: '1', year: 2569 },
    category: 'course_work',
    description: 'รายละเอียดผลงาน',
    links: [],
    summary: 'สรุปผลงาน',
    tags: [],
    title: 'ระบบแนะนำผลงาน',
    videoLinks: [],
    ...overrides,
  };
}

function sixLinks(): WorkDraftInput['links'] {
  return Array.from({ length: 6 }, (_, index) => ({
    label: `ลิงก์ ${index + 1}`,
    url: `https://example.com/${index + 1}`,
  }));
}
