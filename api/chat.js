// POST /api/chat -- Medalie, the AI concierge widget's backend.
//
// Public and unauthenticated (like every other endpoint on this site), so
// the guards below aren't about auth -- they're about keeping a single
// abusive visitor from running up the Gemini bill on the hotel's key.
// Real per-IP rate limiting (a DB or Redis-backed counter) is the next
// step if this ever sees actual abuse; for now this caps the *size* of any
// one request, which stops the cheapest attack (huge prompts/history).
const { chatWithMedalie } = require('./_lib/gemini');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 40;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const message = body.message;
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'Message is too long' });
  }
  if (history.length > MAX_HISTORY_TURNS) {
    return res.status(400).json({ error: 'Conversation is too long -- please start a new chat' });
  }

  try {
    const result = await chatWithMedalie({ history, message: message.trim() });
    return res.status(200).json(result);
  } catch (err) {
    console.error('chat failed', err);
    return res.status(500).json({
      error: "Medalie is having trouble connecting right now -- please try again, or call the front desk on 09060006382.",
    });
  }
};
