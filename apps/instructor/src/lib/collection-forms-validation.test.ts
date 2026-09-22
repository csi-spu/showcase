import { describe, expect, it } from 'vitest';
import {
  validateCheckSubmission,
  validateCreateForm,
  validateCreateFromTemplate,
  validateFormMetadata,
  validateSaveAsTemplate,
} from './collection-forms-validation';

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const VALID_FIELD = {
  description: '',
  id: 'f1',
  label: 'คำถาม',
  required: true,
  type: 'short_text',
};

function createBody(overrides: Record<string, unknown> = {}): Record<string, string> {
  return {
    title: 'แบบฟอร์ม',
    description: '',
    deadlineAt: '',
    fields: JSON.stringify([VALID_FIELD]),
    ...overrides,
  } as Record<string, string>;
}

describe('validateCreateForm', () => {
  it('accepts a minimal valid form', () => {
    const input = validateCreateForm(formData(createBody()));
    expect(input?.title).toBe('แบบฟอร์ม');
    expect(input?.deadlineAt).toBeNull();
    expect(input?.fields).toHaveLength(1);
  });

  it('rejects a payload whose fields are not valid JSON', () => {
    expect(validateCreateForm(formData(createBody({ fields: 'not json' })))).toBeNull();
  });

  it('rejects a form with no fields', () => {
    expect(validateCreateForm(formData(createBody({ fields: '[]' })))).toBeNull();
  });

  it('rejects a choice field that carries no options', () => {
    const fields = JSON.stringify([{ ...VALID_FIELD, type: 'single_choice' }]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('rejects options on a field type that cannot have them', () => {
    const fields = JSON.stringify([{ ...VALID_FIELD, options: ['ก'] }]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('rejects a file field with no file config', () => {
    const fields = JSON.stringify([{ ...VALID_FIELD, type: 'file_upload' }]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('rejects more files per field than the platform allows', () => {
    const fields = JSON.stringify([
      {
        ...VALID_FIELD,
        file: { allowedFileTypes: ['pdf'], maxFiles: 6 },
        type: 'file_upload',
      },
    ]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('rejects a mapping key on a file field', () => {
    const fields = JSON.stringify([
      {
        ...VALID_FIELD,
        file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
        mappingKey: 'company',
        type: 'file_upload',
      },
    ]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('rejects two fields sharing one id', () => {
    const fields = JSON.stringify([VALID_FIELD, VALID_FIELD]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('rejects two fields sharing one mapping key', () => {
    const fields = JSON.stringify([
      { ...VALID_FIELD, id: 'a', mappingKey: 'company' },
      { ...VALID_FIELD, id: 'b', mappingKey: 'company' },
    ]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('rejects an unknown key so a stray property cannot reach Core', () => {
    const fields = JSON.stringify([{ ...VALID_FIELD, sneaky: true }]);
    expect(validateCreateForm(formData(createBody({ fields })))).toBeNull();
  });

  it('reads a deadline as Bangkok wall-clock time and stores it as UTC', () => {
    const input = validateCreateForm(formData(createBody({ deadlineAt: '2026-10-01T23:59' })));
    expect(input?.deadlineAt).toBe('2026-10-01T16:59:00.000Z');
  });

  it('rejects a deadline that is not a wall-clock value', () => {
    expect(validateCreateForm(formData(createBody({ deadlineAt: 'tomorrow' })))).toBeNull();
  });
});

describe('validateFormMetadata', () => {
  it('accepts a title with an empty deadline', () => {
    const input = validateFormMetadata(
      formData({ title: 'ชื่อใหม่', description: '', deadlineAt: '' }),
    );
    expect(input).toEqual({ title: 'ชื่อใหม่', description: '', deadlineAt: null });
  });

  it('rejects a blank title', () => {
    expect(
      validateFormMetadata(formData({ title: '   ', description: '', deadlineAt: '' })),
    ).toBeNull();
  });
});

describe('validateSaveAsTemplate', () => {
  it('trims the template name', () => {
    expect(validateSaveAsTemplate(formData({ name: '  เทมเพลต  ' }))?.name).toBe('เทมเพลต');
  });

  it('rejects a blank name', () => {
    expect(validateSaveAsTemplate(formData({ name: '  ' }))).toBeNull();
  });
});

describe('validateCreateFromTemplate', () => {
  it('requires a template id that is a uuid', () => {
    expect(
      validateCreateFromTemplate(formData({ templateId: 'nope', title: 'ชื่อ' })),
    ).toBeNull();
  });

  it('accepts a uuid with a title', () => {
    const input = validateCreateFromTemplate(
      formData({
        templateId: '3f0f8a5e-2d4b-4a0e-9c1a-7c9a1b2d3e4f',
        title: 'ชื่อ',
      }),
    );
    expect(input?.templateId).toBe('3f0f8a5e-2d4b-4a0e-9c1a-7c9a1b2d3e4f');
  });
});

describe('validateCheckSubmission', () => {
  const submissionId = '3f0f8a5e-2d4b-4a0e-9c1a-7c9a1b2d3e4f';

  it('accepts a pass with no reason', () => {
    const input = validateCheckSubmission(
      formData({ decision: 'passed', reason: '', submissionId }),
    );

    expect(input).toEqual({ decision: 'passed', reason: null, submissionId });
  });

  it('requires a reason when asking for changes, so the Student can act on it', () => {
    expect(
      validateCheckSubmission(
        formData({ decision: 'changes_required', reason: '   ', submissionId }),
      ),
    ).toBeNull();
  });

  it('trims the reason it forwards', () => {
    const input = validateCheckSubmission(
      formData({ decision: 'changes_required', reason: '  แนบเอกสารเพิ่ม  ', submissionId }),
    );

    expect(input?.reason).toBe('แนบเอกสารเพิ่ม');
  });

  it('rejects a decision it does not recognise', () => {
    expect(
      validateCheckSubmission(formData({ decision: 'approved', reason: '', submissionId })),
    ).toBeNull();
  });

  it('rejects a submission id that is not a uuid', () => {
    expect(
      validateCheckSubmission(formData({ decision: 'passed', reason: '', submissionId: 'nope' })),
    ).toBeNull();
  });
});
