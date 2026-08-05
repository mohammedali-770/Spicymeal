export type RoutingDecision =
  | { action: 'handoff'; category: string; priority: 'normal' | 'high' | 'urgent'; teamKey: 'customer-care' | 'complaints'; reason: string }
  | { action: 'ai'; category: string; priority: 'normal'; reason: string };

const HUMAN = [
  /\b(agent|human|person|representative|manager|supervisor)\b/i,
  /(موظف|موظفة|شخص|إنسان|مدير|مشرف|خدمة العملاء)/i,
];
const PAYMENT = [
  /\b(payment|paid|charged|deducted|card|refund|bank|mada|apple pay|wallet|dispute)\b/i,
  /(دفع|مدفوع|انخصم|خصم|بطاقة|استرجاع|استرداد|بنك|مدى|ابل باي|محفظة)/i,
];
const COMPLAINT = [
  /\b(complaint|missing|wrong order|cold|late|spoiled|bad|cancel order)\b/i,
  /(شكوى|ناقص|غلط|بارد|متأخر|فاسد|سيئ|إلغاء الطلب)/i,
];
const SAFETY = [
  /\b(allergy|allergic|hospital|sick|poison|food safety|medical emergency)\b/i,
  /(حساسية|مستشفى|مريض|تسمم|سلامة غذائية|طوارئ صحية)/i,
];

function matches(text: string, patterns: RegExp[]) { return patterns.some((pattern) => pattern.test(text)); }

export function routeInboundMessage(text: string): RoutingDecision {
  const normalized = text.trim();
  if (!normalized) return { action: 'handoff', category: 'Unsupported message', priority: 'normal', teamKey: 'customer-care', reason: 'The inbound message has no supported text content.' };
  if (matches(normalized, SAFETY)) return { action: 'handoff', category: 'Food safety', priority: 'urgent', teamKey: 'complaints', reason: 'Potential health or food-safety concern.' };
  if (matches(normalized, PAYMENT)) return { action: 'handoff', category: 'Payment issue', priority: 'urgent', teamKey: 'customer-care', reason: 'Payments, charges and refunds require verified human action.' };
  if (matches(normalized, COMPLAINT)) return { action: 'handoff', category: 'Complaint', priority: 'high', teamKey: 'complaints', reason: 'The customer reported an order-quality or fulfilment problem.' };
  if (matches(normalized, HUMAN)) return { action: 'handoff', category: 'Human requested', priority: 'normal', teamKey: 'customer-care', reason: 'The customer explicitly requested a human agent.' };
  return { action: 'ai', category: 'General inquiry', priority: 'normal', reason: 'No mandatory human-handover rule matched.' };
}
