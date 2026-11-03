import type { APIRoute } from 'astro';

import { getCfEnv } from '../../../lib/auth';
import { adminEmails, emailHtml, sendMail } from '../../../lib/email';
import { getMetricsEnv, json } from '../../../lib/metrics';
import { hasRole, getSessionUser } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) {
    return json({ ok: false, error: 'login_required' }, 401);
  }
  if (hasRole(sessionUser, 'editor') || hasRole(sessionUser, 'admin')) {
    return json({ ok: false, error: 'already_editor' }, 409);
  }

  const { db } = await getMetricsEnv();
  if (!db) {
    return json({ ok: false, error: 'metrics_unavailable' }, 503);
  }

  const env = await getCfEnv();

  const existing = await db
    .prepare('SELECT id, status FROM applications WHERE user_id = ?')
    .bind(sessionUser.id)
    .first<{ id: number; status: string }>();

  if (existing?.status === 'pending') {
    return json({ ok: true, already: true, status: 'pending' });
  }
  if (existing?.status === 'approved') {
    return json({ ok: false, error: 'already_approved' }, 409);
  }

  if (existing) {
    await db
      .prepare(
        "UPDATE applications SET status = 'pending', note = NULL, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(existing.id)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO applications (user_id, email, name, status) VALUES (?, ?, ?, 'pending')",
      )
      .bind(sessionUser.id, sessionUser.email, sessionUser.name)
      .run();
  }

  const admins = adminEmails(env);
  const adminNote =
    '관리자 콘솔에서 승인하세요: https://admin.gearpro.kr/';
  for (const admin of admins) {
    await sendMail(env, {
      to: admin,
      subject: `[GearPro] 새 에디터 신청: ${sessionUser.name} (${sessionUser.email})`,
      text: `${sessionUser.name} (${sessionUser.email}) 님이 에디터 권한을 신청했습니다.\n${adminNote}`,
      html: emailHtml(
        `<p><strong>${sessionUser.name}</strong> (${sessionUser.email}) 님이 에디터 권한을 신청했습니다.</p><p><a href="https://admin.gearpro.kr/">관리자 콘솔에서 승인하기</a></p>`,
      ),
    });
  }
  if (admins.length === 0) {
    console.warn('[apply] ADMIN_EMAILS empty — admin notification skipped');
  }

  await sendMail(env, {
    to: sessionUser.email,
    subject: '[GearPro] 에디터 신청이 접수되었습니다',
    text: `${sessionUser.name}님, 에디터 신청이 접수되었습니다. 검토 후 결과를 이메일로 안내드립니다.`,
    html: emailHtml(
      `<p>${sessionUser.name}님, 에디터 신청이 접수되었습니다.</p><p>검토 후 결과를 이메일로 안내드립니다. 감사합니다.</p>`,
    ),
  });

  return json({ ok: true, status: 'pending' });
};
