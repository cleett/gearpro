export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;

export interface Env {
  METRICS_DB: D1Database;
  DRAFT_IMAGES?: R2Bucket;
  EMAIL_SENDER?: {
    send(message: {
      to: string;
      from: string;
      subject: string;
      text: string;
      html?: string;
    }): Promise<unknown>;
  };
  SITE_URL?: string;
  KEYSTATIC_GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  ADMIN_EMAILS?: string;
  ACCESS_TEAM?: string;
  ACCESS_AUD?: string;
  DEV_MODE?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function adminEmails(env: Env): string[] {
  return String(env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function sendMail(env: Env, message: MailMessage): Promise<boolean> {
  if (!env.EMAIL_SENDER) {
    console.warn('[email] EMAIL_SENDER binding missing — mail not sent:', message.subject);
    return false;
  }
  const siteUrl = env.SITE_URL ?? 'https://gearpro.kr';
  let host = 'gearpro.kr';
  try {
    host = new URL(siteUrl).hostname;
  } catch {
    /* 기본 호스트 유지 */
  }
  try {
    await env.EMAIL_SENDER.send({
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

export function emailHtml(body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1712;line-height:1.7">
  <div style="font-size:20px;font-weight:700;margin-bottom:16px">GearPro<span style="color:#e4571d">.</span></div>
  ${body}
  <p style="margin-top:24px;font-size:12px;color:#6f675a">이 메일은 GearPro 관리자 콘솔에서 발송되었습니다.</p>
</div>`;
}

export interface DraftRow {
  id: number;
  author: string;
  author_name: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  brand: string;
  price: number;
  rating: number;
  pros: string;
  cons: string;
  specs: string;
  content: string;
  cover_r2_key: string | null;
  status: string;
  review_note: string | null;
  commit_sha: string | null;
  updated_at: string;
}

function yamlStr(s: string): string {
  return JSON.stringify(s);
}

export function buildReviewMdx(
  draft: {
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    brand: string;
    price: number;
    rating: number;
    pros: string[];
    cons: string[];
    specs: { label: string; value: string }[];
    content: string;
  },
  author: string,
  coverExt: string | null,
): string {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const cover = coverExt ? `cover: ${yamlStr(`@assets/covers/${draft.slug}/cover.${coverExt}`)}\n` : '';
  const frontmatter = [
    '---',
    `title: ${yamlStr(draft.title)}`,
    `excerpt: ${yamlStr(draft.excerpt)}`,
    cover,
    `category: ${draft.category}`,
    `brand: ${yamlStr(draft.brand)}`,
    `price: ${draft.price}`,
    `rating: ${draft.rating}`,
    `pros: ${JSON.stringify(draft.pros)}`,
    `cons: ${JSON.stringify(draft.cons)}`,
    `specs: ${JSON.stringify(draft.specs)}`,
    `author: ${author}`,
    `publishedAt: ${today}`,
    'featured: false',
    'funding: self',
    '---',
    '',
    draft.content,
    '',
  ];
  return frontmatter.join('\n');
}

export async function ghPut(
  repo: string,
  token: string,
  path: string,
  contentBase64: string,
  message: string,
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ message, content: contentBase64 }),
  });
  if (!res.ok) {
    throw new Error(`github_write_failed:${res.status}`);
  }
  const data = (await res.json()) as { commit?: { sha?: string } };
  return data.commit?.sha ?? '';
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
