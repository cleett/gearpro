import {
  adminEmails,
  buildReviewMdx,
  emailHtml,
  ghPut,
  SLUG_RE,
  sendMail,
  toBase64,
  type DraftRow,
  type Env,
} from './lib';

interface JwkKey {
  kty: string;
  kid: string;
  n: string;
  e: string;
}

interface ApplicationRow {
  id: number;
  user_id: string;
  email: string;
  name: string;
  status: string;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  membership: string;
  createdAt: number;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function jwtSegment(token: string, index: 0 | 1): Record<string, unknown> {
  const seg = token.split('.')[index];
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

let jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;

async function verifyAccessJwt(token: string, env: Env): Promise<string | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[access] jwt: malformed (not 3 parts)');
      return null;
    }
    const header = jwtSegment(token, 0) as { kid?: string; alg?: string };
    const claims = jwtSegment(token, 1);
    const aud = Array.isArray(claims.aud)
      ? String(claims.aud[0] ?? '')
      : String(claims.aud ?? '');
    if (aud !== env.ACCESS_AUD) {
      console.warn('[access] jwt: aud mismatch — got', aud);
      return null;
    }
    if (typeof claims.exp === 'number' && (claims.exp as number) * 1000 < Date.now() - 30_000) {
      console.warn('[access] jwt: expired');
      return null;
    }
    if (!env.ACCESS_TEAM) {
      return typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    }
    if (!jwksCache || Date.now() - jwksCache.fetchedAt > 3_600_000) {
      const res = await fetch(
        `https://${env.ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`,
      );
      if (!res.ok) {
        console.warn('[access] certs fetch failed:', res.status);
        return null;
      }
      jwksCache = {
        keys: ((await res.json()) as { keys: JwkKey[] }).keys,
        fetchedAt: Date.now(),
      };
    }
    const alg = header.alg ?? 'RS256';
    const wantKty = alg === 'ES256' ? 'EC' : 'RSA';
    const jwk = jwksCache.keys.find((k) => k.kid === header.kid && k.kty === wantKty);
    if (!jwk) {
      console.warn('[access] jwt: no cert for kid', header.kid, 'alg', alg);
      return null;
    }
    const isEs = wantKty === 'EC';
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk as unknown as JsonWebKey,
      isEs ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      isEs ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) {
      console.warn('[access] jwt: signature verification failed');
      return null;
    }
    console.log('[access] jwt ok — email:', claims.email, 'alg:', alg);
    return typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  } catch (e) {
    console.warn('[access] jwt verify error:', e);
    return null;
  }
}

async function requireAdmin(request: Request, env: Env): Promise<string | null> {
  if (env.DEV_MODE === '1' && !env.ACCESS_AUD) {
    return (request.headers.get('x-dev-email') ?? '').trim().toLowerCase() || null;
  }
  if (!env.ACCESS_AUD) return null;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) {
    console.warn('[access] no Cf-Access-Jwt-Assertion header on request');
    return null;
  }
  const email = await verifyAccessJwt(jwt, env);
  if (!email) return null;
  return adminEmails(env).includes(email) ? email : null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtDate(s: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(s));
  } catch {
    return s;
  }
}

function fmtPrice(p: number): string {
  return p === 0 ? '무료' : `${p.toLocaleString('ko-KR')}원`;
}

