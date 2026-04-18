# Festival Manager

학교 행사(체육대회 등)의 개인·반별 점수를 모바일 웹으로 실시간 관리하는 서비스. 전체 요구사항은 [PRD.md](PRD.md) 참조.

## Stack

- Next.js 16 (App Router, TypeScript) + React 19
- Tailwind CSS v4
- Supabase Postgres (via `postgres` npm 패키지 + Transaction 풀러, 포트 6543)
- Vercel (배포, `icn1` 서울 리전)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, SESSION_SECRET
npm run dev                  # http://localhost:3000
```

DB 스키마는 [db/schema.sql](db/schema.sql)에 있으며, Supabase 대시보드의 SQL Editor에 붙여 넣어 1회 실행해 초기화합니다.

## Scripts

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드 산출물 실행 |
| `npm run lint` | ESLint |

## Deploy to Vercel

1. Supabase 프로젝트 생성 → SQL Editor에서 [db/schema.sql](db/schema.sql) 실행.
2. Project Settings → Database → Connection string → **Transaction (포트 6543)** URL 복사.
3. Vercel에서 새 프로젝트 → 이 repo 연결.
4. Project Settings → Environment Variables에 `DATABASE_URL`(위 URL), `SESSION_SECRET` 추가.
