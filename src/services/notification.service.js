function isTwilioEnabled() {
  return [
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    process.env.TWILIO_PHONE_NUMBER,
  ].every((value) => String(value || '').trim());
}

async function sendSmsNotification({ to, body }) {
  const phone = String(to || '').trim();
  const message = String(body || '').trim();

  if (!phone || !message) {
    return { sent: false, skipped: true, reason: 'Missing phone number or message.' };
  }

  if (!isTwilioEnabled()) {
    return { sent: false, skipped: true, reason: 'Twilio is not configured.' };
  }

  const accountSid = String(process.env.TWILIO_ACCOUNT_SID).trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN).trim();
  const from = String(process.env.TWILIO_PHONE_NUMBER).trim();

  const params = new URLSearchParams({
    To: phone,
    From: from,
    Body: message,
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    throw new Error(payload?.message || `Twilio request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return {
    sent: true,
    sid: payload.sid,
    status: payload.status,
  };
}

module.exports = {
  isTwilioEnabled,
  sendSmsNotification,
};
