import type { CollectionField } from './collection-field';
import { resolvePrefills, type ReusableValueCandidate } from './reusable-values';

function field(overrides: Partial<CollectionField> & Pick<CollectionField, 'id' | 'type'>) {
  return { description: '', label: 'คำถาม', required: false, ...overrides };
}

function candidate(overrides: Partial<ReusableValueCandidate>): ReusableValueCandidate {
  return {
    fieldType: 'short_text',
    mappingKey: 'company_name',
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    value: 'บริษัท ก',
    ...overrides,
  };
}

describe('resolvePrefills', () => {
  it('fills a mapped field from a passed response', () => {
    const fields = [field({ id: 'company', mappingKey: 'company_name', type: 'short_text' })];
    expect(resolvePrefills(fields, [candidate({})])).toEqual([
      { fieldId: 'company', mappingKey: 'company_name', value: 'บริษัท ก' },
    ]);
  });

  it('leaves unmapped fields alone', () => {
    const fields = [field({ id: 'company', type: 'short_text' })];
    expect(resolvePrefills(fields, [candidate({})])).toEqual([]);
  });

  it('picks the latest value by submission time, not by checking time', () => {
    const fields = [field({ id: 'company', mappingKey: 'company_name', type: 'short_text' })];
    /*
     * The older submission is listed last, as a repository ordering by checking
     * time would return it. Submission time must still decide.
     */
    const candidates = [
      candidate({ submittedAt: new Date('2026-03-01T00:00:00.000Z'), value: 'ใหม่' }),
      candidate({ submittedAt: new Date('2026-01-01T00:00:00.000Z'), value: 'เก่า' }),
    ];
    expect(resolvePrefills(fields, candidates)).toEqual([
      { fieldId: 'company', mappingKey: 'company_name', value: 'ใหม่' },
    ]);
  });

  it('requires the same field type, not just the same mapping key', () => {
    const fields = [
      field({
        id: 'company',
        mappingKey: 'company_name',
        options: ['ก', 'ข'],
        type: 'single_choice',
      }),
    ];
    expect(resolvePrefills(fields, [candidate({ fieldType: 'short_text', value: 'ก' })])).toEqual(
      [],
    );
  });

  it('leaves the field empty when the latest value fails destination validation', () => {
    const fields = [
      field({ id: 'company', mappingKey: 'company_name', options: ['ก'], type: 'single_choice' }),
    ];
    const candidates = [
      candidate({
        fieldType: 'single_choice',
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        value: 'ข',
      }),
    ];
    expect(resolvePrefills(fields, candidates)).toEqual([]);
  });

  it('never falls back to an older value when the latest one is incompatible', () => {
    const fields = [
      field({ id: 'company', mappingKey: 'company_name', options: ['ก'], type: 'single_choice' }),
    ];
    const candidates = [
      // Older value would be valid here, but the latest one wins and then fails.
      candidate({
        fieldType: 'single_choice',
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        value: 'ก',
      }),
      candidate({
        fieldType: 'single_choice',
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        value: 'ข',
      }),
    ];
    expect(resolvePrefills(fields, candidates)).toEqual([]);
  });

  it('does not coerce a value into the destination type', () => {
    const fields = [field({ id: 'count', mappingKey: 'headcount', type: 'number' })];
    const candidates = [candidate({ fieldType: 'number', mappingKey: 'headcount', value: '12' })];
    expect(resolvePrefills(fields, candidates)).toEqual([]);
  });

  it('never prefills a file field', () => {
    const fields = [
      field({
        file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
        id: 'doc',
        type: 'file_upload',
      }),
    ];
    const candidates = [candidate({ fieldType: 'file_upload', mappingKey: 'doc', value: 'x.pdf' })];
    expect(resolvePrefills(fields, candidates)).toEqual([]);
  });

  it('resolves each mapped field independently', () => {
    const fields = [
      field({ id: 'company', mappingKey: 'company_name', type: 'short_text' }),
      field({ id: 'address', mappingKey: 'company_address', type: 'long_text' }),
      field({ id: 'contact', mappingKey: 'contact_person', type: 'short_text' }),
    ];
    const candidates = [
      candidate({ mappingKey: 'company_name', value: 'บริษัท ก' }),
      candidate({ fieldType: 'long_text', mappingKey: 'company_address', value: 'ที่อยู่' }),
    ];
    expect(resolvePrefills(fields, candidates)).toEqual([
      { fieldId: 'company', mappingKey: 'company_name', value: 'บริษัท ก' },
      { fieldId: 'address', mappingKey: 'company_address', value: 'ที่อยู่' },
    ]);
  });
});
