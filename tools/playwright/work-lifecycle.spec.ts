import { captureSanitizedFailureScreenshot, expect, test } from './fixtures.ts';
import { createSolidPng } from './media-assets.ts';
import type { Browser, Page } from '@playwright/test';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

test.describe('Work lifecycle', () => {
  test.describe.configure({ timeout: 90_000 });
  test('approves a submitted Work and publishes its immutable Revision', async ({
    browser,
    page,
    workScenario,
  }) => {
    const title = `E2E ผลงานอนุมัติ ${workScenario.tagLabel}`;
    const { publicId } = await submitWork(page, workScenario, title);
    expect(workScenario.workPublicUrl(publicId)).not.toContain(workScenario.studentId);
    await expectWorkNotPublic(browser, workScenario.workPublicUrl(publicId));
    const stateAfterSubmission = await workScenario.readState(publicId);
    expect(stateAfterSubmission.revisions).toHaveLength(1);
    expect(stateAfterSubmission.revisions[0]?.status).toBe('pending_review');

    const adminContext = await browser.newContext({ baseURL: process.env.ADMIN_URL });
    const adminPage = await adminContext.newPage();
    try {
      await loginAdmin(adminPage, workScenario);
      await adminPage.goto('/works?view=reviews');
      const row = adminPage.getByRole('row', { name: new RegExp(title) });
      await expect(row).toBeVisible();
      await row.getByRole('link', { name: 'เปิดตรวจผลงาน' }).click();
      await expect(adminPage.getByRole('heading', { name: title })).toBeVisible();
      await expectAdminRevisionSnapshot(adminPage, workScenario, title);
      await adminPage.getByRole('button', { name: 'อนุมัติและเผยแพร่' }).click();
      await expect(adminPage.getByText('เผยแพร่ผลงานแล้ว', { exact: true })).toBeVisible();
    } finally {
      await adminContext.close();
    }

    const visitorContext = await browser.newContext({ baseURL: process.env.VISITOR_URL });
    const visitorPage = await visitorContext.newPage();
    try {
      await visitorPage.goto(workScenario.workPublicUrl(publicId));
      await expect(visitorPage.getByRole('heading', { name: title })).toBeVisible();
      await expect(visitorPage.getByText('สรุป E2E')).toBeVisible();
      const attributionSection = visitorPage
        .getByRole('heading', { name: 'ผู้จัดทำผลงาน' })
        .locator('..');
      await expect(
        attributionSection.getByText(workScenario.studentName, { exact: true }),
      ).toBeVisible();
      await expect(
        attributionSection.getByText(workScenario.contributorName, { exact: true }),
      ).toBeVisible();
      await expect(visitorPage.getByRole('link', { name: 'เอกสารประกอบ' })).toBeVisible();
      await expect(
        visitorPage
          .getByRole('list', { name: 'หัวข้อของผลงาน' })
          .getByText(workScenario.tagLabel, { exact: true }),
      ).toBeVisible();
      await expect(visitorPage.getByText('ดูผลงานผ่านวิดีโอ')).toBeVisible();
      await expect(visitorPage.getByAltText(`โปสเตอร์ ${title}`)).toBeVisible();
      await expect(visitorPage.getByAltText(`ภาพเพิ่มเติม 1 ของ ${title}`)).toBeVisible();
      await expectPublicMediaUrlsSafe(visitorPage, workScenario.studentId);
    } finally {
      await visitorContext.close();
    }

    const state = await workScenario.readState(publicId);
    expect(state.work.activityState).toBe('active');
    expect(state.work.publicationState).toBe('published');
    expect(state.publishedRevisionPublicId).toBe(state.revisions[0]?.publicId);
    expect(state.revisions[0]).toMatchObject({ title, status: 'approved' });
    expect(state.reviews).toEqual([
      { decision: 'approved', feedback: null, reason: null, revisionNumber: 1 },
    ]);
    expectAuthoritativeRevisionState(state, workScenario, [1]);
    expect(state.operations).toEqual(['revision_submitted']);
    expect(state.outboxEvents).toEqual(['work_revision_submitted', 'work_revision_published']);
  });

  test('retains a Change Request while publishing only the corrected Revision', async ({
    browser,
    page,
    workScenario,
  }) => {
    const originalTitle = `E2E ผลงานแก้ไข ${workScenario.tagLabel}`;
    const correctedTitle = `${originalTitle} ฉบับแก้ไข`;
    const { publicId } = await submitWork(page, workScenario, originalTitle);
    const publicUrl = workScenario.workPublicUrl(publicId);
    expect(publicUrl).not.toContain(workScenario.studentId);
    await expectWorkNotPublic(browser, publicUrl);

    const adminContext = await browser.newContext({ baseURL: process.env.ADMIN_URL });
    const adminPage = await adminContext.newPage();
    try {
      await loginAdmin(adminPage, workScenario);
      await reviewPendingRevision(adminPage, originalTitle, 'ส่งคำขอแก้ไข', async () => {
        await expectAdminRevisionSnapshot(adminPage, workScenario, originalTitle);
        await adminPage.locator('#change-request-reason').selectOption('content');
        await adminPage
          .getByLabel('คำแนะนำที่นำไปแก้ไขได้')
          .fill('กรุณาปรับชื่อผลงานให้สื่อความหมายและตรวจสอบสรุปให้ชัดเจน');
        await adminPage.getByRole('button', { name: 'ส่งคำขอแก้ไข' }).click();
      });
      await expect(adminPage.getByText('ส่งคำขอแก้ไขแล้ว', { exact: true })).toBeVisible();
      await expectWorkNotPublic(browser, publicUrl);

      await page.goto(`/works/${publicId}`);
      const changeRequestAlert = page.getByRole('alert').filter({ hasText: 'ผู้ดูแลขอให้แก้ไข' });
      await expect(changeRequestAlert).toBeVisible();
      await expect(
        changeRequestAlert.getByText('กรุณาปรับชื่อผลงานให้สื่อความหมายและตรวจสอบสรุปให้ชัดเจน', {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByLabel('ชื่อผลงาน').fill(correctedTitle);
      await page.getByRole('button', { name: 'ถัดไป' }).click();
      await expect(page.getByRole('heading', { name: '2 สื่อ' })).toBeVisible();
      await advanceAuthoring(page, {
        includeContributor: false,
        preserveDiscovery: true,
        scenario: workScenario,
      });
      await page.getByRole('button', { name: 'บันทึกล่าสุดและส่งตรวจ' }).click();
      await expect(page.getByRole('heading', { name: 'ส่งผลงานแล้ว' })).toBeVisible();
      await expect(page.getByText('กำลังรอตรวจ', { exact: true }).first()).toBeVisible();
      const stateBeforeReplacementApproval = await workScenario.readState(publicId);
      expect(stateBeforeReplacementApproval.revisions.map((revision) => revision.status)).toEqual([
        'changes_requested',
        'pending_review',
      ]);
      const replacementRevision = stateBeforeReplacementApproval.revisions[1];
      if (replacementRevision === undefined) throw new Error('E2E_REPLACEMENT_REVISION_MISSING');
      await expectWorkNotPublic(browser, publicUrl);

      await reviewPendingRevision(adminPage, correctedTitle, 'อนุมัติและเผยแพร่', async () => {
        await expectAdminRevisionSnapshot(adminPage, workScenario, correctedTitle);
        const approvalButton = adminPage.getByRole('button', {
          name: 'อนุมัติและเผยแพร่',
        });
        await expect(
          adminPage
            .locator('form')
            .filter({ has: approvalButton })
            .locator('input[name="expectedRevisionVersion"]'),
        ).toHaveValue(String(replacementRevision.version));
        await approvalButton.click();
      });
      await expect(adminPage.getByText('เผยแพร่ผลงานแล้ว', { exact: true })).toBeVisible();
    } finally {
      await adminContext.close();
    }

    const visitorContext = await browser.newContext({ baseURL: process.env.VISITOR_URL });
    const visitorPage = await visitorContext.newPage();
    try {
      await visitorPage.goto(workScenario.workPublicUrl(publicId));
      await expect(visitorPage.getByRole('heading', { name: correctedTitle })).toBeVisible();
      await expect(
        visitorPage.getByRole('heading', { name: originalTitle, exact: true }),
      ).toHaveCount(0);
      await expectPublicMediaUrlsSafe(visitorPage, workScenario.studentId);
    } finally {
      await visitorContext.close();
    }

    const state = await workScenario.readState(publicId);
    expect(state.work.activityState).toBe('active');
    expect(state.work.publicationState).toBe('published');
    expect(state.revisions).toHaveLength(2);
    expect(state.revisions.map((revision) => revision.status)).toEqual([
      'changes_requested',
      'approved',
    ]);
    expect(state.revisions[1]).toMatchObject({
      title: correctedTitle,
      basePublishedRevisionId: null,
    });
    expect(state.revisions[0]).toMatchObject({
      title: originalTitle,
      summary: 'สรุป E2E',
    });
    expect(state.publishedRevisionPublicId).toBe(state.revisions[1]?.publicId);
    expect(state.reviews).toEqual([
      {
        decision: 'changes_requested',
        feedback: 'กรุณาปรับชื่อผลงานให้สื่อความหมายและตรวจสอบสรุปให้ชัดเจน',
        reason: 'content',
        revisionNumber: 1,
      },
      { decision: 'approved', feedback: null, reason: null, revisionNumber: 2 },
    ]);
    expectAuthoritativeRevisionState(state, workScenario, [1, 2]);
    expect(state.operations).toEqual(['revision_submitted', 'revision_submitted']);
    expect(state.outboxEvents).toEqual([
      'work_revision_submitted',
      'work_revision_submitted',
      'work_revision_published',
    ]);
  });
});

async function submitWork(
  page: Page,
  scenario: import('./fixtures.ts').WorkLifecycleScenario,
  title: string,
): Promise<{ publicId: string }> {
  await loginStudent(page, scenario);
  await page.goto('/works/new');
  await page.getByLabel('ชื่อผลงาน').fill(title);
  await page.getByLabel('สรุปผลงาน').fill('สรุป E2E');
  await page.getByLabel('รายละเอียดผลงาน').fill('รายละเอียดผลงานสำหรับการทดสอบข้ามขอบเขต');
  await page.locator('#work-category').selectOption('course_work');
  await page.locator('#work-year').selectOption('2569');
  await page.locator('#work-semester').selectOption('1');
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.getByRole('heading', { name: '2 สื่อ' })).toBeVisible();
  await page.locator('#work-poster-upload').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: createSolidPng(1200, 1800, [220, 80, 110]),
  });
  await expect(page.getByAltText('ตัวอย่างโปสเตอร์ที่ผ่านการประมวลผล')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '2 สื่อ' })).toBeVisible();
  await expect(page.getByAltText('ตัวอย่างโปสเตอร์ที่ผ่านการประมวลผล')).toBeVisible();
  await page.locator('#work-gallery-upload').setInputFiles({
    name: 'gallery.png',
    mimeType: 'image/png',
    buffer: createSolidPng(640, 480, [80, 120, 220]),
  });
  await expect(page.getByAltText('ตัวอย่างภาพแกลเลอรีที่ผ่านการประมวลผล')).toBeVisible();
  await advanceAuthoring(page, { includeContributor: true, scenario });
  await expectStudentReviewSummary(page, scenario, title);
  await page.getByRole('button', { name: 'บันทึกล่าสุดและส่งตรวจ' }).click();
  await expect(page.getByRole('heading', { name: 'ส่งผลงานแล้ว' })).toBeVisible();
  await expect(page.getByText('กำลังรอตรวจ', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('ฉบับนี้แก้ไขไม่ได้ระหว่างรอตรวจ คุณถอนออกจากคิวได้ก่อนผู้ดูแลตอบกลับ', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'ถัดไป' })).toHaveCount(0);
  const publicId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1);
  if (publicId === undefined) throw new Error('E2E_WORK_PUBLIC_ID_MISSING');
  return { publicId };
}

