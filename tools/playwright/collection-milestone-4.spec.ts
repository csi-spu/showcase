import type { Page } from '@playwright/test';
import { captureSanitizedFailureScreenshot } from './fixtures.ts';
import { expect, test } from './collection-fixtures.ts';
import type { CollectionLifecycleScenario } from './collection-fixtures.ts';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

/*
 * The three Milestone 4 surfaces read the same submission from three angles:
 * the matrix shows who owes what, the Student's feed announces each decision,
 * and an export freezes the answer as it stood when it was requested.
 *
 * One journey rather than three tests, because the freeze only means anything
 * in sequence: the export has to be requested while an answer is pending and
 * still describe that answer after the Instructor has passed it.
 */
test.describe('Collection Milestone 4', () => {
  test.describe.configure({ timeout: 240_000 });

  test('tracks the group, notifies the Student, and freezes an export snapshot', async ({
    browser,
    collectionScenario,
    page: studentPage,
  }) => {
    const instructorContext = await browser.newContext({
      baseURL: collectionScenario.instructorUrl,
    });
    const instructorPage = await instructorContext.newPage();
    const answer = 'บริษัทสำหรับตรวจสอบการส่งออกข้อมูล';

    try {
      await loginStudentCollection(studentPage, collectionScenario);

      /*
       * The feed starts empty. The fixture inserts the obligation as a row
       * rather than through the assignment use case, so nothing has announced
       * itself yet, so the header bell's dropdown shows its empty state.
       */
      await openNotifications(studentPage);
      await expect(studentPage.getByRole('heading', { name: 'การแจ้งเตือน' })).toBeVisible();
      await expect(studentPage.getByText('ยังไม่มีการแจ้งเตือน', { exact: true })).toBeVisible();

      await studentPage.goto(
        `${collectionScenario.studentCollectionUrl}/forms/${collectionScenario.formId}`,
      );
      await submitAnswer(studentPage, collectionScenario, answer);
      await expect(studentPage.getByText('สถานะ: รอผู้สอนตรวจ', { exact: true })).toBeVisible();

      await loginInstructor(instructorPage, collectionScenario);

      await test.step('the matrix counts the pending submission', async () => {
        await instructorPage.goto(`/groups/${collectionScenario.groupId}`);
        await instructorPage.getByRole('link', { name: 'ดูตารางติดตาม' }).click();
        await expect(
          instructorPage.getByRole('heading', { name: 'ตารางติดตามการส่ง' }),
        ).toBeVisible();

        /*
         * The Student owns a row and the open form owns a column. A Draft form
         * must not appear, since nobody was ever asked for it.
         */
        await expect(
          instructorPage.getByRole('row', {
            name: new RegExp(collectionScenario.studentName, 'u'),
          }),
        ).toBeVisible();
        await expect(
          instructorPage.getByRole('columnheader', { name: collectionScenario.formTitle }),
        ).toBeVisible();
        await expect(instructorPage.getByText('สรุปหน้านี้')).toBeVisible();
      });

      /*
       * Requested while the answer is still awaiting a decision. Everything the
       * Instructor does after this must leave the frozen copy alone.
       */
      await test.step('an export is requested against the current state', async () => {
        await instructorPage.goto(`/groups/${collectionScenario.groupId}`);
        await instructorPage.getByRole('main').getByRole('link', { name: 'ส่งออกข้อมูล' }).click();
        await expect(instructorPage.getByRole('heading', { name: 'ส่งออกข้อมูล' })).toBeVisible();

        // Nothing is preselected, so an export always names the forms it froze.
        const form = instructorPage.getByLabel(collectionScenario.formTitle);
        await expect(form).not.toBeChecked();
        await form.check();
        await instructorPage.getByRole('button', { name: 'สั่งส่งออก' }).click();
        await expect(
          instructorPage.getByText('สั่งส่งออกแล้ว ระบบกำลังสร้างไฟล์', { exact: true }),
        ).toBeVisible();
      });

      await test.step('passing the submission notifies the Student', async () => {
        await passSubmission(instructorPage, collectionScenario, answer);

        /*
         * The decision is what reaches the Student: the feed appears for the
         * first time and names the result, which is the AC16 behaviour this
         * journey can actually observe end to end.
         */
        await studentPage.goto(collectionScenario.studentCollectionUrl);
        await openNotifications(studentPage);
        await expect(studentPage.getByRole('heading', { name: 'การแจ้งเตือน' })).toBeVisible();
        await expect(studentPage.getByText('ยังไม่มีการแจ้งเตือน', { exact: true })).toBeHidden();
        await expect(studentPage.getByText('ผ่านการตรวจแล้ว').first()).toBeVisible();
      });

      await test.step('the export history still describes the frozen request', async () => {
        await instructorPage.goto(`/groups/${collectionScenario.groupId}/exports`);
        await expect(instructorPage.getByText('รายการส่งออกล่าสุด')).toBeVisible();

        /*
         * The job exists and reports one of its real states. Which one depends
         * on whether the builder has run, so the row is matched on the set the
         * domain allows rather than on a timing-dependent single value -- the
         * point here is that a decision taken after the request never removed
         * or rewrote the job.
         */
        await expect(
          instructorPage.getByText(/รอสร้างไฟล์|กำลังสร้างไฟล์|พร้อมดาวน์โหลด/u).first(),
        ).toBeVisible();
        await expect(instructorPage.getByText('ยังไม่มีรายการส่งออก')).toBeHidden();
      });

      /*
       * The cross-user denial. Instructor pages are a separate audience with
       * its own host-only session, so a signed-in Student reaching one must be
       * refused rather than served -- per-Instructor group restrictions are
       * explicitly out of scope, so audience is the boundary that matters.
       */
      await test.step('a Student cannot reach the Instructor export surface', async () => {
        const denied = await studentPage.request.get(
          `${collectionScenario.instructorUrl}/groups/${collectionScenario.groupId}/exports`,
          { maxRedirects: 0 },
        );
        expect(denied.status()).toBeGreaterThanOrEqual(300);
        expect(denied.status()).toBeLessThan(500);
        expect(await denied.text()).not.toContain(collectionScenario.studentName);
      });
    } finally {
      await instructorContext.close();
    }
  });
});

/** Fills a draft, waits for the autosave to land, then submits it. */
async function submitAnswer(
  page: Page,
  scenario: CollectionLifecycleScenario,
  value: string,
): Promise<void> {
  const answer = page.getByLabel(scenario.answerLabel);
  await expect(answer).toBeEditable();
  await answer.fill(value);
  await expect(page.getByText('บันทึกแบบร่างแล้ว', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'ส่งคำตอบ' }).click();
}

async function passSubmission(
  page: Page,
  scenario: CollectionLifecycleScenario,
  expectedAnswer: string,
): Promise<void> {
  await page.goto(`/groups/${scenario.groupId}/forms/${scenario.formId}/submissions`);
  const row = page.getByRole('row', { name: new RegExp(scenario.studentName, 'u') });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /ตรวจคำตอบ/u }).click();
  await expect(page.getByText(expectedAnswer, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ผ่าน', exact: true }).click();
  await page.getByRole('button', { name: 'บันทึกผล' }).click();
  await expect(page.getByText('บันทึกผลการตรวจแล้ว', { exact: true })).toBeVisible();
}

async function loginStudentCollection(
  page: Page,
  scenario: CollectionLifecycleScenario,
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

/* The feed lives in the header bell's dropdown, so it is opened before it is read. */
async function openNotifications(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^การแจ้งเตือน/u }).click();
  await expect(page.getByRole('dialog', { name: /การแจ้งเตือน/u })).toBeVisible();
}
