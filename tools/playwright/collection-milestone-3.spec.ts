import type { Page } from '@playwright/test';
import { captureSanitizedFailureScreenshot } from './fixtures.ts';
import { expect, test } from './collection-fixtures.ts';
import type { CollectionLifecycleScenario } from './collection-fixtures.ts';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

/*
 * Every submitted version survives a correction, lateness follows the current
 * deadline rather than the moment of submission, and closing is an audited act
 * that needs a reason.
 *
 * One journey rather than four tests, because these rules only hold together in
 * sequence: history has to survive a correction to be worth keeping, and an
 * extension has to clear a lateness that was already shown.
 */
test.describe('Collection Milestone 3', () => {
  test.describe.configure({ timeout: 240_000 });

  test('retains versions, recalculates lateness, and closes with an audited reason', async ({
    browser,
    collectionScenario,
    page: studentPage,
  }) => {
    const instructorContext = await browser.newContext({
      baseURL: collectionScenario.instructorUrl,
    });
    const instructorPage = await instructorContext.newPage();
    const firstAnswer = 'บริษัทฉบับที่หนึ่ง';
    const correctedAnswer = 'บริษัทฉบับที่สอง หลังแก้ไขตามที่ผู้สอนขอ';
    const correctionReason = 'กรุณาระบุชื่อบริษัทให้ครบถ้วนพร้อมรูปแบบบริษัทจำกัด';
    const secondCorrectionReason = 'กรุณาแนบเลขทะเบียนนิติบุคคลเพิ่มเติมก่อนปิดชุดงาน';
    const formCloseReason = 'ครบกำหนดรับเอกสารรอบแรกแล้ว จึงปิดรับการส่งครั้งแรก';
    const formReopenReason = 'เปิดรับเพิ่มให้นักศึกษาที่ติดต่อเข้ามาภายหลัง';
    const roundCloseReason = 'สิ้นสุดภาคการศึกษา ปิดชุดงานเพื่อสรุปผล';

    try {
      await loginStudentCollection(studentPage, collectionScenario);

      /*
       * The seeded deadline is already past, so this is late before anything is
       * typed. The marker shares a paragraph with the deadline date, so it is
       * matched as a fragment rather than as the whole node.
       */
      await expect(studentPage.getByText('เลยกำหนดส่งแล้ว')).toBeVisible();

      await submitAnswer(studentPage, collectionScenario, firstAnswer);
      await expect(studentPage.getByText('รอผู้สอนตรวจ', { exact: true })).toBeVisible();

      await loginInstructor(instructorPage, collectionScenario);
      await requestCorrection(instructorPage, collectionScenario, firstAnswer, correctionReason);

      // Correcting must add a version, never overwrite the one that was judged.
      await studentPage.reload();
      await expect(studentPage.getByText(correctionReason, { exact: true })).toBeVisible();
      await submitAnswer(studentPage, collectionScenario, correctedAnswer);
      await expect(studentPage.getByText('รอผู้สอนตรวจ', { exact: true })).toBeVisible();

      await test.step('the Student can read both versions and the decision', async () => {
        await studentPage.getByRole('link', { name: 'ดูประวัติการส่ง' }).click();
        await expect(studentPage.getByRole('heading', { name: 'ฉบับที่ 2' })).toBeVisible();
        await expect(studentPage.getByRole('heading', { name: 'ฉบับที่ 1' })).toBeVisible();

        /*
         * Version 1 still reads as it was sent. Had the correction overwritten
         * it, the decision below would no longer name the work it was made about.
         */
        await expect(studentPage.getByText(firstAnswer, { exact: true })).toBeVisible();
        await expect(studentPage.getByText(correctedAnswer, { exact: true })).toBeVisible();
        await expect(studentPage.getByText('ขอให้แก้ไข', { exact: true })).toBeVisible();
        await expect(studentPage.getByText(correctionReason, { exact: true })).toBeVisible();
        await expect(studentPage.getByText('ส่งครั้งแรกช้ากว่ากำหนด')).toBeVisible();
      });

      await test.step('the Instructor reads the same history', async () => {
        await openInstructorHistory(instructorPage, collectionScenario);
        await expect(instructorPage.getByRole('heading', { name: 'ฉบับที่ 2' })).toBeVisible();
        await expect(instructorPage.getByRole('heading', { name: 'ฉบับที่ 1' })).toBeVisible();
        await expect(instructorPage.getByText(firstAnswer, { exact: true })).toBeVisible();
        await expect(instructorPage.getByText(correctionReason, { exact: true })).toBeVisible();
        await expect(instructorPage.getByText('ส่งครั้งแรกช้ากว่ากำหนด')).toBeVisible();
      });

      await test.step('extending the deadline clears the recorded lateness', async () => {
        await extendDeadline(instructorPage, collectionScenario);

        /*
         * Lateness is decided on the server against the current deadline, never
         * stamped when the Student submitted, so moving the deadline past the
         * retained first submission has to clear it everywhere it was shown.
         *
         * Extending leaves this browser on the builder, so the history has to be
         * navigated back to rather than reloaded.
         */
        await openInstructorHistory(instructorPage, collectionScenario);
        await expect(instructorPage.getByText('ส่งครั้งแรกภายในกำหนด')).toBeVisible();

        await studentPage.reload();
        await expect(studentPage.getByText('ส่งครั้งแรกภายในกำหนด')).toBeVisible();
        await expect(studentPage.getByText('ส่งครั้งแรกช้ากว่ากำหนด')).toBeHidden();

        await studentPage.goto(`${collectionScenario.studentCollectionUrl}/`);
        await expect(studentPage.getByText('เลยกำหนดส่งแล้ว')).toBeHidden();
      });

      await test.step('closing and reopening the form each record a reason', async () => {
        await instructorPage.goto(
          `/groups/${collectionScenario.groupId}/forms/${collectionScenario.formId}`,
        );

        await confirmLifecycle(instructorPage, {
          confirmName: 'ปิดรับคำตอบ',
          reason: formCloseReason,
          success: 'ปิดรับคำตอบแล้ว',
          triggerName: 'ปิดรับคำตอบ',
        });

        /*
         * Reopening states how many Students would newly owe the form, so
         * reopening for stragglers is not confused with asking everyone again.
         */
        await instructorPage.getByRole('button', { name: 'เปิดรับคำตอบอีกครั้ง' }).click();
        const reopenDialog = instructorPage.getByRole('alertdialog');
        await expect(reopenDialog.getByText(/นักศึกษาที่ต้องส่งเพิ่ม/u)).toBeVisible();
        await reopenDialog.getByLabel('เหตุผล').fill(formReopenReason);
        await reopenDialog.getByRole('button', { name: 'เปิดรับคำตอบ', exact: true }).click();
        await expect(
          instructorPage.getByText('เปิดรับคำตอบอีกครั้งแล้ว', { exact: true }),
        ).toBeVisible();
      });

      await test.step('closing the round shows pending work and blocks the Student', async () => {
        /*
         * Put the Student back into changes_required first. That is the one
         * state where the form is still editable, so it is the only state in
         * which a closed round can actually refuse a write the Student can make.
         */
        await requestCorrection(
          instructorPage,
          collectionScenario,
          correctedAnswer,
          secondCorrectionReason,
        );

        await instructorPage.goto(`/rounds/${collectionScenario.roundId}`);
        await instructorPage.getByRole('button', { name: 'ปิดชุดงาน', exact: true }).click();
        const dialog = instructorPage.getByRole('alertdialog');

        // The outstanding work is shown before the decision, not after it.
        await expect(dialog.getByText('งานที่ยังค้างอยู่ในชุดงานนี้')).toBeVisible();
        await expect(dialog.getByText(/รอแก้ไข \d+ รายการ/u)).toBeVisible();

        await dialog.getByLabel('เหตุผล').fill(roundCloseReason);
        await dialog.getByRole('button', { name: 'ปิดชุดงาน', exact: true }).click();
        await expect(instructorPage.getByText('ปิดชุดงานแล้ว', { exact: true })).toBeVisible();
        await expect(
          instructorPage.getByRole('button', { name: 'เปิดชุดงานอีกครั้ง' }),
        ).toBeVisible();

        /*
         * A closed round stops writes for the whole round, and the Student sees
         * that before typing rather than after submitting. `changes_required`
         * is the state that would otherwise still be editable, so it is where a
         * form that ignored the closed round would show it.
         */
        await studentPage.goto(`${collectionScenario.studentCollectionUrl}/`);
        await expect(studentPage.getByLabel(collectionScenario.answerLabel)).toBeDisabled();
        await expect(
          studentPage.getByText('แบบฟอร์มนี้ปิดรับคำตอบแล้ว จึงดูได้อย่างเดียว'),
        ).toBeVisible();
        await expect(studentPage.getByRole('button', { name: 'ส่งคำตอบ' })).toBeHidden();
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

async function requestCorrection(
  page: Page,
  scenario: CollectionLifecycleScenario,
  expectedAnswer: string,
  reason: string,
): Promise<void> {
  await page.goto(`/groups/${scenario.groupId}/forms/${scenario.formId}/submissions`);
  const row = page.getByRole('row', { name: new RegExp(scenario.studentName, 'u') });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /ตรวจคำตอบ/u }).click();
  await expect(page.getByText(expectedAnswer, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ขอให้แก้ไข' }).click();
  await page.getByLabel('เหตุผลและสิ่งที่ต้องแก้ไข').fill(reason);
  await page.getByRole('button', { name: 'บันทึกผล' }).click();
  await expect(page.getByText('บันทึกผลการตรวจแล้ว', { exact: true })).toBeVisible();
}

async function openInstructorHistory(
  page: Page,
  scenario: CollectionLifecycleScenario,
): Promise<void> {
  await page.goto(`/groups/${scenario.groupId}/forms/${scenario.formId}/submissions`);
  await page
    .getByRole('row', { name: new RegExp(scenario.studentName, 'u') })
    .getByRole('link', { name: /ดูประวัติการส่ง/u })
    .click();
}

/**
 * Moves the deadline a week out.
 *
 * Deadlines only ever extend, so this is the one direction the builder accepts
 * once a form is open.
 */
async function extendDeadline(page: Page, scenario: CollectionLifecycleScenario): Promise<void> {
  await page.goto(`/groups/${scenario.groupId}/forms/${scenario.formId}`);
  const extended = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await page.getByLabel('กำหนดส่ง').fill(toBangkokDateTimeValue(extended));
  await page.getByRole('button', { name: 'บันทึกรายละเอียด' }).click();
  await expect(page.getByText('บันทึกรายละเอียดแล้ว', { exact: true })).toBeVisible();
}

/**
 * Opens a lifecycle confirmation, gives it a reason, and waits for the toast.
 *
 * The trigger and its confirm button share a label, so the confirm is always
 * taken from inside the dialog.
 */
async function confirmLifecycle(
  page: Page,
  {
    confirmName,
    reason,
    success,
    triggerName,
  }: { confirmName: string; reason: string; success: string; triggerName: string },
): Promise<void> {
  await page.getByRole('button', { name: triggerName, exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('เหตุผล').fill(reason);
  await dialog.getByRole('button', { name: confirmName, exact: true }).click();
  await expect(page.getByText(success, { exact: true })).toBeVisible();
}

/**
 * Renders a `datetime-local` value in Asia/Bangkok.
 *
 * The builder reads and writes this field as Bangkok wall-clock time, so the
 * value has to be built in that zone rather than the runner's.
 */
function toBangkokDateTimeValue(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(value);
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
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
