const readPublicEnv = (value: string | undefined) => (value ?? '').trim();

// GA4는 `G-`, Google tag는 `GT-`, Tag Manager는 `GTM-`로 시작합니다.
const normalizeId = (value: string | undefined) => {
  const id = readPublicEnv(value).toUpperCase();
  return /^(G|GT|GTM)-[A-Z0-9]+$/.test(id) ? id : '';
};

const gaMeasurementId = normalizeId(import.meta.env.PUBLIC_GA_MEASUREMENT_ID);

/**
 * Tag Manager 컨테이너가 설정되면 GA4를 직접 삽입하지 않습니다.
 * (GTM 안에 GA4 태그가 있는 경우 중복 집계를 막기 위함)
 */
export const GTM_ID = normalizeId(import.meta.env.PUBLIC_GTM_ID);
export const GOOGLE_TAG_ID = GTM_ID ? '' : gaMeasurementId;
export const ANALYTICS_ENABLED = Boolean(GTM_ID || GOOGLE_TAG_ID);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: string, ...args: unknown[]) => void;
  }
}
