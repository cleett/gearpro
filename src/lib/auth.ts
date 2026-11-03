import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';

import * as authSchema from '../db/auth-schema';
import { sendMail } from './email';
import { ac, roles } from './roles';

export interface AuthEnv {
  [key: string]: unknown;
}

export async function getCfEnv(): Promise<AuthEnv> {
  try {
    const mod = (await import('cloudflare:workers')) as unknown as {
      env: AuthEnv;
    };
    return mod.env ?? {};
  } catch {
    return {};
  }
}

export function createAuth(env: AuthEnv) {
  const db = drizzle(env['METRICS_DB'] as D1Database, { schema: authSchema });
  const baseURL = (env['BETTER_AUTH_URL'] as string) ?? 'https://auth.gearpro.kr';
  const siteUrl = (env['SITE_URL'] as string) ?? 'https://gearpro.kr';

  const socialProviders: Record<string, unknown> = {};
  if (env['GOOGLE_CLIENT_ID'] && env['GOOGLE_CLIENT_SECRET']) {
    socialProviders['google'] = {
      clientId: env['GOOGLE_CLIENT_ID'],
      clientSecret: env['GOOGLE_CLIENT_SECRET'],
    };
  }
  if (env['APPLE_CLIENT_ID'] && env['APPLE_CLIENT_SECRET']) {
    socialProviders['apple'] = {
      clientId: env['APPLE_CLIENT_ID'],
      clientSecret: env['APPLE_CLIENT_SECRET'],
    };
  }
  if (env['KAKAO_CLIENT_ID'] && env['KAKAO_CLIENT_SECRET']) {
    socialProviders['kakao'] = {
      clientId: env['KAKAO_CLIENT_ID'],
      clientSecret: env['KAKAO_CLIENT_SECRET'],
    };
  }
  if (env['NAVER_CLIENT_ID'] && env['NAVER_CLIENT_SECRET']) {
    socialProviders['naver'] = {
      clientId: env['NAVER_CLIENT_ID'],
      clientSecret: env['NAVER_CLIENT_SECRET'],
    };
  }

  return betterAuth({
    baseURL,
    secret: env['BETTER_AUTH_SECRET'] as string,
    database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
    trustedOrigins: [siteUrl, 'http://127.0.0.1:4321'],
    account: {
		  accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
		  },
	  },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, token }) => {
        const link = `${siteUrl}/reset-password/?token=${token}`;
        await sendMail(env, {
          to: user.email,
          subject: '[GearPro] 비밀번호 재설정 안내',
          text: `${user.name}님, 아래 링크에서 비밀번호를 재설정하세요:\n${link}\n링크는 1시간 후 만료됩니다. 요청하지 않으셨다면 이 메일은 무시하세요.`,
          html: `<p>${user.name}님, 비밀번호 재설정 요청이 접수되었습니다.</p><p><a href="${link}">비밀번호 재설정하기</a></p><p>링크는 1시간 후 만료됩니다. 요청하지 않으셨다면 이 메일은 무시하세요.</p>`,
        });
      },
    },
    advanced:
      baseURL.startsWith('https://')
        ? { defaultCookieAttributes: { domain: '.gearpro.kr' } }
        : {},
    user: {
      additionalFields: {
        membership: {
          type: 'string',
          defaultValue: 'free',
          input: false,
        },
      },
    },
    socialProviders,
    plugins: [
      admin({
        ac,
        roles,
        adminRoles: ['admin'],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
