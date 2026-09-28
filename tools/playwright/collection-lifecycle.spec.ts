import type { Page } from '@playwright/test';
import { captureSanitizedFailureScreenshot } from './fixtures.ts';
import { expect, test } from './collection-fixtures.ts';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

test.describe('Collection lifecycle', () => {
  test.describe.configure({ timeout: 180_000 });

  test('autosaves, submits, locks, and returns a private form for correction', async ({
    browser,
    collectionScenario,
    page: studentPage,
  }) => {
    const instructorContext = await browser.newContext({
      baseURL: collectionScenario.instructorUrl,
    });
    const instructorPage = await instructorContext.newPage();
    const firstAnswer = 'บริษัททดสอบรอบแรก';
    const correctedAnswer = 'บริษัททดสอบหลังรับคำขอแก้ไข';
    const correctionReason = 'กรุณาระบุชื่อบริษัทให้ครบถ้วนและตรวจสอบการสะกดก่อนส่งอีกครั้ง';

    try {
      await loginStudentCollection(studentPage, collectionScenario);
      await studentPage.goto(
        `${collectionScenario.studentCollectionUrl}/forms/${collectionScenario.formId}`,
      );
      await expect(
        studentPage.getByRole('heading', { name: collectionScenario.formTitle }),
      ).toBeVisible();

      const answer = studentPage.getByLabel(collectionScenario.answerLabel);
      await answer.fill(firstAnswer);
      await expect(studentPage.getByText('บันทึกแบบร่างแล้ว', { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      await studentPage.reload();
      await expect(studentPage.getByLabel(collectionScenario.answerLabel)).toHaveValue(firstAnswer);
      await studentPage.getByRole('button', { name: 'ส่งคำตอบ' }).click();
      await expectSubmissionConfirmed(studentPage, collectionScenario, firstAnswer);

      /* The confirmation belongs to the submit itself; a revisit shows the plain read-only view. */
      await studentPage.reload();
      await expect(studentPage.getByLabel(collectionScenario.answerLabel)).not.toBeEditable();
      await expect(
        studentPage.getByText('ส่งคำตอบแล้ว อยู่ระหว่างรอผู้สอนตรวจ จึงยังแก้ไขไม่ได้'),
      ).toBeVisible();
      await expect(studentPage.getByRole('heading', { name: 'ส่งคำตอบเรียบร้อยแล้ว' })).toHaveCount(
        0,
      );

      await loginInstructor(instructorPage, collectionScenario);
      await instructorPage.goto(
        `/groups/${collectionScenario.groupId}/forms/${collectionScenario.formId}/submissions`,
      );
      const row = instructorPage.getByRole('row', {
        name: new RegExp(collectionScenario.studentName, 'u'),
      });
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: /ตรวจคำตอบ/u }).click();
      await expect(instructorPage.getByText(firstAnswer, { exact: true })).toBeVisible();
      await instructorPage.getByRole('button', { name: 'ขอให้แก้ไข' }).click();

      const confirm = instructorPage.getByRole('button', { name: 'บันทึกผล' });
      await confirm.click();
      await expect(instructorPage.getByLabel('เหตุผลและสิ่งที่ต้องแก้ไข')).toBeFocused();
      await instructorPage.getByLabel('เหตุผลและสิ่งที่ต้องแก้ไข').fill(correctionReason);
      await confirm.click();
      await expect(instructorPage.getByText('บันทึกผลการตรวจแล้ว', { exact: true })).toBeVisible();

      await studentPage.reload();
      await expect(studentPage.getByText('ผู้สอนขอให้แก้ไข', { exact: true })).toBeVisible();
      await expect(studentPage.getByText(correctionReason, { exact: true })).toBeVisible();
      const editableAnswer = studentPage.getByLabel(collectionScenario.answerLabel);
      await expect(editableAnswer).toBeEnabled();
      /* Submitting straight away, inside the autosave delay, still sends what is on screen. */
      await editableAnswer.fill(correctedAnswer);
      await studentPage.getByRole('button', { name: 'ส่งคำตอบ' }).click();
      await expectSubmissionConfirmed(studentPage, collectionScenario, correctedAnswer);
      await expect(studentPage.getByText('บันทึกไม่สำเร็จ', { exact: true })).toHaveCount(0);
    } finally {
      await instructorContext.close();
    }
  });
});

async function expectSubmissionConfirmed(
  page: Page,
  scenario: import('./collection-fixtures.ts').CollectionLifecycleScenario,
  submittedAnswer: string,
): Promise<void> {
  const heading = page.getByRole('heading', { name: 'ส่งคำตอบเรียบร้อยแล้ว' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByText('สถานะ: รอผู้สอนตรวจ', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'กลับหน้าหลัก' })).toHaveAttribute('href', '/');

  const reveal = page.getByRole('button', { name: 'ดูคำตอบที่ส่ง' });
  await reveal.click();
  await expect(reveal).toHaveAttribute('aria-expanded', 'true');
  const answer = page.getByLabel(scenario.answerLabel);
  await expect(answer).toHaveValue(submittedAnswer);
  await expect(answer).not.toBeEditable();
}

async function loginStudentCollection(
  page: Page,
  scenario: import('./collection-fixtures.ts').CollectionLifecycleScenario,
): Promise<void> {
  await page.context().setExtraHTTPHeaders({ 'x-real-ip': scenario.studentSourceAddress });
  await page.goto(scenario.studentCollectionUrl);
  await page.getByLabel('รหัสนักศึกษา').fill(scenario.studentId);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scenario.studentPassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'แบบฟอร์มของคุณ' })).toBeVisible({
    timeout: 60_000,
  });
  await page.context().setExtraHTTPHeaders({});
  await scenario.protectBrowserContext(page.context());
}

async function loginInstructor(
  page: Page,
  scenario: import('./collection-fixtures.ts').CollectionLifecycleScenario,
): Promise<void> {
  await page.context().setExtraHTTPHeaders({ 'x-real-ip': scenario.instructorSourceAddress });
  await page.goto('/');
  await page.getByLabel('ชื่อผู้ใช้').fill(scenario.instructorLogin);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scenario.instructorPassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'ภาพรวมเอกสารนักศึกษา' })).toBeVisible({
    timeout: 60_000,
  });
  await page.context().setExtraHTTPHeaders({});
  await scenario.protectBrowserContext(page.context());
}
