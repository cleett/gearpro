export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(
  env: Record<string, unknown>,
  message: MailMessage,
): Promise<boolean> {
  const sender = env['EMAIL_SENDER'] as
    | {
        send(message: {
          to: string;
          from: string;
          subject: string;
          text: string;
          html?: string;
        }): Promise<unknown>;
      }
    | undefined;
  if (!sender) {
    console.warn('[email] EMAIL_SENDER binding missing — mail not sent:', message.subject);
    return false;
  }
  const siteUrl = (env['SITE_URL'] as string) ?? 'https://gearpro.kr';
  let host = 'gearpro.kr';
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    /* 기본 호스트 유지 */
  }
  try {
    await sender.send({
      to: message.to,
      from: `GearPro <noreply@${host}>`,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return true;
  } catch (e) {
    console.warn('[email] send failed:', e);
    return false;
  }
}

export function adminEmails(env: Record<string, unknown>): string[] {
  return String(env['ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function emailHtml(body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1712;line-height:1.7">
  <div style="font-size:20px;font-weight:700;margin-bottom:16px">GearPro<span style="color:#e4571d">.</span></div>
  ${body}
  <p style="margin-top:24px;font-size:12px;color:#6f675a">이 메일은 GearPro 포털에서 발송되었습니다.</p>
</div>`;
}
