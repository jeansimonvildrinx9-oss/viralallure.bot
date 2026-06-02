const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CONFIG = {
  APP_SECRET: process.env.APP_SECRET,
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "viral_allure_webhook_2026",
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  PAGE_ID: process.env.PAGE_ID,
  PORT: process.env.PORT || 3000,
};

const SYSTEM_PROMPT = `You are a warm, loving social media manager for "Viral Allure" - a Facebook page with 211K followers creating AI-generated emotional videos about veterans protesting war, massive crowds chanting for peace, government hearing disruptions, freedom and humanity messages, stadium unity moments.

Rules for responding to comments:
- Maximum 2-3 lines only
- Very warm, loving, emotional tone
- Use 1-2 emojis maximum
- End EVERY response with ONE engaging question to bring them back
- Never sound robotic or copy-paste
- Vary your responses every time
- Write in the same language as the comment (English, French, Spanish, Haitian Creole, etc.)
- Never mention AI or that you are a bot`;

async function generateReply(commentText) {
  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Comment to respond to: "${commentText}"` }
      ],
      max_tokens: 150,
      temperature: 0.9
    }, {
      headers: {
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    return response.data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Groq error:', error.message);
    return null;
  }
}

async function replyToComment(commentId, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${commentId}/comments`,
      { message, access_token: CONFIG.PAGE_ACCESS_TOKEN },
      { timeout: 10000 }
    );
    console.log(`Replied to comment ${commentId}`);
    return true;
  } catch (error) {
    console.error('Reply error:', error.response?.data || error.message);
    return false;
  }
}

async function getAllVideos() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${CONFIG.PAGE_ID}/videos`,
      {
        params: {
          fields: 'id,title,created_time',
          limit: 50,
          access_token: CONFIG.PAGE_ACCESS_TOKEN
        },
        timeout: 15000
      }
    );
    return response.data.data || [];
  } catch (error) {
    console.error('Get videos error:', error.response?.data || error.message);
    return [];
  }
}

async function getUnansweredComments(videoId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${videoId}/comments`,
      {
        params: {
          fields: 'id,message,from,comments{id,from}',
          limit: 100,
          access_token: CONFIG.PAGE_ACCESS_TOKEN
        },
        timeout: 15000
      }
    );
    const unanswered = [];
    for (const comment of (response.data.data || [])) {
      const hasPageReply = comment.comments?.data?.some(
        reply => reply.from?.id === CONFIG.PAGE_ID
      );
      if (!hasPageReply && comment.message && comment.from?.id !== CONFIG.PAGE_ID) {
        unanswered.push({
          id: comment.id,
          message: comment.message,
          from: comment.from?.name || 'Unknown'
        });
      }
    }
    return unanswered;
  } catch (error) {
    console.error('Get comments error:', error.response?.data || error.message);
    return [];
  }
}

async function scanAndReplyAll() {
  console.log('Scanning all videos for unanswered comments...');
  const videos = await getAllVideos();
  console.log(`Found ${videos.length} videos`);
  let totalReplied = 0;
  let totalSkipped = 0;
  for (const video of videos) {
    const unanswered = await getUnansweredComments(video.id);
    console.log(`Video ${video.id}: ${unanswered.length} unanswered`);
    for (const comment of unanswered) {
      await new Promise(r => setTimeout(r, 3000));
      const reply = await generateReply(comment.message);
      if (!reply) { totalSkipped++; continue; }
      const success = await replyToComment(comment.id, reply);
      if (success) totalReplied++;
      else totalSkipped++;
      if (totalReplied % 10 === 0 && totalReplied > 0) {
        await new Promise(r => setTimeout(r, 60000));
      }
    }
  }
  console.log(`Scan complete! Replied: ${totalReplied} | Skipped: ${totalSkipped}`);
  return { totalReplied, totalSkipped };
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === CONFIG.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'page') return;
  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      if (change.field === 'feed' && change.value.item === 'comment') {
        const comment = change.value;
        if (comment.verb === 'add' && comment.from?.id !== CONFIG.PAGE_ID) {
          console.log(`New comment: "${comment.message}"`);
          const delay = Math.floor(Math.random() * 10000) + 5000;
          await new Promise(r => setTimeout(r, delay));
          const reply = await generateReply(comment.message);
          if (reply) await replyToComment(comment.comment_id, reply);
        }
      }
    }
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ViralAllureBot is running!',
    time: new Date().toISOString(),
    features: ['Auto-reply new comments (webhook)', 'Scan & reply old unanswered comments']
  });
});

app.get('/scan', async (req, res) => {
  const token = req.query.token;
  if (token !== CONFIG.VERIFY_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json({ message: 'Scan started! Check server logs.' });
  scanAndReplyAll().catch(console.error);
});

app.get('/status', (req, res) => {
  res.json({ bot: 'ViralAllureBot', page: CONFIG.PAGE_ID, webhook: 'active', scanner: 'ready', time: new Date().toISOString() });
});

app.get('/privacy', (req, res) => {
  res.send(`
Privacy Policy

Last updated: June 1, 2026

Viral Allure Bot only reads public comments to provide automated responses. We do not collect or share personal data.

Contact: jeansimonvildrinx9@gmail.com

`);
});

app.get('/terms', (req, res) => {
  res.send(`
Terms of Service

Last updated: June 1, 2026

By interacting with Viral Allure's Facebook page, you agree to these terms.

Contact: jeansimonvildrinx9@gmail.com

`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ViralAllureBot started on port ${PORT}`);
});
