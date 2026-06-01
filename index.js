const express = require("express");
const axios = require("axios");

const app = express();

const CONFIG = {
  APP_SECRET: process.env.APP_SECRET,
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "viral_allure_webhook_2026",
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  PAGE_ID: process.env.PAGE_ID,
  PORT: process.env.PORT || 3000,
};

const repliedComments = new Set();

app.use(express.json());

// WEBHOOK VERIFY
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// NOUVO COMMENTS
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== "page") return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "feed" && change.value?.item === "comment") {
        const comment = change.value;

        if (!comment.comment_id) continue;
        if (repliedComments.has(comment.comment_id)) continue;

        await replyToComment(comment.comment_id, comment.message || "");
      }
    }
  }
});

// SCAN ANSYEN COMMENTS
async function scanOldComments() {
  try {
    if (!CONFIG.PAGE_ID) return;

    const posts = await axios.get(
      `https://graph.facebook.com/v25.0/${CONFIG.PAGE_ID}/posts`,
      {
        params: {
          access_token: CONFIG.PAGE_ACCESS_TOKEN,
          limit: 30,
        },
      }
    );

    for (const post of posts.data.data || []) {
      const comments = await axios.get(
        `https://graph.facebook.com/v25.0/${post.id}/comments`,
        {
          params: {
            access_token: CONFIG.PAGE_ACCESS_TOKEN,
            limit: 100,
          },
        }
      );

      for (const comment of comments.data.data || []) {
        if (repliedComments.has(comment.id)) continue;

        await replyToComment(comment.id, comment.message || "");
      }
    }
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

async function replyToComment(commentId, text) {
  const reply = await generateReply(text);

  if (!reply) return;

  await axios.post(
    `https://graph.facebook.com/v25.0/${commentId}/comments`,
    { message: reply },
    {
      params: {
        access_token: CONFIG.PAGE_ACCESS_TOKEN,
      },
    }
  );

  repliedComments.add(commentId);
}

async function generateReply(commentText) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content: `
Reply to Facebook comments for Viral Allure.
Rules:
- warm
- emotional
- 2–3 lines max
- end with one question
- match comment language
- never robotic
- 1–2 emojis max
`,
          },
          {
            role: "user",
            content: commentText,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch {
    return null;
  }
}

app.get("/", (req, res) => {
  // Inject Vercel Speed Insights for performance monitoring
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Viral Allure Bot</title>
  <script>
    window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0 0 1rem 0; font-size: 2.5rem; }
    .status { font-size: 1.2rem; opacity: 0.9; }
    .emoji { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="emoji">🔥</div>
    <h1>Viral Allure Bot</h1>
    <p class="status">✅ Bot actif</p>
  </div>
</body>
</html>
  `);
});

// chak 10 minit scan ansyen comments
setInterval(scanOldComments, 10 * 60 * 1000);

app.listen(CONFIG.PORT);
module.exports = app;
