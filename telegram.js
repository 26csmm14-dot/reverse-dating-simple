// telegram.js - Telegram Bot Proposal Alerts & Decision Flow (Zero-Dependency)
const fs = require('fs');
const path = require('path');

// Read environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9031585898:AAGJgrNHQAQ9veHO7_k_zRSrJt7Z0qc0mUM';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7192300395';
const TG_API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Helper: Make Telegram API request
async function tgRequest(method, payload, isFormData = false) {
  try {
    const url = `${TG_API_BASE}/${method}`;
    let res;

    if (isFormData) {
      res = await fetch(url, {
        method: 'POST',
        body: payload, // payload is native FormData
      });
    } else {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const json = await res.json();
    return json;
  } catch (err) {
    if (method !== 'getUpdates') {
      console.warn(`[Telegram] ${method} error:`, err.message);
    }
    return { ok: false, error: err.message };
  }
}

// Format proposal caption text (zero emojis)
function formatProposalCaption(applicant) {
  const name = applicant.name || 'Anonymous Candidate';
  const platform = applicant.contactType ? applicant.contactType.toUpperCase() : 'INSTAGRAM';
  const contact = applicant.contact || 'No handle provided';
  const expectations = applicant.expectations || 'Open to exploring chemistry';
  const firstDate = applicant.firstDateIdea || 'Scenic Mountain Trail Trek';
  const pitch = applicant.pitch || 'No custom note attached.';

  return [
    'NEW WANNA DATE U PROPOSAL',
    '----------------------------------------',
    `Candidate: ${name}`,
    `Platform: ${platform} (${contact})`,
    `Selected Date: ${firstDate}`,
    `Expectations: ${expectations}`,
    '----------------------------------------',
    'Candidate Pitch Note:',
    `"${pitch}"`,
    '----------------------------------------',
    'Select an action below:',
  ].join('\n');
}

// Generate the exactly 2 inline decision buttons
function getDecisionKeyboard(applicantId) {
  return {
    inline_keyboard: [
      [
        { text: 'Agree (Accept)', callback_data: `accept:${applicantId}` },
        { text: 'Reject (404)', callback_data: `reject:${applicantId}` },
      ],
    ],
  };
}

// 1. Send Proposal Alert to Pruthviraj
async function sendProposalAlert(applicant) {
  if (!applicant || !applicant.id) {
    console.warn('[Telegram] Cannot send alert: missing applicant or applicant.id');
    return { ok: false, error: 'missing applicant' };
  }

  const caption = formatProposalCaption(applicant);
  const reply_markup = getDecisionKeyboard(applicant.id);
  const photo = applicant.photo;

  // Case A: Photo is base64 Data URL
  if (photo && photo.startsWith('data:image')) {
    try {
      const commaIdx = photo.indexOf(',');
      const meta = photo.substring(0, commaIdx);
      const mimeMatch = meta.match(/data:([^;]+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = photo.substring(commaIdx + 1);
      const buffer = Buffer.from(base64Data, 'base64');

      const formData = new FormData();
      formData.append('chat_id', CHAT_ID);
      formData.append('caption', caption);
      formData.append('reply_markup', JSON.stringify(reply_markup));
      formData.append('photo', new Blob([buffer], { type: mimeType }), 'candidate.jpg');

      const result = await tgRequest('sendPhoto', formData, true);
      if (result.ok) {
        console.log(`[Telegram] Proposal photo alert delivered for ${applicant.name}!`);
        return result;
      }
    } catch (e) {
      console.warn('[Telegram] Failed sending base64 photo, falling back to text:', e.message);
    }
  }

  // Case B: Photo is a direct HTTP URL
  if (photo && photo.startsWith('http')) {
    const result = await tgRequest('sendPhoto', {
      chat_id: CHAT_ID,
      photo: photo,
      caption: caption,
      reply_markup: reply_markup,
    });
    if (result.ok) {
      console.log(`[Telegram] Proposal photo URL alert delivered for ${applicant.name}!`);
      return result;
    }
  }

  // Case C: Standard text alert (or default avatar)
  const textResult = await tgRequest('sendMessage', {
    chat_id: CHAT_ID,
    text: caption,
    reply_markup: reply_markup,
  });

  if (textResult.ok) {
    console.log(`[Telegram] Proposal message alert delivered for ${applicant.name}!`);
  } else {
    console.warn(`[Telegram] Failed to deliver alert:`, textResult.description || textResult.error);
  }

  return textResult;
}

// 2. Handle Decision Callback Query from Button Click
async function handleCallbackQuery(query, db) {
  if (!query || !query.data) return;

  const queryId = query.id;
  const data = query.data;
  const [action, applicantId] = data.split(':');

  if (!action || !applicantId || (action !== 'accept' && action !== 'reject')) {
    await tgRequest('answerCallbackQuery', {
      callback_query_id: queryId,
      text: 'Invalid action payload.',
    });
    return;
  }

  const isAccepted = action === 'accept';
  const newStatus = isAccepted ? 'accepted' : 'rejected';
  const decisionTime = new Date().toLocaleTimeString();

  // 1. Update applicant in MongoDB Atlas
  let applicant = null;
  if (db && typeof db.updateApplicant === 'function') {
    applicant = await db.updateApplicant(applicantId, {
      status: newStatus,
      decidedAt: new Date(),
    });
  }

  const candName = applicant?.name || 'Candidate';

  // 2. Alert pop-up notification on Pruthviraj's Telegram app
  await tgRequest('answerCallbackQuery', {
    callback_query_id: queryId,
    text: isAccepted
      ? `Match agreed! ${candName} has been accepted.`
      : `${candName}'s proposal has been rejected (404).`,
    show_alert: true,
  });

  // 3. Update the Telegram message text/caption to reflect the recorded decision
  const message = query.message;
  if (message) {
    const updatedNote = [
      'DECISION RECORDED',
      '----------------------------------------',
      `Candidate: ${candName}`,
      `Outcome: ${isAccepted ? 'AGREED (ACCEPTED)' : 'REJECTED (404)'}`,
      `Decided At: ${decisionTime}`,
      '----------------------------------------',
      isAccepted
        ? 'Social links have been unlocked for the candidate.'
        : 'Candidate browser has transitioned to 404 connection page.',
    ].join('\n');

    if (message.caption !== undefined) {
      await tgRequest('editMessageCaption', {
        chat_id: message.chat.id,
        message_id: message.message_id,
        caption: updatedNote,
        reply_markup: { inline_keyboard: [] }, // Remove buttons once decided
      });
    } else {
      await tgRequest('editMessageText', {
        chat_id: message.chat.id,
        message_id: message.message_id,
        text: updatedNote,
        reply_markup: { inline_keyboard: [] },
      });
    }
  }

  console.log(`[Telegram] Decision recorded: ${candName} -> ${newStatus.toUpperCase()}`);
  return { success: true, applicantId, status: newStatus };
}

// 3. Background Long-Polling Loop for Real-Time Decision Handling
let isPollingActive = false;
let pollingOffset = 0;

async function startPolling(db) {
  if (isPollingActive) return;
  isPollingActive = true;

  console.log('[Telegram Polling] Starting real-time listener for Pruthviraj decisions...');

  // Delete any lingering webhook to allow getUpdates long-polling
  await tgRequest('deleteWebhook', { drop_pending_updates: false });

  // Polling loop
  (async function loop() {
    while (isPollingActive) {
      try {
        const data = await tgRequest('getUpdates', {
          offset: pollingOffset,
          timeout: 0,
          allowed_updates: ['callback_query', 'message'],
        });

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            pollingOffset = update.update_id + 1;

            if (update.callback_query) {
              await handleCallbackQuery(update.callback_query, db);
            }
          }
        }
        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();
}

function stopPolling() {
  isPollingActive = false;
}

module.exports = {
  BOT_TOKEN,
  CHAT_ID,
  formatProposalCaption,
  getDecisionKeyboard,
  sendProposalAlert,
  handleCallbackQuery,
  startPolling,
  stopPolling,
  tgRequest,
};
