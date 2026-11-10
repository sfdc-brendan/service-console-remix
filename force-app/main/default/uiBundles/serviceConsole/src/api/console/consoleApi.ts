import { apexRequest } from './sdk';

export type Channel = 'Case' | 'Voice' | 'Messaging';
export type WorkStatus =
  'Analyzing' | 'Queued' | 'Offered' | 'Accepted' | 'Declined' | 'Closed';
export type PresenceStatus = 'Online' | 'Busy' | 'Break' | 'Offline';
export type Sentiment = 'Positive' | 'Neutral' | 'Negative';
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type Severity = 'critical' | 'warning' | 'info';
export type Sender = 'Customer' | 'Agent' | 'System' | 'AI' | 'Supervisor';

export const CASE_STATUSES = [
  'New',
  'Working',
  'Waiting on Customer',
  'Escalated',
  'Closed',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low'];
export const PRESENCE_STATUSES: PresenceStatus[] = [
  'Online',
  'Busy',
  'Break',
  'Offline',
];
export const QUEUES = [
  'Tier 1 Support',
  'Billing',
  'Technical Support',
  'Premier Support',
  'General Support',
] as const;

export interface WorkItem {
  id: string;
  name: string;
  channel: Channel;
  status: WorkStatus;
  subject: string | null;
  customerName: string | null;
  queue: string | null;
  priority: Priority;
  agentId: string | null;
  agentName: string | null;
  caseId: string | null;
  caseNumber: string | null;
  sourceRecordId: string | null;
  createdAt: string;
  offeredAt: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
  sentiment: Sentiment | null;
  slaDue: string | null;
  simulated: boolean;
  onHold: boolean;
  summary: string | null;
  requiredSkill: string | null;
  skills: string[];
  routing?: OfferRouting | null;
}

export type SkillLevel = 'required' | 'preferred';
export type SkillSource = 'ai' | 'rules' | 'manual' | 'transfer';
export type TriageModel = 'ai' | 'rules' | 'manual';

export interface TaggedSkill {
  name: string;
  level: SkillLevel;
  confidence: number;
  reason: string | null;
  source: SkillSource;
}

/** Why an offer reached this agent: what the case needs and how they matched. */
export interface OfferRouting {
  intent: string | null;
  summary: string | null;
  confidence: number | null;
  model: TriageModel | null;
  skills: TaggedSkill[];
  score: number | null;
  matched: string[];
  missing: string[];
  relaxed: boolean;
}

export interface RoutingAnalysis {
  intent: string | null;
  category: string | null;
  summary: string | null;
  sentiment: Sentiment;
  suggestedPriority: Priority | null;
  language: string | null;
  confidence: number;
  signals: string[];
  queue: string | null;
  skills: TaggedSkill[];
  model: TriageModel;
  analyzedAt: string;
  fallbackReason?: string;
}

export type RoutingEventType =
  | 'received'
  | 'analyzed'
  | 'tagged'
  | 'waiting'
  | 'relaxed'
  | 'offered'
  | 'declined'
  | 'timeout'
  | 'requeued'
  | 'accepted'
  | 'transferred'
  | 'retagged'
  | 'reassigned'
  | 'closed';

export interface RoutingCandidate {
  agentId: string;
  name: string;
  score: number;
  matched: string[];
  missing: string[];
  levels: Record<string, number>;
  eligible: boolean;
  reason: string | null;
  load: number;
  capacity: number;
  virtual: boolean;
}

export interface RoutingEvent {
  type: RoutingEventType;
  title: string;
  detail: string | null;
  at: string;
  agentId?: string | null;
  agentName?: string | null;
  actor?: string | null;
  score?: number;
  matched?: string[];
  missing?: string[];
  levels?: Record<string, number>;
  relaxed?: boolean;
  candidates?: RoutingCandidate[];
  skills?: TaggedSkill[];
  signals?: string[];
  confidence?: number;
  model?: TriageModel;
}

export interface WorkRouting {
  work: WorkItem | null;
  analysis: RoutingAnalysis | null;
  events: RoutingEvent[];
  coverage?: Record<string, { agents: number; online: number }>;
  serverTime: string;
}

export interface RoutingFeed {
  items: {
    work: WorkItem;
    intent: string | null;
    model: TriageModel | null;
    skills: TaggedSkill[];
    lastEvent: RoutingEvent | null;
    offer: RoutingEvent | null;
  }[];
  analyzing: number;
  queued: number;
  offered: number;
  serverTime: string;
}

export interface CatalogSkill {
  name: string;
  source: 'console' | 'omni' | 'agent';
  agents: number;
  online: number;
}

export interface AgentPresence {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  status: PresenceStatus;
  capacity: number;
  usedCapacity: number;
  skills: string[];
  skillLevels: Record<string, number>;
  statusChangedAt: string | null;
  whisper: string | null;
  whisperAt: string | null;
  virtual: boolean;
  work: WorkItem[];
  closedToday?: number;
}

export interface OmniState {
  presence: AgentPresence;
  offers: WorkItem[];
  active: WorkItem[];
  offerTimeoutSeconds: number;
  queued: number;
  analyzing: number;
  serverTime: string;
}

export interface Me {
  userId: string;
  name: string;
  email: string;
  presence: AgentPresence;
}

export interface ConversationMessage {
  id: string;
  sender: Sender;
  body: string;
  sentAt: string;
  sentiment: Sentiment | null;
}

export interface Conversation {
  work: WorkItem;
  messages: ConversationMessage[];
}

export interface QueueStat {
  name: string;
  count: number;
  oldestWaitSeconds: number;
  byChannel: Partial<Record<Channel, number>>;
}

export interface HomeStats {
  closedToday: number;
  avgHandleSeconds: number;
  sentiment: Record<Sentiment, number>;
  openCases: number;
  queues: QueueStat[];
  recent: WorkItem[];
}

export interface SupervisorAlert {
  severity: Severity;
  title: string;
  detail: string;
  workId?: string | null;
  agentId?: string | null;
}

export interface SupervisorSnapshot {
  kpis: {
    queued: number;
    active: number;
    closedToday: number;
    agentsOnline: number;
    agentsTotal: number;
    avgWaitSeconds: number;
    avgHandleSeconds: number;
  };
  agents: AgentPresence[];
  waiting: WorkItem[];
  queues: QueueStat[];
  alerts: SupervisorAlert[];
  history: { total: number; byChannel: Record<string, number> };
  serverTime: string;
}

export interface SupervisorInsights {
  headline: string;
  insights: {
    severity: Severity;
    title: string;
    detail: string;
    action: string;
  }[];
  staffing: string;
  generatedAt: string;
}

export interface CaseSummary {
  headline: string;
  summary: string;
  keyPoints: string[];
  sentiment: Sentiment;
  sentimentReason: string;
  customerContext: string;
  risk: 'low' | 'medium' | 'high';
  riskReason: string;
  generatedAt: string;
}

export type ActionPayload =
  | { type: 'updateStatus'; payload: { status: CaseStatus } }
  | { type: 'updatePriority'; payload: { priority: Priority } }
  | { type: 'createTask'; payload: { subject: string; dueInDays?: number } }
  | {
      type: 'linkArticle';
      payload: { knowledgeArticleId: string; articleId: string; title: string };
    }
  | { type: 'escalate'; payload: { reason: string } }
  | { type: 'sendEmail'; payload: { subject: string; body: string } }
  | { type: 'addComment'; payload: { body: string } };

export type ActionType = ActionPayload['type'];

export type NextBestAction = ActionPayload & {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
};

export interface KnowledgeMatch {
  id: string;
  knowledgeArticleId: string;
  title: string;
  articleNumber: string;
  summary: string | null;
  confidence: number;
  reason: string;
  snippet?: string;
  linked?: boolean;
}

export interface KnowledgeSuggestions {
  verdict: 'COVERED' | 'PARTIAL' | 'NOT_COVERED';
  summary: string;
  matches: KnowledgeMatch[];
}

export interface ReplySuggestions {
  intent: string;
  suggestions: { label: string; text: string }[];
}

export type AssistStage =
  'Understand' | 'Diagnose' | 'Resolve' | 'Confirm' | 'Follow up';

export interface AssistArticle {
  articleId: string;
  knowledgeArticleId: string;
  title: string;
  articleNumber: string | null;
  why: string;
  shareText: string;
  linked: boolean;
}

export interface AssistPlan {
  intent: string;
  stage: AssistStage;
  plan: { step: string; status: 'done' | 'current' | 'todo' }[];
  replies: { label: string; text: string }[];
  articles: AssistArticle[];
  email: {
    subject: string;
    body: string;
    why: string;
    to: string | null;
  } | null;
  actions: NextBestAction[];
  live: boolean;
  generatedAt: string;
}

export type NoteStyle = 'summary' | 'handoff' | 'nextSteps' | 'customer';

export interface DraftNote {
  text: string;
  style: NoteStyle;
  isPublic: boolean;
}

export type TimelineKind = 'case' | 'voice' | 'messaging' | 'email' | 'work';

export interface CustomerProfile {
  contact: {
    id: string;
    name: string;
    firstName: string | null;
    title: string | null;
    department: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    customerSince: string;
    owner: string | null;
    mobile: string | null;
    accountId: string | null;
  };
  account: {
    id: string;
    name: string;
    industry: string | null;
    type: string | null;
    phone: string | null;
    website: string | null;
    location: string | null;
    employees: number | null;
    totalCases: number;
    contacts: number;
  } | null;
  stats: {
    openCases: number;
    totalCases: number;
    escalated: number;
    avgResolutionMinutes: number | null;
    interactions30d: number;
    lastContact: string | null;
  };
  sentiment: Record<Sentiment, number>;
  channelMix: { Voice: number; Messaging: number; Case: number; Email: number };
  openCases: {
    id: string;
    caseNumber: string;
    subject: string | null;
    status: string;
    priority: string | null;
    createdDate: string;
  }[];
  timeline: {
    id: string;
    kind: TimelineKind;
    title: string | null;
    detail: string | null;
    summary?: string | null;
    sentiment?: Sentiment | null;
    at: string | null;
    recordId: string | null;
  }[];
  activity: { months: ({ month: string } & Record<ActivityChannel, number>)[] };
  colleagues: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    openCases: number;
  }[];
}

