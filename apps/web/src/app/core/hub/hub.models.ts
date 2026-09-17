import type { components } from '@echocall/light-api-client';

/**
 * The hub schemas the workspace pages consume, re-exported under their
 * documented names so feature code never repeats the components[...] lookup.
 */
type Schemas = components['schemas'];

export type Pagination = Schemas['Pagination'];

export type Agent = Schemas['Agent'];
export type AgentSummary = Schemas['AgentSummary'];
export type CreateAgent = Schemas['CreateAgent'];
export type UpdateAgent = Schemas['UpdateAgent'];
export type KnowledgeEntry = Schemas['KnowledgeEntry'];
export type AddKnowledge = Schemas['AddKnowledge'];
export type Voice = Schemas['Voice'];
export type AvailableVoice = Schemas['AvailableVoice'];
export type Language = Schemas['Language'];

export type Chatbot = Schemas['Chatbot'];
export type ChatbotSummary = Schemas['ChatbotSummary'];
export type CreateChatbot = Schemas['CreateChatbot'];
export type UpdateChatbot = Schemas['UpdateChatbot'];
export type ChatbotKnowledgeEntry = Schemas['ChatbotKnowledgeEntry'];

export type Conversation = Schemas['Conversation'];
export type ConversationTranscriptMessage = Schemas['ConversationTranscriptMessage'];
export type LiveConversation = Schemas['LiveConversation'];
export type LiveMessage = Schemas['LiveMessage'];
export type SendMessage = Schemas['SendMessage'];
export type UpdateConversation = Schemas['UpdateConversation'];

export type PhoneNumber = Schemas['PhoneNumber'];
export type MarketplaceNumber = Schemas['MarketplaceNumber'];
export type Country = Schemas['Country'];
export type KycRequirement = Schemas['KycRequirement'];

export type AnalyticsSummary = Schemas['AnalyticsSummary'];
export type DailyStat = Schemas['DailyStat'];
export type AgentStats = Schemas['AgentStats'];
export type ChatbotStats = Schemas['ChatbotStats'];

export type Integration = Schemas['Integration'];
export type IntegrationSummary = Schemas['IntegrationSummary'];
export type IntegrationType = Schemas['IntegrationType'];
export type CreateIntegration = Schemas['CreateIntegration'];
export type UpdateIntegration = Schemas['UpdateIntegration'];
export type CatalogTool = Schemas['CatalogTool'];

export type Webhook = Schemas['Webhook'];
export type WebhookEvent = Schemas['WebhookEvent'];

export type Campaign = Schemas['Campaign'];
export type CampaignSummary = Schemas['CampaignSummary'];
export type Recipient = Schemas['Recipient'];

export type Ticket = Schemas['Ticket'];
export type TicketSummary = Schemas['TicketSummary'];
export type TicketMessage = Schemas['TicketMessage'];
export type CreateTicket = Schemas['CreateTicket'];
export type AddTicketMessage = Schemas['AddTicketMessage'];

export type HubNotification = Schemas['Notification'];

export type Balance = Schemas['Balance'];
export type Transaction = Schemas['Transaction'];
export type Invoice = Schemas['Invoice'];
export type Subscription = Schemas['Subscription'];
export type Plan = Schemas['Plan'];
export type AddonPackage = Schemas['AddonPackage'];
