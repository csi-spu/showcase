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
      await expect(studentPage.getByText('รอผู้สอนตรวจ', { exact: true })).toBeVisible();
      await expect(studentPage.getByLabel(collectionScenario.answerLabel)).not.toBeEditable();
      await expect(
        studentPage.getByText('ส่งคำตอบแล้ว อยู่ระหว่างรอผู้สอนตรวจ จึงยังแก้ไขไม่ได้'),
      ).toBeVisible();

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
      await editableAnswer.fill(correctedAnswer);
      await expect(studentPage.getByText('บันทึกแบบร่างแล้ว', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await studentPage.getByRole('button', { name: 'ส่งคำตอบ' }).click();
      await expect(studentPage.getByText('รอผู้สอนตรวจ', { exact: true })).toBeVisible();
      await expect(editableAnswer).not.toBeEditable();
    } finally {
      await instructorContext.close();
    }
  });
});

async function loginStudentCollection(
  page: Page,
  scenario: import('./collection-fixtures.ts').CollectionLifecycleScenario,
): Promise<void> {
  await page.context().setExtraHTTPHeaders({ 'x-real-ip': scenario.studentSourceAddress });
  await page.goto(scenario.studentCollectionUrl);
  await page.getByLabel('รหัสนักศึกษา').fill(scenario.studentId);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scenario.studentPassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'เอกสารสหกิจศึกษาของคุณ' })).toBeVisible({
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
  await expect(page.getByRole('heading', { name: 'รอบเก็บเอกสาร' })).toBeVisible({
    timeout: 60_000,
  });
  await page.context().setExtraHTTPHeaders({});
  await scenario.protectBrowserContext(page.context());
}