export type ActivityChannel = 'Case' | 'Voice' | 'Messaging' | 'Email';

export type MilestoneState = 'ok' | 'due' | 'breached' | 'met' | 'missed';

export interface Milestone {
  id: string;
  caseId: string;
  caseNumber: string | null;
  subject: string | null;
  priority: string | null;
  contactName: string | null;
  name: string | null;
  startDate: string | null;
  targetDate: string | null;
  completedDate: string | null;
  targetMinutes: number | null;
  state: MilestoneState;
}

export interface SlaWatch {
  breached: number;
  dueSoon: number;
  onTrack: number;
  items: Milestone[];
  serverTime: string;
}

export interface CaseSla {
  entitlement: string | null;
  slaStart: string | null;
  stopped: boolean;
  milestones: Milestone[];
  serverTime: string;
}

export interface Scorecard {
  days: { date: string; cases: number; conversations: number }[];
  casesClosed: number;
  casesClosedPrior: number;
  conversations: number;
  conversationsPrior: number;
  avgHandleSeconds: number;
  positivePct: number | null;
  slaMetPct: number | null;
  channels: Record<Channel, number>;
}

export interface FollowUpTask {
  id: string;
  subject: string | null;
  dueDate: string | null;
  priority: string | null;
  status: string | null;
  whatId: string | null;
  whatName: string | null;
  whatType: string | null;
  whoName: string | null;
  overdue: boolean;
}

