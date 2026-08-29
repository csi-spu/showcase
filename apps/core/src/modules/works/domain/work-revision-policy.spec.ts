import {
  evaluateWorkRevisionCandidate,
  normalizeSubmitterAttribution,
  type WorkRevisionCandidate,
} from './work-revision-policy';

const POSTER_ID = '71000000-0000-4000-8000-000000000001';

describe('Work Revision completeness policy', () => {
  it.each([1, 2, 3, 4])('accepts Submitter Study Year %s for a new Revision', (studyYear) => {
    expect(normalizeSubmitterAttribution({ attributionName: 'ชื่อผู้ส่ง', studyYear })).toEqual({
      attributionName: 'ชื่อผู้ส่ง',
      studyYear,
    });
  });

  it.each([0, 5, 8])('rejects Submitter Study Year %s for a new Revision', (studyYear) => {
    expect(normalizeSubmitterAttribution({ attributionName: 'ชื่อผู้ส่ง', studyYear })).toBeNull();
  });

  it('accepts one ready Poster, bounded content, resolved attribution, and confirmed Submitter attribution', () => {
    expect(evaluateWorkRevisionCandidate(candidate())).toEqual({ isComplete: true });
  });

  it.each([
    ['missing_poster', candidate({ media: [] })],
    [
      'media_not_ready',
      candidate({
        media: [{ assetId: POSTER_ID, kind: 'poster', position: 1, status: 'processing' }],
      }),
    ],
    [
      'attribution_incomplete',
      candidate({
        contributors: [
          {
            attributionName: 'ชื่อผู้ร่วมผลงาน',
            contributionRole: null,
            kind: 'account',
            personId: '71000000-0000-4000-8000-000000000002',
          },
        ],
      }),
    ],
    [
      'invalid_submitter_attribution',
      candidate({ submitterAttribution: { attributionName: ' ', studyYear: 2 } }),
    ],
    ['incomplete_content', candidate({ draft: { ...candidate().draft, title: ' ' } })],
  ] as const)('rejects %s without creating a candidate', (reason, input) => {
    expect(evaluateWorkRevisionCandidate(input)).toEqual({ isComplete: false, reason });
  });

  it('rejects more than twenty accepted Contributors', () => {
    expect(
      evaluateWorkRevisionCandidate(
        candidate({ contributors: Array.from({ length: 21 }, () => contributor()) }),
      ),
    ).toEqual({ isComplete: false, reason: 'attribution_limit_exceeded' });
  });

  it('rejects duplicate accepted Contributor identities', () => {
    expect(
      evaluateWorkRevisionCandidate(candidate({ contributors: [contributor(), contributor()] })),
    ).toEqual({ isComplete: false, reason: 'attribution_duplicate' });
  });
});

function candidate(overrides: Partial<WorkRevisionCandidate> = {}): WorkRevisionCandidate {
  return {
    academicRange: { currentAcademicYear: 2569, entryYear: 2566 },
    draft: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดผลงาน',
      links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
      summary: 'สรุปผลงาน',
      tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
      title: 'ระบบแนะนำผลงาน',
      videoLinks: [],
    },
    contributors: [contributor()],
    media: [{ assetId: POSTER_ID, kind: 'poster', position: 1, status: 'ready' }],
    submitterAttribution: { attributionName: 'ชื่อผู้ส่ง', studyYear: 2 },
    ...overrides,
  };
}

function contributor() {
  return {
    attributionName: 'ชื่อผู้ร่วมผลงาน',
    contributionRole: 'พัฒนาโปรแกรม',
    kind: 'account' as const,
    personId: '71000000-0000-4000-8000-000000000002',
  };
}
