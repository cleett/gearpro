export const SITE_NAME = 'GearPro';
export const SITE_TAGLINE = '직접 사서, 오래 쓰고, 솔직하게 말하는 기어 리뷰 매거진';
export const SITE_DESCRIPTION =
  '기어프로(GearPro)는 독립 디지털 매거진입니다. 직접 구매한 제품을 몇 달씩 사용한 뒤, 오디오·카메라·자전거·주방·EDC·홈오피스 기어의 솔직한 장기 리뷰를 전합니다.';

export function formatDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatPrice(price: number): string {
  return `₩${price.toLocaleString('ko-KR')}`;
}
