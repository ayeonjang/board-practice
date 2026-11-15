/**
 * 웹서비스설계 게시판 실습 - 검색·정렬·페이지네이션 API
 * 실행: npm install express && node server.js
 */
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;
app.use(express.static(__dirname));
app.use(express.json());

const TOPICS = [
  'B-Tree 인덱스 구조와 LIKE %kw% 검색 튜닝 실무',
  '커서 기반(Keyset) 페이지네이션 O(log N) 탐색 원리',
  'ORDER BY SQL Injection과 화이트리스트 매핑 방어',
  'InnoDB 버퍼 풀과 LIMIT OFFSET Cache Thrashing',
  'AbortController를 이용한 비동기 Race Condition 방어',
  '300ms 디바운스(Debounce)와 프론트엔드 입력 최적화',
  'URLSearchParams와 history.pushState 뒤로가기 동기화',
  'InnoDB MVCC 메커니즘과 COUNT(*) 전수 스캔 병목',
  '복합 인덱스(Compound Index) 컬럼 순서의 황금률',
  'Redis 분산 캐시를 활용한 카운트 캐싱 아키텍처',
  'RESTful JSON 페이징 Envelope 규격 표준화',
  'ElasticSearch 역색인(Inverted Index)과 N-gram 전문 검색'
];
const AUTHORS = ['이경수', '김철수', '이영희', '박민수', '정다은', '최준호', '강서연', '윤성호'];
const POSTS = Array.from({ length: 1000 }, (_, i) => {
  const id = 1000 - i;
  return {
    id,
    title: `[#${id}] ${TOPICS[i % TOPICS.length]}`,
    content: `게시글 ${id}번의 상세 본문 데이터입니다. DB 인덱스와 페이징 최적화를 실습합니다.`,
    author: AUTHORS[i % AUTHORS.length],
    views: Math.floor(Math.random() * 5000) + 10,
    createdAt: `2026-${String(10 - Math.floor(i / 150)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
  };
});

// 허용된 키만 조회할 수 있도록 null-prototype 객체 + own-property 검사 적용
const SORT_WHITELIST = Object.freeze(Object.assign(Object.create(null), {
  latest: (a, b) => b.createdAt.localeCompare(a.createdAt) || (b.id - a.id),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id - b.id),
  views: (a, b) => (b.views - a.views) || (b.id - a.id)
}));
function parseBoundedInt(value, fallback, min, max) {
  if (value === undefined || !/^\d+$/.test(String(value))) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}
function normalizeSearch(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}
function matchesSearch(post, search) {
  return !search || post.title.toLocaleLowerCase().includes(search) || post.content.toLocaleLowerCase().includes(search);
}
function elapsedMs(start) {
  const diff = process.hrtime(start);
  return Number((diff[0] * 1000 + diff[1] / 1e6).toFixed(2));
}

// 오프셋 방식: GET /api/posts?page=1&limit=10&sort=latest&search=키워드
app.get('/api/posts', (req, res) => {
  const start = process.hrtime();
  const page = parseBoundedInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const limit = parseBoundedInt(req.query.limit, 10, 1, 100);
  const search = normalizeSearch(req.query.search);
  const requestedSort = typeof req.query.sort === 'string' ? req.query.sort : 'latest';
  const sortKey = Object.hasOwn(SORT_WHITELIST, requestedSort) ? requestedSort : 'latest';

  const filtered = POSTS.filter(post => matchesSearch(post, search));
  filtered.sort(SORT_WHITELIST[sortKey]);
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const items = filtered.slice(offset, offset + limit);
  const executionTimeMs = elapsedMs(start);
  res.setHeader('X-Response-Time', `${executionTimeMs}ms`);
  res.json({ items, meta: { page: safePage, limit, totalCount, totalPages,
    offset, sort: sortKey, search, hasNext: safePage < totalPages,
    hasPrev: safePage > 1, executionTimeMs } });
});

// 커서 방식은 id DESC 고정. 검색 필터와 cursor 필터를 함께 적용한 뒤 limit+1개 조회.
// GET /api/posts/cursor?cursor=950&limit=10&search=키워드
app.get('/api/posts/cursor', (req, res) => {
  const start = process.hrtime();
  const rawCursor = req.query.cursor;
  const cursor = rawCursor !== undefined && /^\d+$/.test(String(rawCursor)) && Number(rawCursor) > 0
    ? Number(rawCursor) : null;
  const limit = parseBoundedInt(req.query.limit, 10, 1, 50);
  const search = normalizeSearch(req.query.search);

  const candidates = POSTS.filter(post =>
    (!cursor || post.id < cursor) && matchesSearch(post, search)
  ).sort((a, b) => b.id - a.id);
  const fetched = candidates.slice(0, limit + 1);
  const hasNext = fetched.length > limit;
  const items = fetched.slice(0, limit);
  const nextCursor = hasNext && items.length ? items[items.length - 1].id : null;
  const executionTimeMs = elapsedMs(start);
  res.setHeader('X-Response-Time', `${executionTimeMs}ms`);
  res.json({ items, meta: { cursor, nextCursor, limit, search, sort: 'id_desc', hasNext, executionTimeMs } });
});

app.listen(PORT, () => console.log(`게시판 서버 실행: http://localhost:${PORT} (게시글 ${POSTS.length}건)`));
