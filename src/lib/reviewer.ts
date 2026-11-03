export interface RateCard {
  view: number;
  like: number;
  cap: number;
}

export async function getRateCard(db: D1Database): Promise<RateCard> {
  const { results } = await db
    .prepare('SELECT key, value FROM settings')
    .all<{ key: string; value: string }>();
  const map = Object.fromEntries((results ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    view: map['rate_view'] ?? 0,
    like: map['rate_like'] ?? 0,
    cap: map['cap_monthly'] ?? 0,
  };
}

export function estimateAmount(
  views: number,
  likes: number,
  rates: RateCard,
): number {
  const raw = views * rates.view + likes * rates.like;
  return Math.min(Math.floor(raw), rates.cap);
}

export function formatKrw(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}
