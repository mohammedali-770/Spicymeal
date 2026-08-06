import type { KnowledgeArticle, Message, SessionUser, Snapshot } from './types';

export const demoUser: SessionUser = {
  id: 'a0', email: 'mohammed@spicymeal.local', displayName: 'Mohammed', initials: 'MA',
  role: 'admin', organizationId: 'demo-org', organizationName: 'Spicy Meal', online: true,
};

export const demoSnapshot: Snapshot = {
  agents: [
    { id: 'a1', name: 'Fatimah', initials: 'FA', team: 'Customer Care', online: true, activeCount: 3 },
    { id: 'a2', name: 'Noura', initials: 'NO', team: 'Customer Care', online: true, activeCount: 2 },
    { id: 'a3', name: 'Reem', initials: 'RE', team: 'Complaints', online: false, activeCount: 1 },
  ],
  members: [
    { id: 'a0', name: 'Mohammed', initials: 'MA', team: 'Customer Care', online: true, activeCount: 0, role: 'admin', email: 'mohammed@spicymeal.local' },
    { id: 'a1', name: 'Fatimah', initials: 'FA', team: 'Customer Care', online: true, activeCount: 3, role: 'agent', email: 'fatimah@spicymeal.local' },
    { id: 'a2', name: 'Noura', initials: 'NO', team: 'Customer Care', online: true, activeCount: 2, role: 'agent', email: 'noura@spicymeal.local' },
    { id: 'a3', name: 'Reem', initials: 'RE', team: 'Complaints', online: false, activeCount: 1, role: 'supervisor', email: 'reem@spicymeal.local' },
  ],
  conversations: [
    {
      id: 'c1', customerName: 'Ali Hassan', phone: '+966 55 123 9842', initials: 'AH',
      status: 'queued', owner: 'unassigned', priority: 'urgent', category: 'Payment issue', teamName: 'Customer Care',
      assignedAgentId: null, assignedAgentName: null, unreadCount: 2,
      lastMessage: 'The amount was deducted but I did not receive an order number.',
      lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(), language: 'en', aiConfidence: 0.42,
      handoverReason: 'Payment issues always require verified human review.', tags: ['payment', 'high-value'],
    },
    {
      id: 'c2', customerName: 'سارة محمد', phone: '+966 50 778 4201', initials: 'سم',
      status: 'assigned', owner: 'human', priority: 'high', category: 'Complaint', teamName: 'Complaints',
      assignedAgentId: 'a1', assignedAgentName: 'Fatimah', unreadCount: 1,
      lastMessage: 'الطلب وصل ناقص، ما وصلني البطاطس.',
      lastMessageAt: new Date(Date.now() - 7 * 60_000).toISOString(), language: 'ar', aiConfidence: 0.31,
      handoverReason: 'Missing item complaint requires human action.', tags: ['complaint', 'missing-item'],
    },
    {
      id: 'c3', customerName: 'Ahmed Abbas', phone: '+966 54 331 2099', initials: 'AA',
      status: 'new', owner: 'ai', priority: 'normal', category: 'Branch hours', teamName: null,
      assignedAgentId: null, assignedAgentName: null, unreadCount: 0,
      lastMessage: 'Great, thank you.', lastMessageAt: new Date(Date.now() - 18 * 60_000).toISOString(),
      language: 'en', aiConfidence: 0.97, handoverReason: null, tags: ['hours'],
    },
  ],
};

export const demoMessages: Record<string, Message[]> = {
  c1: [
    { id: 'm11', conversationId: 'c1', direction: 'inbound', senderType: 'customer', senderName: 'Ali Hassan', body: 'Hi, I placed an order a few minutes ago.', createdAt: new Date(Date.now() - 6 * 60_000).toISOString(), deliveryStatus: 'received' },
    { id: 'm12', conversationId: 'c1', direction: 'outbound', senderType: 'ai', senderName: 'AI Assistant', body: 'I can help check the order. Please share the mobile number used for the order.', createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), deliveryStatus: 'read' },
    { id: 'm13', conversationId: 'c1', direction: 'inbound', senderType: 'customer', senderName: 'Ali Hassan', body: 'The amount was deducted but I did not receive an order number.', createdAt: new Date(Date.now() - 2 * 60_000).toISOString(), deliveryStatus: 'received' },
    { id: 'm14', conversationId: 'c1', direction: 'internal', senderType: 'system', senderName: 'Routing engine', body: 'AI paused: payment issue. Conversation moved to Customer Care queue.', createdAt: new Date(Date.now() - 90_000).toISOString(), deliveryStatus: 'received', isNote: true },
  ],
  c2: [
    { id: 'm21', conversationId: 'c2', direction: 'inbound', senderType: 'customer', senderName: 'سارة محمد', body: 'السلام عليكم الطلب وصل ناقص.', createdAt: new Date(Date.now() - 12 * 60_000).toISOString(), deliveryStatus: 'received' },
    { id: 'm22', conversationId: 'c2', direction: 'outbound', senderType: 'ai', senderName: 'المساعد الآلي', body: 'وعليكم السلام. نعتذر لك، ما هو الصنف الناقص من الطلب؟', createdAt: new Date(Date.now() - 11 * 60_000).toISOString(), deliveryStatus: 'read' },
    { id: 'm23', conversationId: 'c2', direction: 'inbound', senderType: 'customer', senderName: 'سارة محمد', body: 'الطلب وصل ناقص، ما وصلني البطاطس.', createdAt: new Date(Date.now() - 7 * 60_000).toISOString(), deliveryStatus: 'received' },
  ],
  c3: [
    { id: 'm31', conversationId: 'c3', direction: 'inbound', senderType: 'customer', senderName: 'Ahmed Abbas', body: 'What time do you close today?', createdAt: new Date(Date.now() - 20 * 60_000).toISOString(), deliveryStatus: 'received' },
    { id: 'm32', conversationId: 'c3', direction: 'outbound', senderType: 'ai', senderName: 'AI Assistant', body: 'Our branches are open today. Tell me your preferred branch and I will confirm its exact closing time.', createdAt: new Date(Date.now() - 19 * 60_000).toISOString(), deliveryStatus: 'read' },
    { id: 'm33', conversationId: 'c3', direction: 'inbound', senderType: 'customer', senderName: 'Ahmed Abbas', body: 'Great, thank you.', createdAt: new Date(Date.now() - 18 * 60_000).toISOString(), deliveryStatus: 'received' },
  ],
};

export const demoKnowledge: KnowledgeArticle[] = [
  { id: 'k1', title: 'General service', language: 'both', active: true, content: 'Answer general menu and branch questions only from approved information. Ask for the branch when opening hours differ.' },
  { id: 'k2', title: 'Human handover policy', language: 'both', active: true, content: 'Payments, refunds, complaints, food-safety concerns and requests for a person must be transferred to a human.' },
];
