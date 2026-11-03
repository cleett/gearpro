# GearPro

한국 시장을 위한 독립 기어 리뷰 디지털 매거진. MD/MDX 기반의 오픈소스 CMS(Keystatic)와 Astro로 만들었고, Cloudflare Workers에 배포하도록 구성되어 있습니다.

## 스택

| 레이어 | 도구 |
| --- | --- |
| 프레임워크 | [Astro](https://astro.build) 7 — 콘텐츠 컬렉션, MDX, 이미지 최적화 |
| CMS | [Keystatic](https://keystatic.com) — git 기반, MD/MDX로 저장되는 오픈소스 CMS |
| 스타일 | Tailwind CSS 4 + Typography 플러그인 |
| 폰트 | Pretendard(본문) · Fraunces + Noto Serif KR(디스플레이) |
| 배포 | Cloudflare Workers (`@astrojs/cloudflare`) |

## 빠른 시작

```bash
npm install
npm run dev        # http://127.0.0.1:4321
```

- 사이트: `http://127.0.0.1:4321`
- CMS (로컬 모드): `http://127.0.0.1:4321/keystatic`

개발 시 Keystatic은 **로컬 모드**로 동작합니다. Admin UI에서 작성·수정한 내용이 곧장 `src/content/` 아래의 YAML/MDX 파일로 기록됩니다. 물론 에디터에서 MDX를 직접 고쳐도 됩니다.

## 콘텐츠 구조

```
src/
├── content/
│   ├── reviews/          # 리뷰 (MDX, 파일명 = URL 슬러그)
│   ├── categories/       # 카테고리 (YAML, parent 필드로 하위 카테고리 구성)
│   └── authors/          # 에디터 (YAML)
├── assets/
│   ├── covers/           # 리뷰 표지 이미지
│   └── avatars/          # 에디터 프로필 사진
```

리뷰 스키마: 제품명, 요약, 표지, 카테고리(관계 선택), 브랜드, 가격(원), 평점(0–10), 장·단점, 제원, 작성자, 발행일, 홈 추천 여부, 본문(MDX).

### 카테고리와 하위 카테고리

카테고리는 CMS에서 직접 관리합니다. `/keystatic` → **카테고리**에서 추가하면 리뷰 폼 드롭다운, 필터, 카테고리 페이지(`/categories/{slug}/`)에 자동 반영됩니다. 하위 카테고리를 만들려면 새 카테고리의 **상위 카테고리** 필드에서 부모를 선택하세요 (예: 오디오 > 헤드폰). 하위 카테고리 리뷰는 부모 카테고리 페이지와 필터에 함께 포함됩니다.

### 랭킹

`/rankings/`는 리뷰 평점 기준으로 자동 집계됩니다 (같은 점수면 최신 리뷰 우선). 별도 관리가 필요 없습니다. 스폰서 리뷰는 랭킹에서 제외됩니다.

## 외부 리뷰어와 보상 (메트릭)

조회수와 좋아요가 D1 데이터베이스(`gearpro-metrics`)에 기록되며, 작성자별 월간 리포트를 뽑아 정산에 사용할 수 있습니다.

- **조회수**: 리뷰 페이지 방문 시 beacon으로 기록, IP+일 단위 중복 제거(고유 방문자 기준)
- **좋아요**: 브라우저당 1표(토글), IP당 일 40표 제한
- **리포트** (월간 CSV):
  ```bash
  curl -H "x-metrics-secret: <METRICS_SECRET>" \
    "https://gearpro.kr/api/metrics/report?month=2026-09"
  ```
- `METRICS_SECRET`은 `wrangler secret put METRICS_SECRET`으로 등록하고, 로컬에서는 `.dev.vars`에 넣습니다.
- 리뷰→작성자 매핑은 `npm run deploy` 시 자동 동기화됩니다 (수동: `npm run sync:metrics`).
- 일반 `npm run dev`(Node 런타임)에서는 바인딩이 없어 메트릭이 `disabled`로 동작합니다. 실제 동작 확인은 `CF_WORKERD_DEV=1 npm run dev` 또는 배포 환경에서 하세요.

정산 지급(계좌이체 등)은 리포트 CSV를 기준으로 수동 처리하는 것을 권장합니다. 개인정보(계좌, 연락처)는 이 저장소에 두지 마세요.

## 리뷰어 포털 (`/reviewer/`)

외부 리뷰어가 소셜 계정(구글·애플·카카오·네이버)으로 로그인해 자신의 조회수·좋아요·예상 정산을 보고 정산을 요청하는 페이지입니다. 인증은 Better Auth 기반이며 `auth.gearpro.kr`에서 동작합니다.

### 사용자 유형과 권한

| 역할 | 권한 |
| --- | --- |
| 회원 (무료/유료) | 소셜 로그인. 유료 여부는 `membership` 필드로 관리 (결제 연동 전까지는 관리자가 수동 지정) |
| 에디터 | 리뷰어 대시보드(내 리뷰 통계·정산 요청), 리뷰어 프로필 자가 등록 |
| 모더레이터 | 월간 지표 리포트 접근 |
| 관리자 | 전부 + 권한/멤버십 관리 |

역할 확장은 `src/lib/roles.ts`에서: `ac`에 리소스·액션을 정의하고 `roles`에 새 역할을 추가하면 됩니다.

### 첫 관리자 지정

`wrangler.jsonc`의 `ADMIN_EMAILS`에 이메일을 넣고 재배포하면, 해당 이메일로 첫 로그인 시 자동으로 관리자 승격됩니다.

### 권한/멤버십 관리 (관리자 콘솔)

관리 기능은 별도 Worker(`admin/`)로 분리되어 `admin.gearpro.kr`에서 제공되며, **Cloudflare Access**(Zero Trust)로 보호됩니다. Better Auth 세션과 무관하게 Access 이메일 인증만으로 접근합니다.

- **에디터 신청 승인/거절** — 승인 시 `role: editor` 지정 + 신청자에게 이메일 발송
- **초안 검토 큐** — 승인·게시(GitHub 커밋 → CI 배포, 작성자에게 게시 알림 메일) / 반려(사유 전달)
- **사용자 관리** — 역할(user/editor/moderator/admin)·멤버십(free/paid) 변경

설정:

1. Zero Trust 대시보드 → Access → Applications → **Add an application → Self-hosted**
2. 도메인 `admin.gearpro.kr`, 세션 24h, 정책: Allow / Include / Emails → 관리자 이메일
3. 생성된 앱의 `aud` 값을 `admin/wrangler.jsonc`의 `ACCESS_AUD`로, 팀 도메인(`xxx.cloudflareaccess.com`의 `xxx`)을 `ACCESS_TEAM`으로 설정 후 `admin/`에서 재배포
4. `ACCESS_AUD`가 설정되지 않으면 콘솔은 모든 요청을 거부(503)합니다 — JWT 서명(Access certs, RS256)과 `ADMIN_EMAILS` 허용 목록을 이중 검증합니다.
5. GitHub 게시를 위해 시크릿 등록: `cd admin && npx wrangler secret put GITHUB_TOKEN`

로컬 개발 시 `--var DEV_MODE:1` + `x-dev-email` 헤더로 Access 없이 테스트할 수 있습니다(DEV_MODE는 ACCESS_AUD가 없을 때만 유효).

### 소셜 로그인 설정 (공급자별 OAuth 앱)

| 공급자 | 콘솔 | 콜백/리디렉션 URI |
| --- | --- | --- |
| Google | console.cloud.google.com → 사용자 인증 정보 | `https://auth.gearpro.kr/api/auth/callback/google` |
| Apple | developer.apple.com (Sign in with Apple, Services ID) | `https://auth.gearpro.kr/api/auth/callback/apple` + 도메인 연결 파일 |
| Kakao | developers.kakao.com → 앱 → 카카오 로그인 | `https://auth.gearpro.kr/api/auth/callback/kakao` (account_email 필수 동의 설정) |
| Naver | developers.naver.com → 앱 → 네이버 로그인 | `https://auth.gearpro.kr/api/auth/callback/naver` |

각 클라이언트 ID/시크릿은 시크릿으로 등록:

```bash
npx wrangler secret put BETTER_AUTH_SECRET   # openssl rand -hex 32
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put KAKAO_CLIENT_ID
npx wrangler secret put KAKAO_CLIENT_SECRET
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET
npx wrangler secret put APPLE_CLIENT_ID
npx wrangler secret put APPLE_CLIENT_SECRET
```

Apple의 `APPLE_CLIENT_SECRET`은 Apple 키(.p8)로 서명한 ES256 JWT(최대 180일 유효)이므로 주기적 갱신이 필요합니다.

### 리뷰어 자가 등록 흐름

1. 리뷰어가 `/reviewer/`에서 소셜 로그인 → **에디터 신청** (신청 즉시 관리자에게 이메일 알림)
2. 관리자가 `admin.gearpro.kr` 콘솔에서 승인 → `role: editor` + 승인 이메일 발송
3. 리뷰어가 포털의 **리뷰어 프로필 등록** 폼 제출 → GitHub API로 작성자 파일 생성 + 포털 즉시 활성화
4. GitHub Actions(`.github/workflows/deploy.yml`)가 main 푸시를 자동 배포하므로 작성자 페이지가 사이트에 반영됩니다. 저장소 시크릿에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를, 리뷰어 자가 등록용으로는 `GITHUB_TOKEN`(repo contents write)을 Worker 시크릿으로 등록하세요:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```

### 리뷰 초안 → 게시 파이프라인 (하이브리드 아키텍처)

- **D1**: 초안(작업 중 콘텐츠) 저장 — 에디터가 `/reviewer/drafts/`에서 MDX 초안 작성·수정, 표지 이미지는 R2(`gearpro-media` 버킷)에 업로드
- **관리자 콘솔** (`admin.gearpro.kr`, Cloudflare Access 보호): 접수된 초안 검토 → **승인 · Keystatic에 게시** 버튼 한 번으로 GitHub 커밋 2건(표지 이미지 + `src/content/reviews/{slug}.mdx`) → CI 자동 배포 → Keystatic/사이트에 일반 리뷰로 등록, 작성자에게 게시 알림 메일 발송
- **게시된 콘텐츠는 git이 원본**입니다. D1은 게시 전 상태와 포인터만 가집니다. 반려 시 사유가 작성자에게 전달됩니다.
- 초안 표지는 게시 시 `src/assets/covers/{slug}/cover.{ext}`로 커밋되어 astro:assets 최적화를 그대로 받습니다.

### 이메일 로그인·비밀번호 재설정 (Cloudflare Email Service)

- 이메일+비밀번호 로그인/회원가입은 포털 로그인 화면에 기본 포함되어 있습니다.
- 비밀번호 찾기는 Cloudflare `send_email` 바인딩(`EMAIL_SENDER`)으로 발송됩니다. 발신 도메인(`gearpro.kr`)이 Cloudflare Email Service에 등록되어 있어야 하며, 최초 1회 대시보드에서 발신 주소(`noreply@gearpro.kr`)를 확인하세요. 배포 시 바인딩이 자동 프로비저닝됩니다.
- 재설정 링크는 1시간 후 만료되며, `/reset-password/?token=...` 페이지에서 새 비밀번호를 설정합니다.

### 정산 요청 처리 (관리자)

```bash
# 요청 목록 (CSV)
curl -H "x-metrics-secret: <METRICS_SECRET>" "https://gearpro.kr/api/metrics/report?type=payouts"

# 상태 변경 (paid / rejected / requested)
curl -X POST -H "x-metrics-secret: <METRICS_SECRET>" -H "content-type: application/json" \
  -d '{"id":1,"status":"paid"}' https://gearpro.kr/api/metrics/report
```

요율(조회수/좋아요 단가, 월 상한)은 D1 `settings` 테이블에서 관리합니다:
```bash
npx wrangler d1 execute gearpro-metrics --remote --command "UPDATE settings SET value = '30' WHERE key = 'rate_view'"
```

작성자의 포털 접속 이메일은 Keystatic **에디터** 항목의 이메일 필드로 관리하며, 배포 시 D1에 자동 동기화됩니다.

Keystatic 스키마는 `keystatic.config.ts`, Astro 검증 스키마는 `src/content.config.ts`, 카테고리 로직은 `src/lib/taxonomy.ts`에서 관리합니다.

## 분석 (Google Analytics)

`Base.astro`가 모든 페이지에 Google 태그를 삽입합니다. ID는 **빌드 시점**에 주입되므로 `.env`(또는 CI 환경 변수)에 설정한 뒤 다시 빌드해야 합니다.

```bash
# GA4 측정 ID (G-...) 또는 Google tag ID (GT-...)
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# 선택: Tag Manager를 쓸 경우 (GTM-...)
# 설정하면 GA4를 직접 삽입하지 않고 GTM 컨테이너만 로드합니다.
PUBLIC_GTM_ID=GTM-XXXXXXX
```

- 값이 비어 있으면 스크립트를 전혀 출력하지 않습니다.
- GTM을 사용하는 경우 GA4 태그는 GTM 안에서 관리하세요. 둘 다 넣으면 페이지뷰가 중복 집계됩니다.
- 광고·리마케팅 태그를 추가할 때는 `privacy.mdx`의 쿠키 및 국외 이전 항목도 함께 갱신하세요.

## Cloudflare Workers 배포

### 1. 저장소·사이트 URL 설정

`wrangler.jsonc`의 `vars`에서 `KEYSTATIC_GITHUB_REPO`(owner/repo)와 `SITE_URL`을 실제 값으로 바꿉니다.

### 2. 시크릿 등록

프로덕션 CMS(GitHub 모드)에 필요한 세 가지 시크릿을 등록합니다.

```bash
npx wrangler secret put KEYSTATIC_GITHUB_CLIENT_ID
npx wrangler secret put KEYSTATIC_GITHUB_CLIENT_SECRET
npx wrangler secret put KEYSTATIC_SECRET
```

값은 `/keystatic` 첫 실행 → "Create GitHub App" 마법사가 `.env`에 생성해 줍니다(로컬에서 GitHub 모드를 쓸 때도 동일). `.env.example` 참고.

### 3. 배포

```bash
npm run deploy     # astro build && wrangler deploy
```

배포되면 사이트는 전부 정적(프리렌더)으로 서빙되고, `/keystatic` 관리 화면만 워커에서 GitHub 모드로 동작합니다. 에디터가 CMS에서 저장하면 GitHub 커밋 → 재배포 파이프라인으로 이어집니다.

### 개발 모드와 워커 런타임

- `npm run dev` — Node 런타임. Keystatic **로컬 모드** 편집이 가능한 콘텐츠 작업용 모드입니다.
- `CF_WORKERD_DEV=1 npm run dev` — Cloudflare workerd 런타임으로 개발(프로덕션 패리티 확인용). 이 모드에서는 로컬 CMS 편집이 불가능합니다.
- `npm run preview` — 빌드 결과를 workerd로 로컬 프리뷰.

## 주요 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (로컬 CMS 사용 가능) |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 로컬 프리뷰 (workerd) |
| `npm run deploy` | 빌드 후 Cloudflare Workers 배포 |

## 페이지

- `/` — 히어로, 추천 리뷰, 최신 리뷰, 카테고리
- `/reviews/` — 전체 리뷰 + 클라이언트 필터 (`?category=` 지원)
- `/reviews/[slug]/` — 리뷰 상세 (평점, 장·단점, 본문, 제원, 관련 리뷰)
- `/about/` — 리뷰 원칙과 에디터 소개
- `/rss.xml`, `sitemap-index.xml` — 피드·사이트맵
- `/keystatic` — CMS 관리 화면
