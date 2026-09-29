import type { Page } from '@playwright/test';
import { captureSanitizedFailureScreenshot } from './fixtures.ts';
import { expect, test } from './collection-fixtures.ts';
import type { CollectionLifecycleScenario } from './collection-fixtures.ts';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

test.describe('Collection deletion', () => {
  test.describe.configure({ timeout: 180_000 });

  test('deletes a form behind its typed name, hides it from the Student, and restores it', async ({
    browser,
    collectionScenario,
    page: studentPage,
  }) => {
    const instructorContext = await browser.newContext({
      baseURL: collectionScenario.instructorUrl,
    });
    const instructorPage = await instructorContext.newPage();
    const title = collectionScenario.formTitle;
    const studentLink = `${collectionScenario.studentCollectionUrl}/forms/${collectionScenario.formId}`;

    try {
      await loginInstructor(instructorPage, collectionScenario);
      await instructorPage.goto(
        `/groups/${collectionScenario.groupId}/forms/${collectionScenario.formId}`,
      );
      await expect(instructorPage.getByRole('heading', { name: title })).toBeVisible();

      await instructorPage.getByRole('button', { name: `ตัวเลือกสำหรับ “${title}”` }).click();
      await instructorPage.getByRole('menuitem', { name: 'ลบ' }).click();
      const dialog = instructorPage.getByRole('alertdialog', { name: `ลบ “${title}”?` });
      await expect(dialog.getByText('จะลบแบบฟอร์มนี้', { exact: false })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'ยกเลิก' })).toBeFocused();
      const confirm = dialog.getByRole('button', { exact: true, name: 'ลบ' });
      await expect(confirm).toBeDisabled();
      await dialog.getByLabel(`พิมพ์ “${title}” เพื่อยืนยัน`).fill(title);
      await confirm.click();

      /* The toast is timed, so it is checked before the redirect finishes compiling. */
      await expect(instructorPage.getByText(`ลบ “${title}” แล้ว`)).toBeVisible();
      await expect(instructorPage).toHaveURL(
        new RegExp(`/groups/${collectionScenario.groupId}$`, 'u'),
      );
      await expect(instructorPage.getByRole('link', { name: title })).toHaveCount(0);

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
        studentPage.getByRole('dialog', { name: 'ไม่พบแบบฟอร์มนี้ในรายการของคุณ' }),
      ).toBeVisible({ timeout: 60_000 });
      await studentPage.context().setExtraHTTPHeaders({});
      await collectionScenario.protectBrowserContext(studentPage.context());

      /* The toast has expired by now; the log page is reached directly. */
      await instructorPage.goto('/deletions');
      await expect(instructorPage.getByRole('heading', { name: 'ประวัติการลบ' })).toBeVisible();
      await instructorPage.getByRole('button', { name: `กู้คืน “${title}”` }).click();
      const restore = instructorPage.getByRole('alertdialog', { name: `กู้คืน “${title}”?` });
      await restore.getByLabel('เหตุผลที่กู้คืน').fill('ลบผิดแบบฟอร์ม');
      await restore.getByRole('button', { exact: true, name: 'กู้คืน' }).click();
      await expect(instructorPage.getByText(`กู้คืน “${title}” แล้ว`)).toBeVisible();
      await expect(instructorPage.getByText('กู้คืนแล้ว', { exact: true })).toBeVisible();

      await instructorPage.goto(`/groups/${collectionScenario.groupId}`);
      await expect(instructorPage.getByRole('link', { name: title })).toBeVisible();
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
