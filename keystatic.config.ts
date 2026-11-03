import { config, collection, fields } from '@keystatic/core';

const isProd = process.env.NODE_ENV === 'production';
const githubRepo = import.meta.env.KEYSTATIC_GITHUB_REPO ?? 'your-username/gearpro';

export default config({
  storage: isProd
    ? {
        kind: 'github',
        repo: githubRepo,
      }
    : {
        kind: 'local',
      },
  ui: {
    brand: {
      name: 'GearPro CMS',
    },
    navigation: {
      콘텐츠: ['reviews', 'categories', 'authors'],
    },
  },
  collections: {
    reviews: collection({
      label: '리뷰',
      slugField: 'title',
      path: 'src/content/reviews/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({
          name: { label: '제품명', validation: { isRequired: true } },
        }),
        excerpt: fields.text({
          label: '요약',
          multiline: true,
          validation: { isRequired: true, length: { max: 240 } },
        }),
        cover: fields.image({
          label: '표지 이미지',
          directory: 'src/assets/covers',
          publicPath: '@assets/covers/',
        }),
        category: fields.relationship({
          label: '카테고리',
          collection: 'categories',
          validation: { isRequired: true },
        }),
        funding: fields.select({
          label: '리뷰 성격',
          options: [
            { label: '내돈내산', value: 'self' },
            { label: '스폰서 (협찬)', value: 'sponsor' },
          ],
          defaultValue: 'self',
        }),
        sponsor: fields.text({
          label: '협찬사 (스폰서 리뷰일 때 입력)',
        }),
        brand: fields.text({ label: '브랜드', validation: { isRequired: true } }),
        price: fields.number({
          label: '가격 (원)',
          validation: { isRequired: true },
        }),
        rating: fields.number({
          label: '평점 (0-10)',
          validation: { isRequired: true, min: 0, max: 10 },
          step: 0.1,
        }),
        pros: fields.array(fields.text({ label: '항목' }), {
          label: '좋았던 점',
          itemLabel: (props) => `항목 ${props.value ?? ''}`,
        }),
        cons: fields.array(fields.text({ label: '항목' }), {
          label: '아쉬운 점',
          itemLabel: (props) => `항목 ${props.value ?? ''}`,
        }),
        specs: fields.array(
          fields.object({
            label: fields.text({ label: '항목', validation: { isRequired: true } }),
            value: fields.text({ label: '값', validation: { isRequired: true } }),
          }),
          {
            label: '주요 제원',
            itemLabel: (props) => props.fields?.label?.value ?? '항목',
          },
        ),
        author: fields.relationship({
          label: '작성자',
          collection: 'authors',
          validation: { isRequired: true },
        }),
        publishedAt: fields.date({
          label: '발행일',
          validation: { isRequired: true },
        }),
        featured: fields.checkbox({
          label: '홈 화면 추천 리뷰',
          defaultValue: false,
        }),
        content: fields.mdx({
          label: '리뷰 본문',
          options: {
            image: {
              directory: 'src/assets/covers',
              publicPath: '@assets/covers/',
            },
          },
        }),
      },
    }),
    categories: collection({
      label: '카테고리',
      slugField: 'name',
      path: 'src/content/categories/*',
      format: { data: 'yaml' },
      schema: {
        name: fields.slug({
          name: { label: '카테고리 이름', validation: { isRequired: true } },
        }),
        parent: fields.relationship({
          label: '상위 카테고리 (하위 카테고리를 만들 때 선택)',
          collection: 'categories',
        }),
        description: fields.text({
          label: '설명 (카테고리 페이지용)',
          multiline: true,
        }),
      },
    }),
    authors: collection({
      label: '에디터',
      slugField: 'name',
      path: 'src/content/authors/*',
      format: { data: 'yaml' },
      schema: {
        name: fields.slug({
          name: { label: '이름', validation: { isRequired: true } },
        }),
        role: fields.text({ label: '역할', validation: { isRequired: true } }),
        bio: fields.text({ label: '짧은 소개', multiline: true, validation: { isRequired: true } }),
        avatar: fields.image({
          label: '프로필 사진',
          directory: 'src/assets/avatars',
          publicPath: '@assets/avatars/',
        }),
        url: fields.url({ label: '웹사이트 또는 프로필 URL' }),
        email: fields.text({
          label: '이메일 (리뷰어 포털 로그인용)',
        }),
      },
    }),
  },
});
