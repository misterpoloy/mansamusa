// Points the Telegram bot at the host app's webhook (tracker P8.04).
// Usage: TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... yarn tsx scripts/telegram-set-webhook.ts https://<host>/api/telegram/webhook
// For Vercel previews append ?x-vercel-protection-bypass=<secret> to the URL.
const [url] = process.argv.slice(2)
const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
if (!url || !token || !secret) {
  console.error('usage: TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… tsx scripts/telegram-set-webhook.ts <https-url>')
  process.exit(1)
}
const api = (method: string, body?: unknown) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json())

console.log(await api('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }))
console.log(await api('getWebhookInfo'))