function setupPage(): Response {
  return new Response(
    `<!doctype html><html lang="ko"><meta charset="utf-8"><title>GearPro 관리자</title>
<body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:0 20px;line-height:1.7;color:#1a1712">
<h1 style="font-size:22px">GearPro 관리자 콘솔</h1>
<p>이 페이지는 <strong>Cloudflare Access</strong>로 보호되어야 합니다. 아직 Access 애플리케이션이
연결되지 않아 접근이 차단되었습니다.</p>
<ol>
<li>Zero Trust 대시보드 → Access → Applications → <em>Add an application → Self-hosted</em></li>
<li>도메인 <code>admin.gearpro.kr</code>, 세션 24h</li>
<li>정책: Allow / Include / Emails → <code>clee11@gmail.com</code></li>
<li>생성 후 <code>aud</code> 값을 이 Worker의 <code>ACCESS_AUD</code> 변수로 설정하고 재배포하세요.</li>
</ol></body></html>`,
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Pretendard Variable', Pretendard, system-ui, sans-serif; background: #f6f4ef; color: #1a1712; line-height: 1.6; }
main { max-width: 960px; margin: 0 auto; padding: 40px 20px 80px; }
header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 28px; }
h1 { font-size: 26px; margin: 0; letter-spacing: -0.02em; }
h2 { font-size: 18px; margin: 36px 0 12px; letter-spacing: -0.01em; }
.muted { color: #6f675a; font-size: 13px; }
.card { background: #fff; border: 1px solid #e6e1d6; border-radius: 14px; padding: 18px 20px; margin-top: 12px; }
.row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; justify-content: space-between; }
button { cursor: pointer; border-radius: 999px; border: 0; padding: 8px 16px; font-size: 13px; font-weight: 600; background: #1a1712; color: #f6f4ef; }
button:hover { background: #e4571d; }
button.warn { background: transparent; border: 1px solid #c98a2c; color: #a06b10; }
button.warn:hover { background: #f8ecd4; }
button:disabled { opacity: 0.5; cursor: wait; }
input, select { border: 1px solid #e6e1d6; border-radius: 999px; padding: 6px 12px; font-size: 13px; background: #fff; font-family: inherit; }
input.grow { flex: 1; min-width: 200px; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e6e1d6; border-radius: 14px; overflow: hidden; font-size: 13px; }
th { text-align: left; padding: 10px 14px; border-bottom: 1px solid #e6e1d6; color: #6f675a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
td { padding: 10px 14px; border-bottom: 1px solid #f0ece2; vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
.msg { font-size: 13px; margin-top: 8px; color: #6f675a; min-height: 1em; }
details pre { background: #1a1712; color: #f6f4ef; padding: 14px; border-radius: 10px; overflow: auto; max-height: 340px; font-size: 12px; line-height: 1.6; }
.badge { border-radius: 999px; border: 1px solid #e6e1d6; padding: 2px 10px; font-size: 11px; font-weight: 600; }
a { color: inherit; }
`;

function dashboard(
  env: Env,
  admin: string,
  applications: ApplicationRow[],
  pending: DraftRow[],
  resolved: DraftRow[],
  users: UserRow[],
): Response {
  const logout = env.ACCESS_TEAM
    ? `<a href="https://${esc(env.ACCESS_TEAM)}.cloudflareaccess.com/cdn-cgi/access/logout">Access 로그아웃</a>`
    : '';
  const catLabel = (slug: string) => slug;
  const statusLabel: Record<string, string> = {
    pending: '검토 대기',
    published: '게시됨',
    rejected: '반려됨',
  };

  const appCards = applications
    .map(
      (a) => `
  <div class="card row" data-application="${a.id}">
    <div>
      <strong>${esc(a.name)}</strong>
      <div class="muted">${esc(a.email)} · 신청일 ${esc(a.created_at)}</div>
    </div>
    <div class="row">
      <input type="text" placeholder="거절 사유 (선택)" data-app-note="${a.id}" class="grow" />
      <button data-app-approve="${a.id}">승인 (에디터)</button>
      <button class="warn" data-app-reject="${a.id}">거절</button>
    </div>
  </div>`,
    )
    .join('');

  const draftCards = pending
    .map(
      (d) => `
  <div class="card" data-draft="${d.id}">
    <div class="row">
      <div>
        <div class="badge">${esc(catLabel(d.category))}</div>
        <h3 style="margin:8px 0 2px;font-size:17px">${esc(d.brand)} ${esc(d.title)}</h3>
        <div class="muted">${esc(d.author_name)} (${esc(d.author)}) · ${esc(fmtDate(d.updated_at))} · ${esc(fmtPrice(d.price))} · 평점 ${esc(d.rating)}</div>
        <div class="muted">slug: <code>${esc(d.slug)}</code></div>
      </div>
      ${d.cover_r2_key ? `<img src="/media?key=${encodeURIComponent(d.cover_r2_key)}" alt="" style="width:144px;height:96px;object-fit:cover;border-radius:10px;border:1px solid #e6e1d6" />` : ''}
    </div>
    <p style="font-size:14px">${esc(d.excerpt)}</p>
    <p class="muted" style="font-size:13px">
      <strong style="color:#1a1712">좋았던 점:</strong> ${esc((JSON.parse(d.pros) as string[]).join(' / ') || '—')} &nbsp;·&nbsp;
      <strong style="color:#1a1712">아쉬운 점:</strong> ${esc((JSON.parse(d.cons) as string[]).join(' / ') || '—')}
    </p>
    <details><summary style="cursor:pointer;font-size:13px">본문 보기 (MDX)</summary><pre>${esc(d.content)}</pre></details>
    <div class="row" style="margin-top:14px;justify-content:flex-start">
      <button data-publish="${d.id}">승인 · Keystatic에 게시</button>
      <input type="text" placeholder="반려 사유 (선택)" data-note="${d.id}" class="grow" />
      <button class="warn" data-reject="${d.id}">반려</button>
    </div>
    <p class="msg" data-msg="${d.id}"></p>
  </div>`,
    )
    .join('');

  const resolvedRows = resolved
    .map(
      (d) => `
  <tr>
    <td><strong>${esc(d.brand)} ${esc(d.title)}</strong><div class="muted">${esc(d.author_name)}</div></td>
    <td><span class="badge">${esc(statusLabel[d.status] ?? d.status)}</span>${d.status === 'published' ? ` <a class="muted" href="https://gearpro.kr/reviews/${esc(d.slug)}/" target="_blank" rel="noreferrer">보기</a>` : ''}${d.review_note ? `<div class="muted">사유: ${esc(d.review_note)}</div>` : ''}</td>
    <td class="muted">${esc(fmtDate(d.updated_at))}</td>
  </tr>`,
    )
    .join('');

  const userRows = users
    .map(
      (u) => `
  <tr data-user-email="${esc(u.email)}">
    <td><strong>${esc(u.name)}</strong><div class="muted">${esc(u.email)}</div></td>
    <td>
      <select data-role="${esc(u.email)}">
        ${['user', 'editor', 'moderator', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
    </td>
    <td>
      <select data-membership="${esc(u.email)}">
        ${['free', 'paid'].map((m) => `<option value="${m}" ${u.membership === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </td>
    <td><button class="warn" data-user-save="${esc(u.email)}">저장</button></td>
  </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GearPro 관리자 콘솔</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>GearPro 관리자 콘솔</h1>
      <p class="muted" style="margin:4px 0 0">Access 인증: ${esc(admin)}</p>
    </div>
    ${logout}
  </header>

  <h2>에디터 신청 <span class="muted">(${applications.length})</span></h2>
  ${applications.length ? appCards : '<p class="muted card">대기 중인 신청이 없습니다.</p>'}

  <h2>초안 검토 큐 <span class="muted">(${pending.length})</span></h2>
  ${pending.length ? draftCards : '<p class="muted card">검토 대기 중인 초안이 없습니다.</p>'}

  <h2>최근 처리 내역</h2>
  ${
    resolvedRows
      ? `<table><thead><tr><th>초안</th><th>상태</th><th>처리일</th></tr></thead><tbody>${resolvedRows}</tbody></table>`
      : '<p class="muted card">아직 처리된 초안이 없습니다.</p>'
  }

  <h2>사용자 관리 <span class="muted">(최근 50명)</span></h2>
  ${
    userRows
      ? `<table><thead><tr><th>사용자</th><th>역할</th><th>멤버십</th><th></th></tr></thead><tbody>${userRows}</tbody></table>`
      : '<p class="muted card">가입된 사용자가 없습니다.</p>'
  }
</main>

<script>
  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ ok: false, error: 'bad_response' }));
    if (!data.ok) throw new Error(data.error || 'unknown');
    return data;
  }

  document.querySelectorAll('[data-app-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await post('/api/applications', { id: Number(btn.dataset.appApprove), action: 'approve' }); location.reload(); }
      catch (e) { btn.disabled = false; alert('승인 실패: ' + e.message); }
    });
  });
  document.querySelectorAll('[data-app-reject]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.appReject;
      const note = document.querySelector('[data-app-note="' + id + '"]').value;
      btn.disabled = true;
      try { await post('/api/applications', { id: Number(id), action: 'reject', note }); location.reload(); }
      catch (e) { btn.disabled = false; alert('거절 실패: ' + e.message); }
    });
  });
  document.querySelectorAll('[data-publish]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.publish;
      btn.disabled = true; btn.textContent = '게시 중…';
      try {
        await post('/api/publish', { id: Number(id) });
        document.querySelector('[data-msg="' + id + '"]').textContent = '게시 완료! CI 배포 후 사이트에 반영됩니다.';
        setTimeout(() => location.reload(), 1500);
      } catch (e) { btn.disabled = false; btn.textContent = '승인 · Keystatic에 게시'; document.querySelector('[data-msg="' + id + '"]').textContent = '게시 실패: ' + e.message; }
    });
  });
  document.querySelectorAll('[data-reject]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.reject;
      const note = document.querySelector('[data-note="' + id + '"]').value;
      btn.disabled = true;
      try { await post('/api/reject', { id: Number(id), note }); location.reload(); }
      catch (e) { btn.disabled = false; document.querySelector('[data-msg="' + id + '"]').textContent = '반려 실패: ' + e.message; }
    });
  });
  document.querySelectorAll('[data-user-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.userSave;
      const role = document.querySelector('[data-role="' + email + '"]').value;
      const membership = document.querySelector('[data-membership="' + email + '"]').value;
      btn.disabled = true;
      try { await post('/api/users', { email, role, membership }); btn.textContent = '저장됨'; setTimeout(() => { btn.textContent = '저장'; btn.disabled = false; }, 1200); }
      catch (e) { btn.disabled = false; alert('저장 실패: ' + e.message); }
    });
  });
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const MEDIA_RE = /^drafts\/[a-z0-9-]+\/[a-f0-9-]{36}\.(jpe?g|png|webp)$/;
const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

async function media(url: URL, env: Env): Promise<Response> {
  const key = url.searchParams.get('key') ?? '';
  if (!env.DRAFT_IMAGES || !MEDIA_RE.test(key)) {
    return json({ ok: false, error: 'not_found' }, 404);
  }
  const obj = await env.DRAFT_IMAGES.get(key);
  if (!obj) return json({ ok: false, error: 'not_found' }, 404);
  const ext = key.split('.').pop() ?? '';
  return new Response(obj.body, {
    headers: {
      'content-type': MEDIA_TYPES[ext] ?? 'application/octet-stream',
      'cache-control': 'private, max-age=60',
    },
  });
}

async function publishDraft(request: Request, env: Env): Promise<Response> {
  const repo = env.KEYSTATIC_GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  if (!repo || !token || repo === 'your-username/gearpro') {
    return json({ ok: false, error: 'github_not_configured' }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as { id?: number };
  if (!body.id) return json({ ok: false, error: 'id_required' }, 400);

  const draft = await env.METRICS_DB.prepare('SELECT * FROM drafts WHERE id = ?')
    .bind(Number(body.id))
    .first<DraftRow>();
  if (!draft) return json({ ok: false, error: 'not_found' }, 404);
  if (draft.status !== 'pending') return json({ ok: false, error: 'not_pending' }, 409);
  if (!SLUG_RE.test(draft.slug)) return json({ ok: false, error: 'bad_slug' }, 400);

  const mdxPath = `src/content/reviews/${draft.slug}.mdx`;
  const exists = await fetch(`https://api.github.com/repos/${repo}/contents/${mdxPath}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (exists.ok) return json({ ok: false, error: 'slug_taken' }, 409);

  let commitSha = '';
  try {
    let coverExt: string | null = null;
    if (draft.cover_r2_key && env.DRAFT_IMAGES) {
      const obj = await env.DRAFT_IMAGES.get(draft.cover_r2_key);
      if (obj) {
        coverExt = draft.cover_r2_key.split('.').pop() ?? null;
        const bytes = new Uint8Array(await obj.arrayBuffer());
        commitSha = await ghPut(
          repo,
          token,
          `src/assets/covers/${draft.slug}/cover.${coverExt}`,
          toBase64(bytes),
          `publish: cover for ${draft.slug}`,
        );
      }
    }

    const mdx = buildReviewMdx(
      {
        title: draft.title,
        slug: draft.slug,
        excerpt: draft.excerpt,
        category: draft.category,
        brand: draft.brand,
        price: draft.price,
        rating: draft.rating,
        pros: JSON.parse(draft.pros) as string[],
        cons: JSON.parse(draft.cons) as string[],
        specs: JSON.parse(draft.specs) as { label: string; value: string }[],
        content: draft.content,
      },
      draft.author,
      coverExt,
    );
    const mdxSha = await ghPut(
      repo,
      token,
      mdxPath,
      toBase64(new TextEncoder().encode(mdx)),
      `publish: review ${draft.slug}`,
    );
    commitSha = mdxSha || commitSha;
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 502);
  }

  await env.METRICS_DB.prepare(
    "UPDATE drafts SET status = 'published', commit_sha = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(commitSha, draft.id)
    .run();

  await sendMail(env, {
    to: draft.author,
    subject: `[GearPro] 리뷰가 게시되었습니다: ${draft.title}`,
    text: `${draft.author_name}님의 리뷰 "${draft.title}"가 게시되었습니다.\nhttps://gearpro.kr/reviews/${draft.slug}/\nCI 배포 후 몇 분 내 확인할 수 있습니다.`,
    html: emailHtml(
      `<p><strong>${draft.author_name}</strong>님의 리뷰가 게시되었습니다.</p><p>"${draft.title}" — <a href="https://gearpro.kr/reviews/${draft.slug}/">리뷰 보기</a></p><p style="font-size:12px;color:#6f675a">CI 배포 후 몇 분 내 반영됩니다.</p>`,
    ),
  });

  return json({ ok: true, slug: draft.slug, commit: commitSha });
}

async function rejectDraft(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { id?: number; note?: string };
  if (!body.id) return json({ ok: false, error: 'id_required' }, 400);

  const draft = await env.METRICS_DB.prepare('SELECT * FROM drafts WHERE id = ?')
    .bind(Number(body.id))
    .first<DraftRow>();
  if (!draft) return json({ ok: false, error: 'not_found' }, 404);
  if (draft.status !== 'pending') return json({ ok: false, error: 'not_pending' }, 409);

  const note = (body.note ?? '').slice(0, 500);
  await env.METRICS_DB.prepare(
    "UPDATE drafts SET status = 'rejected', review_note = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(note, draft.id)
    .run();

  await sendMail(env, {
    to: draft.author,
    subject: `[GearPro] 초안이 반려되었습니다: ${draft.title}`,
    text: `${draft.author_name}님의 초안 "${draft.title}"가 반려되었습니다.${note ? `\n사유: ${note}` : ''}\n포털에서 수정 후 다시 제출하세요: https://gearpro.kr/reviewer/drafts/`,
    html: emailHtml(
      `<p>초안 "${draft.title}"가 반려되었습니다.</p>${note ? `<p>사유: ${note}</p>` : ''}<p><a href="https://gearpro.kr/reviewer/drafts/">포털에서 수정하기</a></p>`,
    ),
  });

  return json({ ok: true });
}

async function applications(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    action?: string;
    note?: string;
  };
  const id = body.id;
  const action = body.action;
  if (!id || (action !== 'approve' && action !== 'reject')) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const application = await env.METRICS_DB.prepare('SELECT * FROM applications WHERE id = ?')
    .bind(id)
    .first<ApplicationRow>();
  if (!application) return json({ ok: false, error: 'not_found' }, 404);
  if (application.status !== 'pending') return json({ ok: false, error: 'not_pending' }, 409);

  if (action === 'approve') {
    const user = await env.METRICS_DB.prepare('SELECT id FROM "user" WHERE email = ?')
      .bind(application.email)
      .first<{ id: string }>();
    if (!user) return json({ ok: false, error: 'user_not_found' }, 404);

    await env.METRICS_DB.prepare('UPDATE "user" SET role = ?, updatedAt = ? WHERE id = ?')
      .bind('editor', Date.now(), user.id)
      .run();
    await env.METRICS_DB.prepare(
      "UPDATE applications SET status = 'approved', updated_at = datetime('now') WHERE id = ?",
    )
      .bind(id)
      .run();
    await sendMail(env, {
      to: application.email,
      subject: '[GearPro] 에디터로 승인되었습니다',
      text: `${application.name}님, 에디터로 승인되었습니다. 포털에서 초안 작성을 시작하세요: https://gearpro.kr/reviewer/drafts/`,
      html: emailHtml(
        `<p><strong>${application.name}</strong>님, 에디터로 승인되었습니다 🎉</p><p>포털에서 초안 작성과 정산 확인이 활성화되었습니다.</p><p><a href="https://gearpro.kr/reviewer/drafts/">초안 작성 시작하기</a></p>`,
      ),
    });
    return json({ ok: true, action: 'approved' });
  }

  await env.METRICS_DB.prepare(
    "UPDATE applications SET status = 'rejected', note = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind((body.note ?? '').slice(0, 500), id)
    .run();
  await sendMail(env, {
    to: application.email,
    subject: '[GearPro] 에디터 신청 결과 안내',
    text: `${application.name}님, 아쉽지만 이번 에디터 신청은 승인되지 않았습니다.${body.note ? `\n사유: ${body.note}` : ''}\n다시 신청하실 수 있습니다.`,
    html: emailHtml(
      `<p><strong>${application.name}</strong>님, 아쉽지만 이번 에디터 신청은 승인되지 않았습니다.</p>${body.note ? `<p>사유: ${body.note}</p>` : ''}<p>추후 다시 신청하실 수 있습니다.</p>`,
    ),
  });
  return json({ ok: true, action: 'rejected' });
}

async function users(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    role?: string;
    membership?: string;
  };
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email) return json({ ok: false, error: 'email_required' }, 400);
  if (body.role && !['user', 'editor', 'moderator', 'admin'].includes(body.role)) {
    return json({ ok: false, error: 'bad_role' }, 400);
  }
  if (body.membership && !['free', 'paid'].includes(body.membership)) {
    return json({ ok: false, error: 'bad_membership' }, 400);
  }
  if (!body.role && !body.membership) {
    return json({ ok: false, error: 'nothing_to_update' }, 400);
  }

  const found = await env.METRICS_DB.prepare(
    'SELECT id, role, membership FROM "user" WHERE email = ?',
  )
    .bind(email)
    .first<{ id: string; role: string; membership: string }>();
  if (!found) return json({ ok: false, error: 'user_not_found' }, 404);

  await env.METRICS_DB.prepare(
    'UPDATE "user" SET role = ?, membership = ?, updatedAt = ? WHERE id = ?',
  )
    .bind(body.role ?? found.role, body.membership ?? found.membership, Date.now(), found.id)
    .run();

  if (body.membership && body.membership !== found.membership) {
    await env.METRICS_DB.prepare('INSERT INTO memberships (user_id, tier) VALUES (?, ?)')
      .bind(found.id, body.membership)
      .run();
  }

  return json({
    ok: true,
    email,
    role: body.role ?? found.role,
    membership: body.membership ?? found.membership,
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/media') {
      const admin = await requireAdmin(request, env);
      if (!admin) return json({ ok: false, error: 'access_denied' }, 401);
      return media(url, env);
    }

    if (request.method === 'GET' && url.pathname === '/healthz') {
      return json({ ok: true });
    }

    const admin = await requireAdmin(request, env);
    if (!admin) {
      if (request.method === 'GET' && url.pathname === '/') return setupPage();
      return json({ ok: false, error: 'access_denied' }, 401);
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      const db = env.METRICS_DB;
      let applications: ApplicationRow[] = [];
      let pending: DraftRow[] = [];
      let resolved: DraftRow[] = [];
      let users: UserRow[] = [];
      try {
        applications =
          (
            await db
              .prepare(
                "SELECT id, email, name, status, created_at FROM applications WHERE status = 'pending' ORDER BY created_at ASC",
              )
              .all<ApplicationRow>()
          ).results ?? [];
        pending =
          (
            await db
              .prepare("SELECT * FROM drafts WHERE status = 'pending' ORDER BY updated_at ASC")
              .all<DraftRow>()
          ).results ?? [];
        resolved =
          (
            await db
              .prepare(
                "SELECT * FROM drafts WHERE status != 'pending' ORDER BY updated_at DESC LIMIT 20",
              )
              .all<DraftRow>()
          ).results ?? [];
        users =
          (
            await db
              .prepare(
                'SELECT id, email, name, role, membership, createdAt FROM "user" ORDER BY createdAt DESC LIMIT 50',
              )
              .all<UserRow>()
          ).results ?? [];
      } catch (e) {
        return new Response(
          `<!doctype html><html lang="ko"><meta charset="utf-8"><title>GearPro 관리자</title><body style="font-family:system-ui;max-width:560px;margin:80px auto;padding:0 20px;line-height:1.7"><h1>데이터베이스 오류</h1><p>D1이 일시적으로 사용할 수 없습니다. 잠시 후 새로고침하세요.</p><pre>${esc(String((e as Error).message ?? e))}</pre></body></html>`,
          { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }
      return dashboard(env, admin, applications, pending, resolved, users);
    }

    if (request.method === 'POST' && url.pathname === '/api/publish') {
      return publishDraft(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/reject') {
      return rejectDraft(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/applications') {
      return applications(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/api/users') {
      return users(request, env);
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
