import { describe, expect, it } from 'vitest';
import { parseResponsesQuery, studentHref, submissionsHref } from './responses-query';

const GROUP_ID = '20000000-0000-4000-8000-000000000001';
const FORM_ID = '30000000-0000-4000-8000-000000000001';
const STUDENT = '40000000-0000-4000-8000-000000000001';

describe('parseResponsesQuery', () => {
  it('opens on the Individual view with the default filter', () => {
    expect(parseResponsesQuery({})).toEqual({
      fieldId: null,
      individual: { page: 1, pageSize: 10, sort: 'status', status: 'all' },
      option: null,
      view: 'individual',
    });
  });

  it('reads each view and the Individual filter, order, page and page size', () => {
    expect(
      parseResponsesQuery({
        page: '3',
        pageSize: '25',
        sort: 'name',
        status: 'passed',
        view: 'summary',
      }),
    ).toMatchObject({
      individual: { page: 3, pageSize: 25, sort: 'name', status: 'passed' },
      view: 'summary',
    });
    expect(
      parseResponsesQuery({ field: 'track', option: 'สาย ก', view: 'question' }),
    ).toMatchObject({ fieldId: 'track', option: 'สาย ก', view: 'question' });
  });

  it('falls back to defaults for anything it does not recognise', () => {
    expect(
      parseResponsesQuery({
        field: 'bad id',
        option: 'x'.repeat(201),
        page: '0',
        pageSize: '500',
        sort: 'drop table',
        status: ['awaiting_checking', 'passed'],
        view: 'chart',
      }),
    ).toEqual({
      fieldId: null,
      individual: { page: 1, pageSize: 10, sort: 'status', status: 'awaiting_checking' },
      option: null,
      view: 'individual',
    });
  });

  it('never reads a search term, which may be a Student ID', () => {
    expect(
      JSON.stringify(parseResponsesQuery({ q: '66000001', search: '66000001' })),
    ).not.toContain('66000001');
  });
});

describe('response links', () => {
  it('keeps defaults out of the Individual URL', () => {
    expect(submissionsHref(GROUP_ID, FORM_ID, { view: 'individual' })).toBe(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions`,
    );
    expect(
      submissionsHref(GROUP_ID, FORM_ID, {
        page: 2,
        pageSize: 50,
        status: 'changes_required',
        view: 'individual',
      }),
    ).toBe(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions?status=changes_required&page=2&pageSize=50`,
    );
    expect(submissionsHref(GROUP_ID, FORM_ID, { page: 1, pageSize: 10, view: 'individual' })).toBe(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions`,
    );
  });

  it('opens a question with an option highlighted', () => {
    expect(
      submissionsHref(GROUP_ID, FORM_ID, { fieldId: 'track', option: 'สาย ก', view: 'question' }),
    ).toBe(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions?view=question&field=track&option=%E0%B8%AA%E0%B8%B2%E0%B8%A2+%E0%B8%81`,
    );
  });

  it('carries the filter, order and page size to a Student, never the page', () => {
    expect(
      studentHref(GROUP_ID, FORM_ID, STUDENT, { pageSize: 25, sort: 'name', status: 'passed' }),
    ).toBe(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/students/${STUDENT}?status=passed&sort=name&pageSize=25`,
    );
    expect(studentHref(GROUP_ID, FORM_ID, STUDENT, { version: 1 })).toBe(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/students/${STUDENT}?version=1`,
    );
  });
});
