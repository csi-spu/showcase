import { captureSanitizedFailureScreenshot, expect, test } from './fixtures.ts';
import { randomUUID } from 'node:crypto';

test.afterEach(async ({ page }, testInfo) => {
  await captureSanitizedFailureScreenshot(page, testInfo);
});

test('Student grants and withdraws Profile Consent across the public boundary', async ({
  browser,
  page,
  scenario,
}) => {
  await test.step('Student signs in with the initial credential', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบนักศึกษา' })).toBeVisible();
    await page.getByLabel('รหัสนักศึกษา').fill(scenario.studentId);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(scenario.initialPassword);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
    await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่' })).toBeVisible();
    await scenario.protectBrowserContext(page.context());
    await expect(page.getByRole('link', { name: 'แก้ไขโปรไฟล์' })).toHaveCount(0);
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole('heading', { name: 'ตั้งรหัสผ่านใหม่' })).toBeVisible();
  });

  const restrictedSession = await page.context().storageState();

  await test.step('Student changes the initial password and receives a rotated session', async () => {
    const currentPassword = page.getByRole('textbox', {
      name: 'รหัสผ่านปัจจุบัน',
      exact: true,
    });
    const newPassword = page.getByRole('textbox', { name: 'รหัสผ่านใหม่', exact: true });
    const confirmPassword = page.getByRole('textbox', {
      name: 'ยืนยันรหัสผ่านใหม่',
      exact: true,
    });
    await currentPassword.pressSequentially(scenario.initialPassword);
    await newPassword.pressSequentially(scenario.newPassword);
    await confirmPassword.pressSequentially(scenario.newPassword);
    await expect(currentPassword).toHaveValue(scenario.initialPassword);
    await expect(newPassword).toHaveValue(scenario.newPassword);
    await expect(confirmPassword).toHaveValue(scenario.newPassword);
    await expect(page.getByRole('button', { name: 'ตั้งรหัสผ่าน' })).toBeEnabled();
    await page.getByRole('button', { name: 'ตั้งรหัสผ่าน' }).click();
    await expect(page.getByRole('heading', { name: 'จัดการผลงานของคุณ' })).toBeVisible();
    await scenario.protectBrowserContext(page.context());

    const oldSessionContext = await browser.newContext({
      baseURL: process.env.STUDENT_URL ?? 'http://127.0.0.1:3002',
      storageState: restrictedSession,
    });
    try {
      const oldSessionPage = await oldSessionContext.newPage();
      await oldSessionPage.goto('/profile');
      await expect(oldSessionPage).toHaveURL(/\/$/u);
      await expect(oldSessionPage.getByRole('heading', { name: 'หมดเวลาใช้งาน' })).toBeVisible();
    } finally {
      await oldSessionContext.close();
    }
  });

  await test.step('Student edits the private Public Profile', async () => {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'แก้ไขคำแนะนำตัว' }).click();
    await page
      .getByRole('textbox', { name: 'แนะนำตัว', exact: true })
      .fill('โปรไฟล์ E2E ที่เผยแพร่');
    await page.getByRole('button', { name: 'บันทึกโปรไฟล์' }).click();
    await expect(page.getByText('บันทึกเรียบร้อยแล้ว', { exact: true })).toBeVisible();
    await expect(
      page.locator('#profile-bio').getByText('โปรไฟล์ E2E ที่เผยแพร่', { exact: true }),
    ).toBeVisible();
  });

  const visitorContext = await browser.newContext({
    baseURL: process.env.VISITOR_URL ?? 'http://127.0.0.1:3000',
  });
  const visitorPage = await visitorContext.newPage();
  try {
    await test.step('Student explicitly grants consent and Visitor sees the profile', async () => {
      const consent = page.getByRole('checkbox', { name: 'ยินยอมให้เผยแพร่โปรไฟล์' });
      await page.getByText('ยินยอมให้เผยแพร่โปรไฟล์', { exact: true }).click();
      await expect(consent).toBeChecked();
      await expect(page.getByText('โปรไฟล์นี้เผยแพร่แล้ว')).toBeVisible();
      await expect(page.getByRole('link', { name: 'ดูโปรไฟล์สาธารณะ' })).toBeVisible();

      expect(scenario.publicProfileUrl).not.toContain(scenario.studentId);
      await visitorPage.goto(scenario.publicProfileUrl, {
        timeout: 15_000,
        waitUntil: 'domcontentloaded',
      });
      await expect(
        visitorPage.getByRole('heading', { name: `${scenario.firstName} ${scenario.lastName}` }),
      ).toBeVisible();
      await expect(visitorPage.getByText('โปรไฟล์ E2E ที่เผยแพร่')).toBeVisible();
    });

    await test.step('Student withdraws consent and Visitor receives indistinguishable not-found', async () => {
      await page.getByText('ยินยอมให้เผยแพร่โปรไฟล์', { exact: true }).click();
      await expect(page.getByText('โปรไฟล์นี้ยังไม่เผยแพร่')).toBeVisible();
      await visitorPage.reload();
      await expect(visitorPage.getByRole('heading', { name: 'ไม่พบโปรไฟล์' })).toBeVisible();
      await expect(
        visitorPage.getByText('โปรไฟล์นี้ไม่มีอยู่หรือเจ้าของยังไม่ได้ยินยอมให้เผยแพร่'),
      ).toBeVisible();
      const unknownProfilePage = await visitorContext.newPage();
      try {
        await unknownProfilePage.goto(`/people/${randomUUID()}`);
        await expect(
          unknownProfilePage.getByRole('heading', { name: 'ไม่พบโปรไฟล์' }),
        ).toBeVisible();
        await expect(
          unknownProfilePage.getByText('โปรไฟล์นี้ไม่มีอยู่หรือเจ้าของยังไม่ได้ยินยอมให้เผยแพร่'),
        ).toBeVisible();
      } finally {
        await unknownProfilePage.close();
      }
      await expect(visitorPage).not.toHaveURL(new RegExp(scenario.studentId, 'u'));
    });
  } finally {
    await visitorContext.close().catch(() => undefined);
  }

  const state = await scenario.readConsentState();
  expect(state.isGranted).toBe(false);
  expect(state.history).toHaveLength(1);
  expect(state.history[0]).toMatchObject({ consentTextVersion: 'phase-1-v1' });
  expect(state.history[0]?.grantedAt).toBeTruthy();
  expect(state.history[0]?.withdrawnAt).not.toBeNull();
});