async function expectStudentReviewSummary(
  page: Page,
  scenario: import('./fixtures.ts').WorkLifecycleScenario,
  title: string,
): Promise<void> {
  await expect(page.getByRole('heading', { name: '5 ตรวจสอบและส่ง' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ตัวอย่างสื่อก่อนส่งตรวจ' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: title })).toBeVisible();
  await expectReviewValue(page, 'สรุปผลงาน', 'สรุป E2E');
  await expectReviewValue(page, 'รายละเอียดผลงาน', 'รายละเอียดผลงานสำหรับการทดสอบข้ามขอบเขต');
  await expectReviewValue(page, 'ประเภทผลงาน', 'ผลงานรายวิชา');
  await expectReviewValue(page, 'ปีการศึกษา', '2569');
  await expectReviewValue(page, 'ภาคการศึกษา', '1');
  await expectReviewValue(page, 'ผู้ส่งผลงาน', scenario.studentName);
  await expectReviewValue(page, 'ชั้นปีเมื่อทำผลงาน', '3');
  await expectReviewValue(page, 'ผู้ร่วมผลงาน', `${scenario.contributorName} (นักพัฒนา)`);
  await expectReviewValue(page, 'ลิงก์', 'https://example.com/e2e-document');
  await expectReviewValue(page, 'แท็ก', `#${scenario.tagLabel}`);
  await expectReviewValue(
    page,
    'ลิงก์วิดีโอ YouTube หรือ TikTok แยกบรรทัด',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  await expect(
    page.getByAltText('ตัวอย่างโปสเตอร์ที่ผ่านการประมวลผล').filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByAltText('ตัวอย่างภาพแกลเลอรีที่ผ่านการประมวลผล').filter({ visible: true }),
  ).toBeVisible();
}

async function expectReviewValue(page: Page, label: string, value: string): Promise<void> {
  const row = page.getByText(label, { exact: true }).locator('..');
  await expect(row.getByText(value, { exact: true })).toBeVisible();
}

async function expectAdminRevisionSnapshot(
  page: Page,
  scenario: import('./fixtures.ts').WorkLifecycleScenario,
  title: string,
): Promise<void> {
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('สรุป E2E', { exact: true })).toBeVisible();
  await expect(
    page.getByText('รายละเอียดผลงานสำหรับการทดสอบข้ามขอบเขต', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('ผลงานรายวิชา', { exact: true })).toBeVisible();
  await expect(page.getByText('ปีการศึกษา 2569 ภาค 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'เอกสารประกอบ' })).toBeVisible();
  await expect(page.getByText(scenario.tagLabel, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'YouTube' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'โปสเตอร์' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'แกลเลอรี 1' })).toBeVisible();
  await expect(page.getByText(scenario.studentName, { exact: true })).toBeVisible();
  await expect(page.getByText(scenario.contributorName, { exact: true })).toBeVisible();
  await expect(page.getByText('นักพัฒนา', { exact: true })).toBeVisible();
}

async function expectWorkNotPublic(browser: Browser, publicUrl: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(publicUrl);
    await expect(page.getByRole('heading', { name: 'ไม่พบผลงาน' })).toBeVisible();
    await expect(
      page.getByText('ผลงานนี้ไม่มีอยู่หรือยังไม่ได้รับอนุมัติให้เผยแพร่', { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
}

async function expectPublicMediaUrlsSafe(page: Page, studentId: string): Promise<void> {
  for (const image of [page.getByAltText(/^โปสเตอร์ /u), page.getByAltText(/^ภาพเพิ่มเติม 1 /u)]) {
    const source = await image.getAttribute('src');
    expect(source).not.toBeNull();
    expect(source).not.toContain(studentId);
    expect(source).not.toMatch(/poster\.png|gallery\.png|token|signature|credential/iu);
  }
}

function expectAuthoritativeRevisionState(
  state: import('./fixtures.ts').WorkLifecycleState,
  scenario: import('./fixtures.ts').WorkLifecycleScenario,
  revisionNumbers: number[],
): void {
  expect(state.media).toHaveLength(revisionNumbers.length * 2);
  for (const revisionNumber of revisionNumbers) {
    expect(state.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hasMaster: true,
          hasSanitizedObjectKeys: true,
          kind: 'poster',
          position: 1,
          revisionNumber,
          status: 'ready',
          variantWidths: [480, 768, 1200],
        }),
        expect.objectContaining({
          hasMaster: true,
          hasSanitizedObjectKeys: true,
          kind: 'gallery',
          position: 1,
          revisionNumber,
          status: 'ready',
          variantWidths: [640],
        }),
      ]),
    );
    expect(state.links).toContainEqual({
      label: 'เอกสารประกอบ',
      position: 1,
      revisionNumber,
      url: 'https://example.com/e2e-document',
    });
    expect(state.tags).toContainEqual({
      displayLabel: scenario.tagLabel,
      normalizedIdentity: scenario.tagLabel,
      position: 1,
      revisionNumber,
    });
    expect(state.videoLinks).toContainEqual({
      position: 1,
      provider: 'youtube',
      providerVideoId: 'dQw4w9WgXcQ',
      revisionNumber,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    expect(state.attributions).toEqual(
      expect.arrayContaining([
        {
          attributionName: scenario.studentName,
          contributionRole: null,
          kind: 'submitter',
          position: 1,
          revisionNumber,
          studyYear: 3,
        },
        {
          attributionName: scenario.contributorName,
          contributionRole: 'นักพัฒนา',
          kind: 'account',
          position: 2,
          revisionNumber,
          studyYear: null,
        },
      ]),
    );
  }
}

async function advanceAuthoring(
  page: Page,
  options: {
    includeContributor: boolean;
    preserveDiscovery?: boolean;
    scenario?: import('./fixtures.ts').WorkLifecycleScenario;
  },
): Promise<void> {
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.getByRole('heading', { name: '3 การแสดงชื่อ' })).toBeVisible();
  await page.locator('#study-year').selectOption('3');
  if (options.includeContributor) {
    if (options.scenario === undefined) throw new Error('E2E_WORK_SCENARIO_MISSING');
    await page.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }).click();
    await page
      .getByRole('combobox', { name: 'ชื่อ นามสกุล หรือรหัสนักศึกษา' })
      .fill(options.scenario.contributorName);
    const contributorOption = page.getByRole('option', {
      name: new RegExp(options.scenario.contributorName, 'u'),
    });
    await expect(contributorOption).toBeVisible();
    await contributorOption.click();
    await page.getByLabel('บทบาทที่มีต่อผลงาน').fill('นักพัฒนา');
    await page.getByRole('button', { name: 'เพิ่มผู้ร่วมผลงาน' }).last().click();
    await expect(page.getByText(options.scenario.contributorName)).toBeVisible();
  }
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.getByRole('heading', { name: '4 การค้นพบและลิงก์' })).toBeVisible();
  if (options.preserveDiscovery === true) {
    await page.getByRole('button', { name: 'ถัดไป' }).click();
    await expect(page.getByRole('heading', { name: '5 ตรวจสอบและส่ง' })).toBeVisible();
    return;
  }
  await page.getByRole('button', { name: 'เพิ่มลิงก์ทั่วไป' }).click();
  await page.getByLabel('ชื่อลิงก์').fill('เอกสารประกอบ');
  await page.getByLabel('HTTPS URL').fill('https://example.com/e2e-document');
  const tagInput = page.getByRole('combobox', { name: 'ค้นหาหรือสร้างแท็ก' });
  await tagInput.fill(options.scenario?.tagLabel ?? 'e2e-corrected');
  await expect(page.getByRole('option', { name: /สร้างแท็ก/ })).toBeVisible();
  await tagInput.press('Enter');
  await page
    .getByLabel('ลิงก์วิดีโอ YouTube หรือ TikTok แยกบรรทัด')
    .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.getByRole('heading', { name: '5 ตรวจสอบและส่ง' })).toBeVisible();
}

async function loginStudent(
  page: Page,
  scenario: import('./fixtures.ts').WorkLifecycleScenario,
): Promise<void> {
  await page.goto('/');
  await page.getByLabel('รหัสนักศึกษา').fill(scenario.studentId);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scenario.initialPassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่' })).toBeVisible();
  await scenario.protectBrowserContext(page.context());
  await page.getByLabel('รหัสผ่านปัจจุบัน', { exact: true }).fill(scenario.initialPassword);
  await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(scenario.newPassword);
  await page.getByLabel('ยืนยันรหัสผ่านใหม่', { exact: true }).fill(scenario.newPassword);
  await page.getByRole('button', { name: 'ตั้งรหัสผ่าน' }).click();
  await expect(page.getByRole('heading', { name: 'จัดการผลงานของคุณ' })).toBeVisible();
  await scenario.protectBrowserContext(page.context());
}

async function loginAdmin(
  page: Page,
  scenario: import('./fixtures.ts').WorkLifecycleScenario,
): Promise<void> {
  await page.goto('/');
  await page.getByLabel('ชื่อผู้ใช้').fill(scenario.adminLogin);
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scenario.adminInitialPassword);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่' })).toBeVisible();
  await scenario.protectBrowserContext(page.context());
  await page.getByLabel('รหัสผ่านปัจจุบัน', { exact: true }).fill(scenario.adminInitialPassword);
  await page.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(scenario.adminNewPassword);
  await page.getByLabel('ยืนยันรหัสผ่านใหม่', { exact: true }).fill(scenario.adminNewPassword);
  await page.getByRole('button', { name: 'ตั้งรหัสผ่าน' }).click();
  await expect(page.getByRole('heading', { name: 'จัดการงานสำคัญจากที่เดียว' })).toBeVisible();
  await scenario.protectBrowserContext(page.context());
}

async function reviewPendingRevision(
  page: Page,
  title: string,
  actionName: string,
  action: () => Promise<void>,
): Promise<void> {
  await page.goto('/works?view=reviews');
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toBeVisible();
  await row.getByRole('link', { name: 'เปิดตรวจผลงาน' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: actionName })).toBeVisible();
  await action();
}