export interface TaskList {
  overdue: number;
  dueToday: number;
  items: FollowUpTask[];
}

export type TrendDirection = 'rising' | 'steady' | 'new';

export interface TrendReport {
  headline: string;
  sampled: number;
  generatedAt: string;
  clusters: {
    label: string;
    count: number;
    urgent: number;
    trend: TrendDirection;
    insight: string;
    action: string;
    cases: { id: string; caseNumber: string; subject: string }[];
  }[];
}

export interface SimilarCases {
  terms: string[];
  items: {
    id: string;
    caseNumber: string;
    subject: string | null;
    priority: string | null;
    contactName: string | null;
    closedDate: string | null;
    resolutionMinutes: number | null;
    resolution: string | null;
    matched: string[];
  }[];
}

export type MarkerKind =
  | 'issue'
  | 'objection'
  | 'escalation'
  | 'commitment'
  | 'resolution'
  | 'compliance'
  | 'competitor'
  | 'pricing'
  | 'emotion';

export type KeywordCategory =
  'product' | 'issue' | 'competitor' | 'emotion' | 'commitment' | 'pricing';

export interface CallMarker {
  messageId: string;
  turn: number;
  kind: MarkerKind;
  label: string;
  detail: string;
}

export interface CallAnalysis {
  headline: string;
  summary: string;
  customerIntent: string;
  outcome: 'Resolved' | 'Follow-up needed' | 'Escalated' | 'Unresolved';
  outcomeReason: string;
  scores: {
    empathy: number;
    clarity: number;
    resolution: number;
    compliance: number;
    overall: number;
  };
  markers: CallMarker[];
  keywords: { term: string; category: KeywordCategory }[];
  strengths: string[];
  improvements: string[];
  generatedAt: string;
}

