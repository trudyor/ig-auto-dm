# IG Auto DM — 인스타 "댓글 → 자동 DM" 서버

매니챗처럼, 내 게시물 댓글에 특정 키워드가 달리면 그 사람에게 자동으로 DM을 보내는 서버입니다.

```
누가 댓글에 "링크" → Meta가 이 서버로 알림 → 서버가 자동으로 공개답글 + DM 발송
```

## 이 코드가 하는 일
- `server.js` : 웹훅 수신 + 댓글 감지 + 자동 DM/답글 발송
- `RULES` (server.js 위쪽) : **키워드·메시지 내용은 여기만 고치면 됩니다**

---

## 🟢 준비물 (코드 밖에서 할 일 — 이건 직접 하셔야 해요)

1. **인스타 → 프로페셔널(비즈니스) 계정** 전환
2. **페이스북 페이지** 하나 만들어 인스타와 연결
3. **Meta 개발자 계정**: https://developers.facebook.com → 앱 생성 (유형: Business)
4. 앱에 **Instagram** 제품 추가

---

## 🔧 설치 & 실행 (내 컴퓨터에서)

Node.js가 필요합니다 (https://nodejs.org 에서 LTS 설치).

```powershell
npm install
```

`.env.example` 을 복사해 `.env` 로 만들고 값을 채웁니다 (아래 "값 구하는 법" 참고).

```powershell
npm start
```

`🚀 서버 시작` 이 뜨면 로컬에서는 성공입니다.

---

## 🌐 Meta와 연결하기 (가장 중요한 단계)

Meta는 **공개된 https 주소**로만 웹훅을 보냅니다. 내 PC는 외부에서 못 보므로 둘 중 하나:

### 방법 A — 테스트용 (ngrok)
```powershell
# https://ngrok.com 가입 후 설치
ngrok http 3000
```
나오는 `https://xxxx.ngrok-free.app` 주소를 사용합니다.

### 방법 B — 실제 배포 (추천: Render)
1. 이 폴더를 GitHub에 올림
2. https://render.com → New Web Service → 이 저장소 연결
3. Build: `npm install` / Start: `npm start`
4. 환경변수(.env 값들)를 Render 대시보드에 입력
5. 배포되면 `https://내앱.onrender.com` 주소가 생김

### 웹훅 등록
Meta 앱 → **Instagram → 구성 → 웹훅**:
- Callback URL: `https://위에서_받은_주소/webhook`
- Verify token: `.env`의 `VERIFY_TOKEN` 과 똑같이 입력
- 구독 필드에서 **`comments`** 체크

검증 성공하면 서버 로그에 `✅ 웹훅 검증 성공` 이 뜹니다.

---

## 🔑 .env 값 구하는 법
- `VERIFY_TOKEN` : 아무 비밀문자열이나 직접 정함 (웹훅 등록 때 같은 값 입력)
- `APP_SECRET` : 앱 설정 > 기본 설정 > 앱 시크릿
- `IG_BUSINESS_ID` : Graph API Explorer에서 `me?fields=...` 또는 페이지의 연결된 인스타 계정 ID
- `IG_ACCESS_TOKEN` : Graph API Explorer에서 아래 권한으로 토큰 발급
  - `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`
  - ⚠️ 발급되는 토큰은 보통 1~2시간짜리 → **장기 토큰(long-lived)** 으로 교환해서 쓰세요

---

## ⚠️ 꼭 알아둘 점
- **앱 검수(App Review) 필요**: 내 계정으로 테스트는 바로 되지만, 다른 사람 댓글에 반응시키려면 Meta 검수 승인이 필요합니다.
- 인스타 정책상 **댓글당 비공개 답장(DM)은 1회만** 가능.
- **먼저 콜드 DM 보내기는 불가** (키워드 반응 기반만 허용).

---

## ✏️ 키워드/메시지 바꾸기
`server.js` 맨 위 `RULES` 배열만 수정하면 됩니다:

```js
const RULES = [
  { keyword: "링크", publicReply: "DM 확인!", dm: "링크입니다 👉 https://..." },
];
```
