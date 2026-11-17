#!/usr/bin/env python3
"""독립서점·책방 뉴스 수집 → data/news.json 저장 (홈 '새소식'에서 사용).
사용: python scripts/fetch_news.py
표준 라이브러리만 사용. Google 뉴스 RSS 검색 결과에서 최근 30일 기사 중
'뉴스' 최신 3개 + '행사' 최신 2개를 날짜순으로 골라 저장합니다.
수집에 실패하거나 결과가 비어 있으면 기존 data/news.json은 덮어쓰지 않습니다.
"""
import json, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'news.json'
KST = timezone(timedelta(hours=9))
RSS = 'https://news.google.com/rss/search?q={q}&hl=ko&gl=KR&ceid=KR:ko'
WINDOW = 'when:30d'          # 최근 30일 기사만
NEWS_COUNT, EVENT_COUNT = 3, 2

QUERIES = [
    '독립서점',
    '동네책방',
    '독립서점 북토크',
    '독립서점 행사',
    '(낭독회 OR 북콘서트 OR 북페어) (서점 OR 책방)',
]
RELATED = re.compile(r'서점|책방')   # 책방과 관련 없는 기사 제외
EVENT = re.compile(
    r'북\s?토크|북\s?콘서트|낭독회|북\s?페어|도서전|전시|워크숍|워크샵|클래스|강연|특강|'
    r'독서\s?모임|행사|축제|페스티벌|팝업|마켓|체험|개최|열린다|열려'
)


def fetch(query):
    url = RSS.format(q=urllib.parse.quote_plus(query + ' ' + WINDOW))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; bookbangteum-news/1.0)'})
    with urllib.request.urlopen(req, timeout=15) as res:
        return res.read()


def parse(xml_bytes):
    """RSS 한 개를 [{title, source, url, when}] 로 정리"""
    out = []
    for item in ET.fromstring(xml_bytes).iter('item'):
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        pub = item.findtext('pubDate')
        src = item.find('source')
        source = (src.text or '').strip() if src is not None and src.text else ''
        if not title or not pub or not link.startswith(('http://', 'https://')):
            continue
        try:
            when = parsedate_to_datetime(pub)
        except (TypeError, ValueError):
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        when = when.astimezone(KST)
        # Google 뉴스 제목은 '기사 제목 - 매체명' 형태 → 매체명 분리
        if source and title.endswith(' - ' + source):
            title = title[:-len(source) - 3].rstrip()
        elif not source and ' - ' in title:
            title, source = [p.strip() for p in title.rsplit(' - ', 1)]
        out.append({'title': title, 'source': source, 'url': link, 'when': when})
    return out


def pick(items):
    """중복 제거 → 뉴스/행사 분류 → 각각 최신순으로 3개 / 2개 → 날짜 내림차순으로 합치기"""
    seen, pool = set(), []
    now = datetime.now(KST) + timedelta(days=1)
    for it in sorted(items, key=lambda x: x['when'], reverse=True):
        key = re.sub(r'\W+', '', it['title']).lower()
        if key in seen or not RELATED.search(it['title']) or it['when'] > now:
            continue
        seen.add(key)
        it['type'] = 'event' if EVENT.search(it['title']) else 'news'
        pool.append(it)
    news = [i for i in pool if i['type'] == 'news'][:NEWS_COUNT]
    events = [i for i in pool if i['type'] == 'event'][:EVENT_COUNT]
    return sorted(news + events, key=lambda x: x['when'], reverse=True)


def main():
    collected, failed = [], 0
    for q in QUERIES:
        try:
            collected += parse(fetch(q))
        except Exception as e:  # 네트워크·XML 오류 하나로 전체를 멈추지 않음
            failed += 1
            print(f'[경고] "{q}" 수집 실패: {e}', file=sys.stderr)
    picked = pick(collected)
    if not picked:
        print('수집된 기사가 없어 data/news.json을 그대로 둡니다.', file=sys.stderr)
        return 1
    result = {
        'updatedAt': datetime.now(KST).isoformat(timespec='seconds'),
        'items': [
            {'type': i['type'], 'title': i['title'], 'source': i['source'],
             'date': i['when'].strftime('%Y-%m-%d'), 'url': i['url']}
            for i in picked
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(OUT)
    n = sum(1 for i in picked if i['type'] == 'news')
    print(f'저장 완료: 뉴스 {n}개 + 행사 {len(picked) - n}개 → {OUT.relative_to(ROOT)}')
    if failed:
        print(f'(검색어 {failed}개는 수집 실패)', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