export interface CustomerInsight {
  headline: string;
  summary: string;
  relationship: 'Strong' | 'Stable' | 'At risk';
  relationshipReason: string;
  caresAbout: string[];
  approach: string;
  talkingPoints: string[];
  generatedAt: string;
}

export interface AccountProfile {
  account: {
    id: string;
    name: string;
    industry: string | null;
    type: string | null;
    phone: string | null;
    website: string | null;
    rating: string | null;
    annualRevenue: number | null;
    employees: number | null;
    ownership: string | null;
    description: string | null;
    address: string | null;
    location: string | null;
    owner: string | null;
    customerSince: string;
    parent: { id: string; name: string } | null;
  };
  stats: {
    openCases: number;
    urgentOpen: number;
    totalCases: number;
    sampled: number;
    escalated: number;
    opened30d: number;
    conversations30d: number;
    avgResolutionMinutes: number | null;
    contacts: number;
    lastContact: string | null;
  };
  caseMix: {
    byPriority: Record<string, number>;
    byStatus: Record<string, number>;
    byType: { label: string; count: number }[];
  };
  sentiment: CustomerProfile['sentiment'];
  channelMix: CustomerProfile['channelMix'];
  openCases: (CustomerProfile['openCases'][number] & {
    contactName: string | null;
  })[];
  timeline: CustomerProfile['timeline'];
  activity: CustomerProfile['activity'];
  contacts: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    openCases: number;
    totalCases: number;
    lastCase: string | null;
  }[];
  service: {
    entitlements: {
      id: string;
      name: string;
      status: string | null;
      type: string | null;
      process: string | null;
      startDate: string | null;
      endDate: string | null;
    }[];
    met: number;
    missed: number;
    breachedOpen: number;
    inFlight: number;
    metPct: number | null;
  };
  assets: {
    id: string;
    name: string;
    product: string | null;
    status: string | null;
    serialNumber: string | null;
    installDate: string | null;
    usageEndDate: string | null;
    quantity: number | null;
  }[];
  pipeline: {
    openAmount: number;
    openCount: number;
    wonLastYear: number;
    items: {
      id: string;
      name: string;
      stage: string;
      amount: number | null;
      closeDate: string;
      probability: number | null;
      owner: string | null;
    }[];
  };
}

