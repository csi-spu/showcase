import type { Page } from '@playwright/test';
import { captureSanitizedFailureScreenshot } from './fixtures.ts';
import { expect, test } from './collection-fixtures.ts';
import type { CollectionLifecycleScenario } from './collection-fixtures.ts';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

/*
 * One Student arrives by CSV (a Student ID read in the browser and resolved by
 * Core) and one by ticking a row in the roster table. Both land in the same
 * confirmation and become members of the group the confirmation creates.
 */
test.describe('Instructor group member selection', () => {
  test.describe.configure({ timeout: 120_000 });

  test('creates a group from a CSV file and table selection', async ({
    browser,
    collectionScenario,
  }) => {
    const context = await browser.newContext({ baseURL: collectionScenario.instructorUrl });
    const page = await context.newPage();
    const groupName = `กลุ่มเลือกสมาชิก ${collectionScenario.peerName}`;

    try {
      await loginInstructor(page, collectionScenario);
      await page.goto(`/rounds/${collectionScenario.roundId}`);
      await page.getByRole('button', { name: 'สร้างกลุ่ม', exact: true }).click();
      const panel = page.getByRole('region', { name: 'สร้างกลุ่มใหม่' });
      await panel.getByLabel('ชื่อกลุ่ม', { exact: true }).fill(groupName);

      await test.step('a CSV row resolves to the Student it names', async () => {
        await panel.getByLabel('เลือกไฟล์ CSV').setInputFiles({
          buffer: Buffer.from(`student_id,note\n${collectionScenario.studentId},e2e\n`, 'utf8'),
          mimeType: 'text/csv',
          name: 'members.csv',
        });
        await expect(panel.getByText('เลือกได้ 1 คน · พบปัญหา 0 บรรทัด')).toBeVisible();
      });

      await test.step('a roster row is ticked after narrowing by name', async () => {
        await panel.getByLabel('ค้นหาชื่อ').fill(collectionScenario.peerName);
        await panel
          .getByRole('checkbox', { name: `เลือก ${collectionScenario.peerName}`, exact: true })
          .check();
        await expect(panel.getByText(/^เลือกแล้ว 2 จาก/u)).toBeVisible();
      });

      await test.step('the confirmation lists both Students', async () => {
        await panel.getByRole('button', { name: 'ตรวจสอบรายชื่อ' }).click();
        await expect(panel.getByRole('heading', { name: 'ยืนยันรายชื่อนักศึกษา' })).toBeFocused();
        await expect(panel.getByText('นักศึกษาทั้งหมด 2 คน')).toBeVisible();
        const list = panel.getByRole('list', { name: 'รายชื่อนักศึกษาที่เลือก' });
        await expect(list.getByText(collectionScenario.studentName)).toBeVisible();
        await expect(list.getByText(collectionScenario.peerName)).toBeVisible();
        await panel.getByRole('button', { name: 'ยืนยันสร้างกลุ่ม' }).click();
      });

      await test.step('the new group page lists both as current members', async () => {
        await expect(page.getByRole('heading', { level: 1, name: groupName })).toBeVisible({
          timeout: 30_000,
        });
        const members = page.getByRole('region', { name: 'สมาชิกปัจจุบัน' });
        await expect(
          members.getByText(collectionScenario.studentName, { exact: true }),
        ).toBeVisible();
        await expect(members.getByText(collectionScenario.peerName, { exact: true })).toBeVisible();
      });
    } finally {
      await context.close();
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
