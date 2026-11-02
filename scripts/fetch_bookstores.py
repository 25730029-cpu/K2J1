#!/usr/bin/env python3
"""문화공공데이터광장 독립서점 API 수집 → JSON 저장.
사용: KCISA_SERVICE_KEY=... python scripts/fetch_bookstores.py
표준 라이브러리만 사용. 수집 성공 전 기존 JSON은 절대 덮어쓰지 않습니다.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
ENDPOINT = 'https://api.kcisa.kr/openapi/API_CIA_089/request'
KEY = os.environ.get('KCISA_SERVICE_KEY', '').strip()


def clean(value):
    if value is None: return None
    value = str(value).strip()
    return value if value else None


def normalize_address(text):
    return re.sub(r'\s+', '', re.sub(r'^\(\d{5}\)\s*', '', text or '')).lower()


def identity(title, address):
    return ((title or '').replace(' ', '').lower(), normalize_address(address))


def parse_hours(text):
    text = clean(text) or ''
    hours = {}
    for key, label in [('weekday','평일'), ('saturday','토요일'), ('sunday','일요일')]:
        m = re.search(label + r'개점마감시간\s*:\s*(\d{1,2}:\d{2}\s*[~～-]\s*\d{1,2}:\d{2})', text)
        hours[key] = m.group(1).replace(' ', '') if m else None
    closed = re.search(r'휴무일\s*:\s*(.*)', text)
    closed = clean(closed.group(1).rstrip(' ,:')) if closed else None
    summary = next((v for v in hours.values() if v), None)
    formatted = [label+' '+hours[key] for key,label in [('weekday','평일'),('saturday','토'),('sunday','일')] if hours[key]]
    if closed: formatted.append('휴무 '+closed)
    return hours, summary, ' · '.join(formatted) or None, closed


def coords(text):
    try:
        lat, lng = [float(x.strip()) for x in text.split(',')]
        if -90 <= lat <= 90 and -180 <= lng <= 180: return [lat,lng]
    except (ValueError, AttributeError): pass
    return None


def convert(item, id_map, idx):
    title = clean(item.get('TITLE'))
    addr = clean(item.get('ADDRESS'))
    if not title or not addr: return None
    address = re.sub(r'^\(\d{5}\)\s*', '', addr)
    zip_code = re.search(r'^\((\d{5})\)', addr)
    hours, summary, opening, closed = parse_hours(item.get('DESCRIPTION'))
    description = clean(item.get('SUB_DESCRIPTION'))
    keyword = clean(item.get('SUBJECT_KEYWORD'))
    category = [v.strip() for v in keyword.split(',') if v.strip()] if keyword else []
    old = id_map.get(identity(title, address), {})
    # 기존 책방 ID 유지: 즐겨찾기·방문 기록·저장 코스가 끊기지 않도록
    result = dict(old)
    result.update({
        'id': old.get('id') or 'api_'+str(item.get('CNTC_RESRCE_NO') or idx).zfill(4),
        'title': title, 'address': address,
        'zipCode': zip_code.group(1) if zip_code else None,
        'openingHours': opening, 'openingSummary': summary, 'hours': hours,
        'closedDays': closed, 'phone': clean(item.get('CONTACT_POINT')),
        'coordinates': coords(item.get('COORDINATES')),
        'description': description, 'issuedDate': clean(item.get('ISSUED_DATE')),
        'categories': old.get('categories', category),
        'themes': old.get('themes', []), 'reviewTags': old.get('reviewTags', []),
        'facilities': old.get('facilities', []), 'reviews': old.get('reviews', []),
        'sido': old.get('sido') or (address.split(' ')[0] if address else None),
        'district': old.get('district') or ' '.join(address.split(' ')[:2]),
        'sourceId': old.get('sourceId') or clean(item.get('CNTC_RESRCE_NO')),
        'sourceType': 'API', 'sourceProvider': '문화공공데이터광장',
        'sourceVerified': True,
        'apiRecordId': clean(item.get('CNTC_RESRCE_NO')),
        'apiRawDescription': clean(item.get('DESCRIPTION')),
        'apiSubjectKeyword': keyword,
    })
    return result


def fetch_page(page, rows=100):
    query = urllib.parse.urlencode({'serviceKey': KEY, 'numOfRows': str(rows), 'pageNo': str(page)})
    req = urllib.request.Request(ENDPOINT + '?' + query, headers={'Accept':'application/json','User-Agent':'BookbangteumDataCollector/1.0'})
    with urllib.request.urlopen(req, timeout=25) as response:
        result = json.load(response)
    r = result.get('response', result)
    head = r.get('header', {})
    if head.get('resultCode') != '0000':
        raise ValueError('API 응답 오류: '+str(head.get('resultMsg',head.get('resultCode'))))
    body = r.get('body', {})
    return body.get('items',{}).get('item',[]) or [], int(body.get('totalCount',0))


def main():
    if not KEY: sys.exit('KCISA_SERVICE_KEY 환경변수가 필요합니다. 키는 소스코드에 저장하지 마세요.')
    local = json.loads((DATA/'bookstores-local.json').read_text(encoding='utf-8'))
    old_api = json.loads((DATA/'bookstores-api.json').read_text(encoding='utf-8'))
    id_map = {identity(s.get('title'),s.get('address')):s for s in local+old_api}
    seen = {identity(s.get('title'),s.get('address')) for s in local}
    collected=[]; page=1; total=0
    while len(collected)<200:
        items,total = fetch_page(page)
        if not items: break
        for item in items:
            s=convert(item,id_map,len(collected)+1)
            if not s: continue
            k=identity(s['title'],s['address'])
            if k in seen: continue
            seen.add(k);collected.append(s)
            if len(collected)>=200: break
        print(f'{page}페이지 완료 · {len(collected)}개 수집 / 전체 {total}개')
        if page*100>=total: break
        page+=1;time.sleep(0.25)
    if len(collected)!=200:
        sys.exit(f'중복 제외 {len(collected)}개만 수집했습니다. 기존 파일은 유지합니다.')
    target=DATA/'bookstores-api.json'
    tmp=target.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(collected,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    tmp.replace(target)
    print('완료: data/bookstores-api.json에 검증된 API 데이터 200개 저장')

if __name__=='__main__': main()