export interface SavedLayout {
  config: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface LayoutsResponse {
  canEdit: boolean;
  layouts: Record<string, SavedLayout | undefined>;
}

export interface Coaching {
  sentiment: Sentiment;
  sentimentScore: number;
  customerIntent: string;
  nextLine: string;
  tips: string[];
  checklist: { label: string; done: boolean }[];
  warnings: string[];
}

export interface WrapUp {
  summary: string;
  resolution: string;
  disposition: string;
  caseStatus: CaseStatus;
  sentiment: Sentiment;
  followUps: string[];
}

export interface FocusList {
  headline: string;
  items: {
    caseId: string;
    caseNumber: string;
    subject: string;
    priority: Priority;
    reason: string;
  }[];
}

export interface CaseEmail {
  id: string;
  subject: string | null;
  body: string | null;
  fromAddress: string | null;
  fromName: string | null;
  toAddress: string | null;
  incoming: boolean;
  sentAt: string | null;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface SimulateRequest {
  channel: Channel;
  caseId?: string;
  brief?: string;
  priority?: Priority;
}

const enc = encodeURIComponent;

export const consoleApi = {
  me: () => apexRequest<Me>('GET', 'me'),
  home: () => apexRequest<HomeStats>('GET', 'home'),
  supervisor: () => apexRequest<SupervisorSnapshot>('GET', 'supervisor'),
  conversation: (workId: string) =>
    apexRequest<Conversation>('GET', `work/${enc(workId)}`),
  caseEmails: (caseId: string) =>
    apexRequest<CaseEmail[]>('GET', `case/${enc(caseId)}/emails`),

  sync: () => apexRequest<OmniState>('POST', 'omni/sync'),
  setPresence: (status: PresenceStatus) =>
    apexRequest<OmniState>('POST', 'presence', { status }),
  simulate: (request: SimulateRequest) =>
    apexRequest<WorkItem>('POST', 'simulate', request),

  accept: (workId: string) =>
    apexRequest<WorkItem>('POST', `work/${enc(workId)}/accept`),
  decline: (workId: string) =>
    apexRequest<WorkItem>('POST', `work/${enc(workId)}/decline`),
  hold: (workId: string, onHold: boolean) =>
    apexRequest<WorkItem>('POST', `work/${enc(workId)}/hold`, { onHold }),
  transfer: (workId: string, queue: string, skill?: string) =>
    apexRequest<WorkItem>('POST', `work/${enc(workId)}/transfer`, {
      queue,
      skill,
    }),
  reassign: (workId: string, userId: string) =>
    apexRequest<WorkItem>('POST', `work/${enc(workId)}/reassign`, { userId }),
  close: (
    workId: string,
    summary: string,
    caseStatus: CaseStatus,
    sentiment: Sentiment
  ) =>
    apexRequest<WorkItem>('POST', `work/${enc(workId)}/close`, {
      summary,
      caseStatus,
      sentiment,
    }),
  send: (workId: string, body: string) =>
    apexRequest<Conversation>('POST', `work/${enc(workId)}/send`, { body }),
  tick: (workId: string) =>
    apexRequest<Conversation>('POST', `work/${enc(workId)}/tick`),

  executeAction: (caseId: string, action: ActionPayload) =>
    apexRequest<ActionResult>('POST', `case/${enc(caseId)}/action`, action),

  supervisorInsights: () =>
    apexRequest<SupervisorInsights>('POST', 'supervisor/insights'),
  setAgentStatus: (userId: string, status: PresenceStatus) =>
    apexRequest<OmniState>('POST', `supervisor/agents/${enc(userId)}/status`, {
      status,
    }),
  whisper: (userId: string, text: string) =>
    apexRequest<AgentPresence>(
      'POST',
      `supervisor/agents/${enc(userId)}/whisper`,
      { text }
    ),

  rewrite: (text: string, tone: string) =>
    apexRequest<{ text: string }>('POST', 'ai/rewrite', { text, tone }),
  focus: () => apexRequest<FocusList>('POST', 'ai/focus'),
  caseSummary: (caseId: string) =>
    apexRequest<CaseSummary>('POST', `ai/case/${enc(caseId)}/summary`),
  nextBestActions: (caseId: string) =>
    apexRequest<{ actions: NextBestAction[]; generatedAt: string }>(
      'POST',
      `ai/case/${enc(caseId)}/actions`
    ),
  knowledge: (caseId: string) =>
    apexRequest<KnowledgeSuggestions>(
      'POST',
      `ai/case/${enc(caseId)}/knowledge`
    ),
  draftNote: (caseId: string, style: NoteStyle, notes: string) =>
    apexRequest<DraftNote>('POST', `ai/case/${enc(caseId)}/note`, {
      style,
      notes,
    }),
  assist: (caseId: string, workId?: string | null) =>
    apexRequest<AssistPlan>(
      'POST',
      `ai/case/${enc(caseId)}/assist`,
      workId ? { workId } : {}
    ),
  replySuggestions: (workId: string) =>
    apexRequest<ReplySuggestions>('POST', `ai/work/${enc(workId)}/replies`),
  coach: (workId: string) =>
    apexRequest<Coaching>('POST', `ai/work/${enc(workId)}/coach`),
  wrapUp: (workId: string) =>
    apexRequest<WrapUp>('POST', `ai/work/${enc(workId)}/wrapup`),
  customer: (recordId: string) =>
    apexRequest<CustomerProfile>('GET', `customer/${enc(recordId)}`),
  workRouting: (workId: string) =>
    apexRequest<WorkRouting>('GET', `work/${enc(workId)}/routing`),
  caseRouting: (caseId: string) =>
    apexRequest<WorkRouting>('GET', `case/${enc(caseId)}/routing`),
  routingFeed: () => apexRequest<RoutingFeed>('GET', 'routing/feed'),
  skillCatalog: () => apexRequest<CatalogSkill[]>('GET', 'routing/skills'),
  retagWork: (workId: string, skills: string[], required: string | null) =>
    apexRequest<WorkRouting>('POST', `work/${enc(workId)}/skills`, {
      skills,
      required,
    }),
  retriage: (workId: string) =>
    apexRequest<WorkRouting>('POST', `ai/work/${enc(workId)}/triage`),
  account: (recordId: string) =>
    apexRequest<AccountProfile>('GET', `account/${enc(recordId)}`),
  accountInsight: (recordId: string) =>
    apexRequest<CustomerInsight>('POST', `ai/account/${enc(recordId)}/insight`),
  customerInsight: (recordId: string) =>
    apexRequest<CustomerInsight>(
      'POST',
      `ai/customer/${enc(recordId)}/insight`
    ),
  slaWatch: () => apexRequest<SlaWatch>('GET', 'home/sla'),
  scorecard: () => apexRequest<Scorecard>('GET', 'home/scorecard'),
  tasks: () => apexRequest<TaskList>('GET', 'home/tasks'),
  completeTask: (taskId: string) =>
    apexRequest<{ ok: boolean }>('POST', `tasks/${enc(taskId)}/complete`),
  trends: () => apexRequest<TrendReport>('POST', 'ai/trends'),
  caseSla: (caseId: string) =>
    apexRequest<CaseSla>('GET', `case/${enc(caseId)}/sla`),
  similarCases: (caseId: string) =>
    apexRequest<SimilarCases>('GET', `case/${enc(caseId)}/similar`),
  analysis: (workId: string, refresh = false) =>
    apexRequest<CallAnalysis>('POST', `ai/work/${enc(workId)}/analysis`, {
      refresh,
    }),
  layouts: () => apexRequest<LayoutsResponse>('GET', 'layouts'),
  saveLayout: (page: string, config: object) =>
    apexRequest<{ ok: boolean; updatedAt: string; updatedBy: string }>(
      'POST',
      `layouts/${enc(page)}`,
      { config }
    ),
  resetLayout: (page: string) =>
    apexRequest<{ ok: boolean }>('POST', `layouts/${enc(page)}/reset`),
};
