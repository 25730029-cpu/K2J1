# 책방틈 Supabase 연동 안내

- Project URL: `https://warkmnqytxyanztmnrrt.supabase.co`
- Publishable key: `js/supabase-config.js`에 설정되어 있음 (공개용 키)
- 기존 SQL Editor에서 생성한 7개 테이블과 RLS 정책을 사용함.
- Supabase → Authentication → Providers → Email 활성화 여부 확인.
- 이메일 확인이 켜져 있다면 가입 후 메일의 확인 링크를 누르고 로그인해야 함.
- Supabase → Authentication → URL Configuration에서 Site URL을 GitHub Pages 실제 URL로 설정하고 Redirect URLs에도 등록할 것.
- `index.html`, `js/app.js`, `js/supabase-config.js`를 포함한 프로젝트를 GitHub Pages에 업로드.
- 기존 데모 계정/브라우저 데이터는 자동 이전되지 않음. 새 이메일 계정으로 가입 필요.
- 즐겨찾기만 `bookbangteum.fav.<사용자 UUID>` LocalStorage 키에 저장. 비회원은 guest 키.
- Supabase Auth SDK는 로그인 토큰을 브라우저 저장소에 저장할 수 있음. 사용자 후기/코스 등 콘텐츠는 DB에만 저장.
- 기타 개인 데이터는 메모리 캐시를 통해 화면에 표시되고 Supabase DB에 기록됨.
- 리뷰는 현재 RLS상 작성자 본인에게만 보임. 공개 후기를 원하면 별도 정책 설계 필요.
- 회원 탈퇴는 클라이언트에서 관리자 권한으로 삭제하지 않도록 막아 둠. 추후 서버 측 Edge Function 구현 필요.
- 백업/복원은 현재 앱의 데이터 형식을 유지하며 DB에 기록할 수 있으므로 계정 로그인 상태에서만 사용 권장.
- CDN에 접속할 수 없는 환경에서는 Supabase SDK를 로드할 수 없음.
