/**
 * The data behind the screenshots in the README and the documentation.
 *
 * None of it is real: the companies, people and numbers are invented, and the
 * addresses use the reserved `.example` domain. The screenshot run seeds these
 * customers through the portal's own API and the service stub answers for them,
 * so a picture shows the portal in the state an operator would recognise rather
 * than an empty installation.
 */

/** The customers the operator has taken on, newest last. */
export const DEMO_CUSTOMERS = [
  {
    email: 'anna.harper@harperdental.example',
    firstName: 'Anna',
    lastName: 'Harper',
    company: 'Harper Dental Care',
    language: 'en',
    balanceEur: '128.40',
    voiceMinutes: 312,
    chatConversations: 84,
    accountStatus: 'active',
    createdAt: '2026-03-14T09:20:00.000Z',
    acceptInvite: true,
  },
  {
    email: 'mark.feld@northwindlogistics.example',
    firstName: 'Mark',
    lastName: 'Feld',
    company: 'Northwind Logistics',
    language: 'en',
    balanceEur: '842.15',
    voiceMinutes: 1974,
    chatConversations: 356,
    accountStatus: 'active',
    createdAt: '2026-04-02T14:05:00.000Z',
    acceptInvite: true,
  },
  {
    email: 'sofia.reyes@lumenfitness.example',
    firstName: 'Sofia',
    lastName: 'Reyes',
    company: 'Lumen Fitness',
    language: 'en',
    balanceEur: '61.90',
    voiceMinutes: 148,
    chatConversations: 212,
    accountStatus: 'active',
    createdAt: '2026-05-27T11:48:00.000Z',
    acceptInvite: true,
  },
  {
    email: 'jonas.calder@calderplumbing.example',
    firstName: 'Jonas',
    lastName: 'Calder',
    company: 'Calder Plumbing',
    language: 'en',
    balanceEur: '9.75',
    voiceMinutes: 27,
    chatConversations: 4,
    accountStatus: 'active',
    createdAt: '2026-07-09T16:31:00.000Z',
    acceptInvite: false,
  },
  {
    email: 'iris.vandermeer@vireotravel.example',
    firstName: 'Iris',
    lastName: 'van der Meer',
    company: 'Vireo Travel',
    language: 'en',
    balanceEur: '317.05',
    voiceMinutes: 703,
    chatConversations: 931,
    accountStatus: 'active',
    createdAt: '2026-08-15T10:12:00.000Z',
    acceptInvite: true,
  },
  {
    email: 'peter.ashgrove@ashgrovevet.example',
    firstName: 'Peter',
    lastName: 'Ashgrove',
    company: 'Ashgrove Veterinary',
    language: 'en',
    balanceEur: '0.00',
    voiceMinutes: 0,
    chatConversations: 0,
    accountStatus: 'suspended',
    createdAt: '2026-09-08T08:57:00.000Z',
    acceptInvite: false,
  },
  {
    email: 'nina.okafor@okaforlaw.example',
    firstName: 'Nina',
    lastName: 'Okafor',
    company: 'Okafor Law',
    language: 'en',
    balanceEur: '204.60',
    voiceMinutes: 489,
    chatConversations: 63,
    accountStatus: 'active',
    createdAt: '2026-06-18T13:40:00.000Z',
    acceptInvite: true,
  },
  {
    email: 'leo.brandt@brandtelektro.example',
    firstName: 'Leo',
    lastName: 'Brandt',
    company: 'Brandt Elektro',
    language: 'de',
    balanceEur: '76.20',
    voiceMinutes: 195,
    chatConversations: 31,
    accountStatus: 'active',
    createdAt: '2026-09-14T09:05:00.000Z',
    acceptInvite: true,
  },
];

/** The customer whose own workspace the screenshots show. */
export const DEMO_SIGNED_IN = DEMO_CUSTOMERS[0];

/** What the service reports for that customer's current month. */
export const DEMO_LIMITS = {
  accountStatus: 'active',
  balanceEur: 128.4,
  voiceMinutesRemaining: 312,
  plan: { name: 'Professional', voiceMinutesPerMonth: 500 },
};

export const DEMO_USAGE = {
  period: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' },
  voiceMinutesUsed: 188,
  chatSessionsUsed: 84,
};

