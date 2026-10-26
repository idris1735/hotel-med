// POST /api/chat -- Vesper, the AI concierge widget's backend.
//
// Public hotel help only. Persistent per-IP-hash and global request budgets,
// origin checks and bounded untrusted history protect the AI endpoint.
const { chatWithVesper } = require('./_lib/gemini');
const {guard,sameOrigin}=require('./_lib/hotel-os');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_TURNS = 40;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  res.setHeader('Cache-Control','no-store');
  if(!sameOrigin(req))return res.status(403).json({error:'Please use the Hotel Medallion website.'});
  if(JSON.stringify(body).length>30000)return res.status(413).json({error:'Conversation is too long. Please start a new chat.'});
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
    await guard(req,'chat');
    const result = await chatWithVesper({ history, message: message.trim() });
    return res.status(200).json(result);
  } catch (err) {
    console.error('Vesper request failed', {status:err.status||503});
    return res.status(err.status||503).json({
      error: "Vesper is having trouble connecting right now. Please try again, or call the front desk on 09060006382.",
    });
  }
};
