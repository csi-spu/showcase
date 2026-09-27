import { randomUUID } from 'node:crypto';
import { captureSanitizedFailureScreenshot } from './fixtures.ts';
import { expect, test } from './collection-fixtures.ts';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

test.describe('Collection first-login deeplink', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ collectionStudentCredentialState: 'initial' });

  test('keeps a form deeplink through the first-login password change', async ({
    collectionScenario,
    page,
  }) => {
    const formLink = `${collectionScenario.studentCollectionUrl}/forms/${collectionScenario.formId}`;
    const newPassword = `${collectionScenario.studentPassword}Next`;

    await page
      .context()
      .setExtraHTTPHeaders({ 'x-real-ip': collectionScenario.studentSourceAddress });
    await page.goto(formLink);
    await page.getByLabel('รหัสนักศึกษา').fill(collectionScenario.studentId);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(collectionScenario.studentPassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    await page
      .getByLabel('รหัสผ่านปัจจุบัน', { exact: true })
      .fill(collectionScenario.studentPassword, { timeout: 60_000 });
    await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(newPassword);
    await page.getByLabel('ยืนยันรหัสผ่านใหม่', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'ตั้งรหัสผ่าน' }).click();

    await expect(page.getByRole('heading', { name: collectionScenario.formTitle })).toBeVisible({
      timeout: 60_000,
    });
    await page.context().setExtraHTTPHeaders({});
    await collectionScenario.protectBrowserContext(page.context());
    await expect(page.getByText('ตั้งรหัสผ่านสำเร็จ', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(formLink);

    await page.reload();
    await expect(page.getByRole('heading', { name: collectionScenario.formTitle })).toBeVisible();
    await expect(page.getByText('ตั้งรหัสผ่านสำเร็จ', { exact: true })).toHaveCount(0);

    // A form this Student has no obligation for explains itself and keeps its 404.
    const response = await page.goto(
      `${collectionScenario.studentCollectionUrl}/forms/${randomUUID()}`,
    );
    expect(response?.status()).toBe(404);
    const dialog = page.getByRole('dialog', { name: 'ไม่พบแบบฟอร์มนี้ในรายการของคุณ' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(`${collectionScenario.studentCollectionUrl}/`);
  });
});
