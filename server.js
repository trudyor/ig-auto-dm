import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const {
  PORT = 3000,
  VERIFY_TOKEN,           // 웹훅 검증용 - 아무 비밀 문자열 (예: my-secret-123)
  APP_SECRET,             // Meta 앱 시크릿 (서명 검증용)
  IG_ACCESS_TOKEN,        // 인스타 비즈니스 계정 액세스 토큰
  IG_BUSINESS_ID,         // 내 인스타 비즈니스 계정 ID
  GRAPH_VERSION = "v21.0",
} = process.env;

// ─────────────────────────────────────────────────────────────
// 자동화 규칙: 여기만 고치면 됩니다 (게시물별 링크 방식)
//
// KEYWORD      : 이 단어가 댓글에 있으면 발동 (소문자, 포함 여부로 매칭)
// POST_LINKS   : 게시물별 링크. "게시물ID": { publicReply, dm }
//                게시물 ID는 실제 게시물을 올린 뒤 등록합니다.
// DEFAULT_REPLY: POST_LINKS에 없는 게시물에 기본으로 나갈 답장
// ─────────────────────────────────────────────────────────────
const KEYWORD = "링크";

const POST_LINKS = {
  // 예시 (실제 게시물 올린 뒤 이렇게 등록):
  // "17895695668004550": {
  //   publicReply: "DM 확인해주세요! 📩",
  //   dm: "A상품 링크예요 👉 https://example.com/a",
  // },
};

// 등록 안 된 게시물에서 "링크" 댓글이 달렸을 때:
//  - null  이면  아무 답장도 안 보냄 (지금 설정: 등록한 게시물에만 반응)
//  - 객체면 그 게시물들에 공통으로 나갈 기본 답장
const DEFAULT_REPLY = null;

const app = express();

// 서명 검증을 위해 raw body를 보관
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ── 1) 웹훅 검증 (Meta가 최초 등록 때 GET으로 호출) ──
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ 웹훅 검증 성공");
    return res.status(200).send(challenge);
  }
  console.warn("❌ 웹훅 검증 실패");
  return res.sendStatus(403);
});

// ── 2) 이벤트 수신 (댓글 등이 들어옴) ──
app.post("/webhook", async (req, res) => {
  // 요청이 진짜 Meta에서 왔는지 서명 확인
  if (!verifySignature(req)) {
    console.warn("❌ 서명 검증 실패 - 요청 무시");
    return res.sendStatus(403);
  }

  // Meta는 3초 안에 200 응답을 원함 → 먼저 응답하고 처리는 비동기로
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== "instagram") return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "comments") {
          await handleComment(change.value);
        }
      }
    }
  } catch (err) {
    console.error("이벤트 처리 중 오류:", err);
  }
});

app.get("/", (_req, res) => res.send("IG Auto DM 서버 실행 중 ✅"));

app.listen(PORT, () => {
  console.log(`🚀 서버 시작: http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────────
// 핵심 로직: 댓글 하나 처리
// ─────────────────────────────────────────────────────────────
async function handleComment(comment) {
  const text = (comment.text || "").toLowerCase();
  const commentId = comment.id;
  const commenterId = comment.from?.id;
  const mediaId = comment.media?.id; // 이 댓글이 달린 게시물 ID

  // 내가 쓴 댓글이면 무시 (무한루프 방지)
  if (commenterId && String(commenterId) === String(IG_BUSINESS_ID)) return;

  // 키워드가 없으면 건너뜀
  if (!text.includes(KEYWORD.toLowerCase())) {
    console.log(`키워드 없음, 건너뜀: "${comment.text}"`);
    return;
  }

  // 이 게시물에 등록된 링크가 있으면 그걸, 없으면 기본 답장(DEFAULT_REPLY) 사용
  const rule = POST_LINKS[mediaId] || DEFAULT_REPLY;

  // 등록 안 된 게시물이고 기본 답장도 없으면 → 아무것도 안 함
  if (!rule) {
    console.log(`등록 안 된 게시물(${mediaId}) → 답장 안 함`);
    return;
  }

  console.log(`🎯 키워드 "${KEYWORD}" 매칭 (게시물 ${mediaId}) → DM 발송 시도`);

  // 2-1) 공개 답글 (선택)
  if (rule.publicReply) {
    await replyToComment(commentId, rule.publicReply);
  }

  // 2-2) 비공개 DM 발송
  if (commenterId) {
    await sendPrivateReply(commentId, rule.dm);
  }
}

// 댓글에 공개 답글 달기
async function replyToComment(commentId, message) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${commentId}/replies`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: IG_ACCESS_TOKEN }),
  });
  const data = await r.json();
  if (!r.ok) console.error("공개 답글 실패:", data);
  else console.log("💬 공개 답글 완료");
}

// 댓글 작성자에게 DM(비공개 답장) 보내기
// 인스타 정책: 댓글에 대한 private reply는 1회만 허용됨
async function sendPrivateReply(commentId, text) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${IG_BUSINESS_ID}/messages`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
      access_token: IG_ACCESS_TOKEN,
    }),
  });
  const data = await r.json();
  if (!r.ok) console.error("DM 발송 실패:", data);
  else console.log("📩 DM 발송 완료");
}

// Meta 서명(X-Hub-Signature-256) 검증
function verifySignature(req) {
  if (!APP_SECRET) return true; // 시크릿 미설정 시 건너뜀(개발용)
  const sig = req.get("X-Hub-Signature-256");
  if (!sig || !req.rawBody) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