/** Recent calls and chats, most recent first. */
export const DEMO_CONVERSATIONS = [
  {
    type: 'voice',
    id: 4821,
    direction: 'inbound',
    fromNumber: '+442079460815',
    toNumber: '+442039664102',
    duration: 214,
    status: 'completed',
    startedAt: '2026-09-21T09:42:00.000Z',
    endedAt: '2026-09-21T09:45:34.000Z',
    createdAt: '2026-09-21T09:42:00.000Z',
  },
  {
    type: 'chat',
    id: 4820,
    chatbotId: 731,
    channel: 'widget',
    integrationId: null,
    status: 'closed',
    visitorId: 'v-8c21d4',
    visitorName: 'Ellen Ward',
    visitorEmail: 'e.ward@example.com',
    visitorLocation: 'Leeds, GB',
    createdAt: '2026-09-21T09:18:00.000Z',
  },
  {
    type: 'voice',
    id: 4816,
    direction: 'outbound',
    fromNumber: '+442039664102',
    toNumber: '+442071838290',
    duration: 87,
    status: 'completed',
    startedAt: '2026-09-21T08:55:00.000Z',
    endedAt: '2026-09-21T08:56:27.000Z',
    createdAt: '2026-09-21T08:55:00.000Z',
  },
  {
    type: 'voice',
    id: 4809,
    direction: 'inbound',
    fromNumber: '+441614960733',
    toNumber: '+442039664102',
    duration: null,
    status: 'no-answer',
    startedAt: null,
    endedAt: null,
    createdAt: '2026-09-20T17:31:00.000Z',
  },
  {
    type: 'chat',
    id: 4803,
    chatbotId: 731,
    channel: 'widget',
    integrationId: null,
    status: 'closed',
    visitorId: 'v-3a97f0',
    visitorName: null,
    visitorEmail: null,
    visitorLocation: 'Manchester, GB',
    createdAt: '2026-09-20T16:07:00.000Z',
  },
];

/** Calls per day over the last thirty days, quiet at the weekends, for the chart on the overview. */
const CALLS_BY_DAY = [
  6, 9, 4, 0, 1, 11, 8, 12, 7, 5, 0, 2, 9, 13, 10, 8, 6, 1, 0, 7, 12, 9, 11, 5, 2, 0, 8, 14, 10, 9,
];

/** The day as the service writes it, `YYYY-MM-DD`, in the machine's own time zone. */
function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The daily call statistics, relative to today so the chart is always full.
 * The service reports only the days that had a call, and so does this.
 */
export const DEMO_DAILY = CALLS_BY_DAY.map((callCount, index) => {
  const day = new Date();
  day.setDate(day.getDate() - (CALLS_BY_DAY.length - 1 - index));
  return {
    date: dayKey(day),
    agentId: null,
    callCount,
    successfulCalls: callCount,
    failedCalls: 0,
    totalDuration: callCount * 190,
    averageDuration: 190,
    totalCost: Math.round(callCount * 42) / 100,
    successRate: 100,
    peakHour: 10,
  };
}).filter((row) => row.callCount > 0);

/** The agents that customer has built. */
export const DEMO_AGENTS = [
  { id: 611, name: 'Reception', language: 'en', voiceId: null, createdAt: '2026-08-04T10:00:00.000Z' },
  {
    id: 612,
    name: 'Appointment booking',
    language: 'en',
    voiceId: null,
    createdAt: '2026-08-19T10:00:00.000Z',
  },
  { id: 613, name: 'Out of hours', language: 'en', voiceId: null, createdAt: '2026-09-02T10:00:00.000Z' },
];

/** The numbers routed to those agents. */
export const DEMO_NUMBERS = [
  { id: 88, number: '+442039664102', country: 'GB', agentId: 611, monthlyPriceEur: '3.00' },
  { id: 89, number: '+441614960733', country: 'GB', agentId: 613, monthlyPriceEur: '3.00' },
];

/** What the service reports about the operator's own business. */
export const DEMO_RESELLER_STATS = {
  totalCustomers: DEMO_CUSTOMERS.length,
  totalVoiceAgents: 14,
  totalChatbots: 9,
  voiceMinutesAvailable: 4820,
  chatMessagesAvailable: 12400,
  thisMonthUsageCost: 486.3,
};

export const DEMO_RESELLER_CREDITS = {
  resellerId: 9,
  voiceMinutesAvailable: 4820,
  chatMessagesAvailable: 12400,
  voiceMinutesPurchased: 8000,
  chatMessagesPurchased: 20000,
  voiceMinutesUsed: 3180,
  chatMessagesUsed: 7600,
  lowBalanceAlertSent: false,
  lowBalanceThreshold: 500,
  lastPurchase: '2026-09-02T09:00:00.000Z',
  lastUsage: '2026-09-21T09:42:00.000Z',
};

export const DEMO_RESELLER_BALANCE = { balance: 1284.55, currency: 'EUR', formatted: '1284.55 EUR' };

export const DEMO_SUBSCRIPTION_COUNT = { count: 6 };

/** Support requests the operator still has to answer. */
export const DEMO_RESELLER_TICKETS = [
  {
    id: 'ticket_4471',
    subject: 'Second number does not ring through',
    status: 'open',
    category: 'technical',
    priority: 'high',
    updatedAt: '2026-09-21T08:12:00.000Z',
  },
  {
    id: 'ticket_4468',
    subject: 'Please raise the monthly minutes',
    status: 'open',
    category: 'billing',
    priority: 'medium',
    updatedAt: '2026-09-20T15:44:00.000Z',
  },
  {
    id: 'ticket_4455',
    subject: 'Invoice address changed',
    status: 'closed',
    category: 'billing',
    priority: 'low',
    updatedAt: '2026-09-18T11:03:00.000Z',
  },
];
