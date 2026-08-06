interface SendInput {
  phoneNumberId: string;
  to: string;
  body: string;
  graphVersion?: string | null;
  replyToMessageId?: string | null;
}

interface MetaResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number; error_subcode?: number };
}

function graphVersion(value?: string | null) {
  const version = value || Deno.env.get('WHATSAPP_GRAPH_VERSION') || '';
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('WHATSAPP_GRAPH_VERSION must be configured, for example vXX.0');
  return version;
}

export async function sendWhatsAppText(input: SendInput) {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
  if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: input.to, type: 'text',
    text: { preview_url: false, body: input.body.trim() },
  };
  if (input.replyToMessageId) payload.context = { message_id: input.replyToMessageId };
  const response = await fetch(`https://graph.facebook.com/${graphVersion(input.graphVersion)}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await response.json() as MetaResponse;
  const providerMessageId = result.messages?.[0]?.id;
  if (!response.ok || !providerMessageId) throw new Error(result.error?.message || `Meta API returned HTTP ${response.status}`);
  return providerMessageId;
}
