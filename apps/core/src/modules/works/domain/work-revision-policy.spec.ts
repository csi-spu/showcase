import { evaluateWorkRevisionCandidate, type WorkRevisionCandidate } from './work-revision-policy';

const POSTER_ID = '71000000-0000-4000-8000-000000000001';

describe('Work Revision completeness policy', () => {
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
    ['attribution_unresolved', candidate({ invitations: [{ state: 'pending' }] })],
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
        candidate({ invitations: Array.from({ length: 21 }, () => acceptedContributor()) }),
      ),
    ).toEqual({ isComplete: false, reason: 'attribution_limit_exceeded' });
  });

  it('rejects duplicate accepted Contributor identities', () => {
    expect(
      evaluateWorkRevisionCandidate(
        candidate({ invitations: [acceptedContributor(), acceptedContributor()] }),
      ),
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
    invitations: [acceptedContributor()],
    media: [{ assetId: POSTER_ID, kind: 'poster', position: 1, status: 'ready' }],
    submitterAttribution: { attributionName: 'ชื่อผู้ส่ง', studyYear: 2 },
    ...overrides,
  };
}

function acceptedContributor() {
  return {
    affiliation: null,
    attributionName: 'ชื่อผู้ร่วมผลงาน',
    contributionRole: null,
    kind: 'account' as const,
    personId: '71000000-0000-4000-8000-000000000002',
    state: 'accepted' as const,
    studyYear: 2,
  };
}
