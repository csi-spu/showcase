import type { Page } from '@playwright/test';
import { captureSanitizedFailureScreenshot } from './fixtures.ts';
import { expect, test } from './collection-fixtures.ts';
import type { CollectionLifecycleScenario } from './collection-fixtures.ts';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

test.describe('Collection form sharing', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ collectionFormStatus: 'draft' });

  test('shares an opened form with a link a signed-out group member can follow', async ({
    browser,
    collectionScenario,
    page: studentPage,
  }) => {
    const instructorContext = await browser.newContext({
      baseURL: collectionScenario.instructorUrl,
    });
    const instructorPage = await instructorContext.newPage();
    const studentLink = `${collectionScenario.studentCollectionUrl}/forms/${collectionScenario.formId}`;
    const shareAction = instructorPage.getByRole('button', { name: 'แชร์ให้นักศึกษา' });

    try {
      await loginInstructor(instructorPage, collectionScenario);
      await instructorPage.goto(
        `/groups/${collectionScenario.groupId}/forms/${collectionScenario.formId}`,
      );
      await expect(
        instructorPage.getByRole('heading', { name: collectionScenario.formTitle }),
      ).toBeVisible();
      await expect(shareAction).toHaveCount(0);

      await instructorPage.getByRole('button', { exact: true, name: 'เปิดรับคำตอบ' }).click();
      await instructorPage
        .getByRole('alertdialog')
        .getByRole('button', { exact: true, name: 'เปิดรับคำตอบ' })
        .click();
      await expect(instructorPage.getByText('เปิดรับคำตอบแล้ว', { exact: true })).toBeVisible();
      await expect(shareAction).toBeVisible();
      await expect(instructorPage.getByRole('dialog')).toHaveCount(0);

      await shareAction.click();
      const dialog = instructorPage.getByRole('dialog', { name: 'แชร์แบบฟอร์มให้นักศึกษา' });
      await expect(dialog.getByLabel('ลิงก์สำหรับนักศึกษา')).toHaveValue(studentLink);
      await expect(
        dialog.getByRole('img', {
          name: `คิวอาร์โค้ดสำหรับเปิดแบบฟอร์ม ${collectionScenario.formTitle}`,
        }),
      ).toBeVisible();
      const [download] = await Promise.all([
        instructorPage.waitForEvent('download'),
        dialog.getByRole('link', { name: 'ดาวน์โหลดคิวอาร์โค้ด' }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(`qr-${collectionScenario.formTitle}.png`);

      await studentPage
        .context()
        .setExtraHTTPHeaders({ 'x-real-ip': collectionScenario.studentSourceAddress });
      await studentPage.goto(studentLink);
      await studentPage.getByLabel('รหัสนักศึกษา').fill(collectionScenario.studentId);
      await studentPage
        .getByLabel('รหัสผ่าน', { exact: true })
        .fill(collectionScenario.studentPassword);
      await studentPage.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
      await expect(
        studentPage.getByRole('heading', { name: collectionScenario.formTitle }),
      ).toBeVisible({ timeout: 60_000 });
      await studentPage.context().setExtraHTTPHeaders({});
      await collectionScenario.protectBrowserContext(studentPage.context());
      expect(studentPage.url()).toBe(studentLink);
    } finally {
      await instructorContext.close();
    }
  });
});

async function loginInstructor(page: Page, scenario: CollectionLifecycleScenario): Promise<void> {
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
