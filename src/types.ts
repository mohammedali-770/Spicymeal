export type ConversationOwner = 'ai' | 'human' | 'unassigned';
export type ConversationStatus = 'new' | 'queued' | 'assigned' | 'waiting_customer' | 'resolved';
export type Priority = 'normal' | 'high' | 'urgent';
export type MemberRole = 'admin' | 'supervisor' | 'agent' | 'viewer';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  role: MemberRole;
  organizationId: string;
  organizationName: string;
  online: boolean;
}

export interface Agent {
  id: string;
  name: string;
  initials: string;
  team: string;
  online: boolean;
  activeCount: number;
}

export interface TeamMember extends Agent {
  role: MemberRole;
  email?: string | null;
}

export interface Conversation {
  id: string;
  customerName: string;
  phone: string;
  initials: string;
  status: ConversationStatus;
  owner: ConversationOwner;
  priority: Priority;
  category: string;
  teamName: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  unreadCount: number;
  lastMessage: string;
  lastMessageAt: string;
  language: 'ar' | 'en';
  aiConfidence: number | null;
  handoverReason: string | null;
  tags: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound' | 'internal';
  senderType: 'customer' | 'agent' | 'ai' | 'system';
  senderName: string;
  body: string;
  createdAt: string;
  deliveryStatus: 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  isNote?: boolean;
}

export interface Snapshot {
  conversations: Conversation[];
  agents: Agent[];
  members: TeamMember[];
}

export interface InviteMemberInput {
  email: string;
  displayName: string;
  role: MemberRole;
  teamKey: 'customer-care' | 'complaints';
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  language: 'ar' | 'en' | 'both';
  active: boolean;
}

export interface KnowledgeInput {
  id?: string;
  title: string;
  content: string;
  language: 'ar' | 'en' | 'both';
  active: boolean;
  organizationId: string;
}
