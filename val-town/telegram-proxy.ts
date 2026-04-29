const APPS_SCRIPT_WEBAPP_URL_ENV = "APPS_SCRIPT_WEBAPP_URL";
const WEBHOOK_SECRET_ENV = "WEBHOOK_SECRET";
const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

export default async function (req: Request): Promise<Response> {
  const body = await req.text();

  // Val Town waits for non-awaited async work after sending the response.
  // This keeps Telegram from retrying while Apps Script processes the update.
  void forwardToAppsScript(req, body);

  return new Response("ok", { status: 200 });
}

async function forwardToAppsScript(req: Request, body: string): Promise<void> {
  const appsScriptUrl = Deno.env.get(APPS_SCRIPT_WEBAPP_URL_ENV);
  if (!appsScriptUrl) {
    console.error("Missing APPS_SCRIPT_WEBAPP_URL");
    return;
  }

  const webhookSecret = forwardedWebhookSecret(req);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (webhookSecret) headers[TELEGRAM_SECRET_HEADER] = webhookSecret;

  try {
    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers,
      body,
      redirect: "follow",
    });
    console.log("Apps Script response:", response.status);
  } catch (error) {
    console.error("Apps Script fetch error:", String(error));
  }
}

function forwardedWebhookSecret(req: Request): string {
  const envSecret = Deno.env.get(WEBHOOK_SECRET_ENV);
  if (envSecret) return envSecret;

  const headerSecret = req.headers.get(TELEGRAM_SECRET_HEADER);
  if (headerSecret) return headerSecret;

  const incomingUrl = new URL(req.url);
  return incomingUrl.searchParams.get("webhook_secret") || "";
}
