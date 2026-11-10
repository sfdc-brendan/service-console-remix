import {
  Activity,
  Route,
  BrainCircuit,
  CalendarCheck2,
  Flame,
  History,
  NotebookPen,
  Search,
  Timer,
  TimerReset,
  Trophy,
  UserRound,
  Waves,
  BarChart3,
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  Contact,
  FileText,
  GaugeCircle,
  Hourglass,
  Layers,
  LayoutList,
  ListTree,
  MessageCircleReply,
  MessageSquareText,
  PhoneCall,
  Radio,
  Sparkles,
  UserRoundCog,
  Users,
  Voicemail,
  Zap,
} from 'lucide-react';
import { defineLayout } from './layoutModel';

const LIVE_ONLY = 'Appears while a conversation is live.';

export const HOME_LAYOUT = defineLayout({
  page: 'home',
  label: 'Home',
  panels: [
    {
      id: 'activeWork',
      label: 'Active work',
      description: 'Live voice, messaging, and case work you have accepted.',
      icon: Radio,
    },
    {
      id: 'myCases',
      label: 'My open cases',
      description: 'Open cases you own, newest first.',
      icon: Briefcase,
    },
    {
      id: 'focus',
      label: 'Focus for today',
      description: 'AI-ranked cases that need attention first.',
      icon: Sparkles,
    },
    {
      id: 'queuePulse',
      label: 'Queue pulse',
      description: 'Queue depth by channel and your sentiment mix today.',
      icon: Activity,
    },
    {
      id: 'activity',
      label: 'Recent channel activity',
      description: 'Latest calls and messaging sessions.',
      icon: Radio,
    },
    {
      id: 'scorecard',
      label: 'My week',
      description:
        'Seven days of closed work against a daily goal, with SLA and sentiment.',
      icon: Trophy,
    },
    {
      id: 'sla',
      label: 'SLA watch',
      description: 'Entitlement milestones on your cases, soonest first.',
      icon: TimerReset,
    },
    {
      id: 'tasks',
      label: 'Follow-ups',
      description: 'Open tasks you own with one-click complete.',
      icon: CalendarCheck2,
    },
    {
      id: 'trends',
      label: 'Trending issues',
      description: "AI clusters of this week's new cases.",
      icon: Flame,
    },
  ],
  defaults: {
    template: 'main-right',
    regions: {
      main: ['activeWork', 'scorecard', 'myCases', 'trends'],
      right: ['focus', 'sla', 'tasks', 'queuePulse', 'activity'],
    },
  },
  header: {
    stats: [
      {
        id: 'closedToday',
        label: 'Closed today',
        shortLabel: 'Closed',
        description: 'Cases you closed since midnight.',
        icon: CheckCircle2,
      },
      {
        id: 'avgHandle',
        label: 'Avg handle',
        shortLabel: 'AHT',
        description: 'Your average handle time today.',
        icon: Timer,
      },
      {
        id: 'openCases',
        label: 'Open cases',
        shortLabel: 'Open',
        description: 'Open cases you own.',
        icon: Briefcase,
      },
      {
        id: 'inQueue',
        label: 'In queue',
        shortLabel: 'Queue',
        description: 'Work waiting in your Omni-Channel queues.',
        icon: Hourglass,
      },
    ],
    defaults: {
      stats: ['closedToday', 'avgHandle', 'openCases', 'inQueue'],
    },
  },
});

export type HomeStatId = NonNullable<
  typeof HOME_LAYOUT.header
>['stats'][number]['id'];

export const CASE_LAYOUT = defineLayout({
  page: 'case',
  label: 'Case',
  panels: [
    {
      id: 'contact',
      label: 'Contact',
      description: 'Who the customer is and how to reach them.',
      icon: Contact,
    },
    {
      id: 'details',
      label: 'Case details',
      description: 'Owner, type, reason, dates, and description.',
      icon: UserRoundCog,
    },
    {
      id: 'account',
      label: 'Account',
      description: 'Account profile for the customer.',
      icon: Building2,
    },
    {
      id: 'related',
      label: 'Related cases',
      description: 'Other cases on the same account.',
      icon: ListTree,
    },
    {
      id: 'summary',
      label: 'AI case summary',
      description: 'Ten-second briefing, sentiment, and risk.',
      icon: FileText,
    },
    {
      id: 'feed',
      label: 'Activity feed',
      description: 'Comments, emails, and tasks with a composer.',
      icon: LayoutList,
    },
    {
      id: 'assistant',
      label: 'Service Assistant',
      description:
        'Step-by-step plan, articles to share, and a drafted email reply.',
      icon: Sparkles,
    },
    {
      id: 'actions',
      label: 'Next best actions',
      description: 'One-click AI recommended actions.',
      icon: Zap,
    },
    {
      id: 'knowledge',
      label: 'Knowledge',
      description: 'Recommended articles to attach or use.',
      icon: BookOpen,
    },
    {
      id: 'sla',
      label: 'SLA clock',
      description: 'Entitlement milestones with a live countdown.',
      icon: TimerReset,
    },
    {
      id: 'similar',
      label: 'Similar resolved cases',
      description: 'Closed cases like this one and how they were fixed.',
      icon: Search,
    },
    {
      id: 'history',
      label: 'Customer history',
      description: "The customer's calls, chats, cases, and email.",
      icon: History,
      conditional: 'Appears when the case has a contact.',
    },
    {
      id: 'routing',
      label: 'Routing & skills',
      description:
        'AI triage, tagged skills, agent scoring, and every routing event.',
      icon: Route,
    },
  ],
  defaults: {
    template: 'three',
    regions: {
      left: ['contact', 'details', 'history', 'account', 'related'],
      main: ['summary', 'feed', 'similar'],
      right: ['routing', 'sla', 'assistant', 'knowledge'],
    },
    hidden: ['actions'],
    leftWidth: 'narrow',
  },
});

export const VOICE_LAYOUT = defineLayout({
  page: 'voice',
  label: 'Voice call',
  panels: [
    {
      id: 'routing',
      label: 'Routing & skills',
      description:
        'Why this call reached you: AI triage, skills, and agent scoring.',
      icon: Route,
    },
    {
      id: 'playback',
      label: 'Call playback',
      description:
        'Replay the call on a timeline with markers, keywords, and a synced transcript.',
      icon: Waves,
      conditional: 'Appears after the call ends.',
    },
    {
      id: 'analysis',
      label: 'Call analysis',
      description: 'AI outcome, quality scores, key moments, and coaching.',
      icon: BrainCircuit,
      conditional: 'Appears after the call ends.',
    },
    {
      id: 'transcript',
      label: 'Live transcript',
      description: 'Real-time transcript with a speak box.',
      icon: Voicemail,
      conditional: 'Replaced by playback after the call ends.',
    },
    {
      id: 'customer',
      label: 'Customer snapshot',
      description: 'Health, AI read, and recent history for the customer.',
      icon: UserRound,
      conditional: 'Appears when a customer is identified.',
    },
    {
      id: 'pace',
      label: 'Response pace',
      description: 'Customer wait time, response times, and talk share.',
      icon: Timer,
      conditional: LIVE_ONLY,
    },
    {
      id: 'notes',
      label: 'My notes',
      description: 'Private scratchpad with timestamps; save to the case.',
      icon: NotebookPen,
    },
    {
      id: 'sla',
      label: 'SLA clock',
      description: 'Entitlement milestones on the linked case.',
      icon: TimerReset,
      conditional: 'Appears when linked to a case.',
    },
    {
      id: 'wrapSummary',
      label: 'Wrap-up summary',
      description: 'Summary written when the call closed.',
      icon: CheckCircle2,
      conditional: 'Appears after the call is wrapped up.',
    },
    {
      id: 'callDetails',
      label: 'Call details',
      description: 'Numbers, type, start time, and disposition.',
      icon: PhoneCall,
    },
    {
      id: 'assistant',
      label: 'Service Assistant',
      description: 'Live plan, lines to say, and articles to share.',
      icon: Sparkles,
      conditional: 'Appears when the call is linked to a case.',
    },
    {
      id: 'coach',
      label: 'Real-time coaching',
      description: 'Sentiment gauge, next line, and checklist.',
      icon: GaugeCircle,
      conditional: LIVE_ONLY,
    },
    {
      id: 'caseContext',
      label: 'Case context',
      description: 'Summary, actions, and knowledge for the linked case.',
      icon: Briefcase,
      conditional: 'Appears when the call is linked to a case.',
    },
  ],
  defaults: {
    template: 'main-right',
    regions: {
      main: ['playback', 'transcript', 'wrapSummary', 'callDetails'],
      right: [
        'analysis',
        'customer',
        'routing',
        'assistant',
        'coach',
        'pace',
        'notes',
        'sla',
        'caseContext',
      ],
    },
    rightWidth: 'wide',
  },
});

export const MESSAGING_LAYOUT = defineLayout({
  page: 'messaging',
  label: 'Messaging session',
  panels: [
    {
      id: 'routing',
      label: 'Routing & skills',
      description:
        'Why this chat reached you: AI triage, skills, and agent scoring.',
      icon: Route,
    },
    {
      id: 'conversation',
      label: 'Conversation',
      description: 'Chat thread, controls, and reply composer.',
      icon: MessageSquareText,
    },
    {
      id: 'analysis',
      label: 'Conversation analysis',
      description: 'AI outcome, quality scores, key moments, and coaching.',
      icon: BrainCircuit,
      conditional: 'Appears after the session ends.',
    },
    {
      id: 'customer',
      label: 'Customer snapshot',
      description: 'Health, AI read, and recent history for the customer.',
      icon: UserRound,
      conditional: 'Appears when a customer is identified.',
    },
    {
      id: 'pace',
      label: 'Response pace',
      description: 'Customer wait time, response times, and talk share.',
      icon: Timer,
      conditional: LIVE_ONLY,
    },
    {
      id: 'notes',
      label: 'My notes',
      description: 'Private scratchpad with timestamps; save to the case.',
      icon: NotebookPen,
    },
    {
      id: 'sla',
      label: 'SLA clock',
      description: 'Entitlement milestones on the linked case.',
      icon: TimerReset,
      conditional: 'Appears when linked to a case.',
    },
    {
      id: 'assistant',
      label: 'Service Assistant',
      description:
        'Recommended replies, articles to share, and follow-up email.',
      icon: Sparkles,
      conditional: 'Appears when the session is linked to a case.',
    },
    {
      id: 'replies',
      label: 'Quick replies',
      description: 'Three fast AI reply drafts.',
      icon: MessageCircleReply,
      conditional: LIVE_ONLY,
    },
    {
      id: 'coach',
      label: 'Conversation insights',
      description: 'Sentiment gauge, intent, and checklist.',
      icon: GaugeCircle,
      conditional: LIVE_ONLY,
    },
    {
      id: 'wrapSummary',
      label: 'Wrap-up summary',
      description: 'Summary written when the session closed.',
      icon: CheckCircle2,
      conditional: 'Appears after the session is wrapped up.',
    },
    {
      id: 'caseContext',
      label: 'Case context',
      description: 'Summary, actions, and knowledge for the linked case.',
      icon: Briefcase,
      conditional: 'Appears when the session is linked to a case.',
    },
    {
      id: 'session',
      label: 'Session details',
      description: 'Session name, status, origin, and times.',
      icon: MessageSquareText,
    },
  ],
  defaults: {
    template: 'main-right',
    regions: {
      main: ['conversation'],
      right: [
        'customer',
        'routing',
        'assistant',
        'coach',
        'pace',
        'analysis',
        'wrapSummary',
        'notes',
        'sla',
        'caseContext',
        'session',
      ],
    },
    hidden: ['replies'],
    rightWidth: 'wide',
  },
});

export const SUPERVISOR_LAYOUT = defineLayout({
  page: 'supervisor',
  label: 'Command Center',
  panels: [
    {
      id: 'routing',
      label: 'Live routing',
      description: 'AI triage and skill matches as work is routed.',
      icon: Route,
    },
    {
      id: 'agents',
      label: 'Agents',
      description: 'Agent grid with status, capacity, and work.',
      icon: Users,
    },
    {
      id: 'queues',
      label: 'Queue board',
      description: 'Queue depth, oldest wait, and channel mix.',
      icon: Layers,
    },
    {
      id: 'history',
      label: 'Omni-Channel history',
      description: 'Routed work over the last 30 days.',
      icon: BarChart3,
    },
    {
      id: 'waiting',
      label: 'Waiting for an agent',
      description: 'Queued work you can assign by hand.',
      icon: Hourglass,
    },
    {
      id: 'alerts',
      label: 'Live alerts',
      description: 'SLA, sentiment, and capacity risks.',
      icon: BellRing,
    },
    {
      id: 'insights',
      label: 'AI floor insights',
      description: 'AI read of the floor with recommendations.',
      icon: Sparkles,
    },
  ],
  defaults: {
    template: 'main-right',
    regions: {
      main: ['agents', 'routing', 'queues', 'history'],
      right: ['waiting', 'alerts', 'insights'],
    },
    panels: { queues: { span: 'half' }, history: { span: 'half' } },
    rightWidth: 'wide',
  },
});

export const CONTACT_LAYOUT = defineLayout({
  page: 'contact',
  label: 'Contact',
  panels: [
    {
      id: 'stats',
      label: 'Key metrics',
      description: 'Cases, resolution time, and recent touches.',
      icon: BarChart3,
    },
    {
      id: 'activity',
      label: 'Engagement',
      description: 'Twelve months of interactions by channel.',
      icon: Activity,
    },
    {
      id: 'timeline',
      label: 'Interaction timeline',
      description: 'Every call, chat, case, and email, filterable.',
      icon: History,
    },
    {
      id: 'briefing',
      label: 'AI briefing',
      description:
        'Who they are, what they care about, and how to approach them.',
      icon: Sparkles,
    },
    {
      id: 'openCases',
      label: 'Open cases',
      description: 'Cases still in progress for this contact.',
      icon: Briefcase,
    },
    {
      id: 'sentiment',
      label: 'Sentiment & channels',
      description: 'How conversations felt and where they happen.',
      icon: GaugeCircle,
    },
    {
      id: 'details',
      label: 'Contact details',
      description: 'Reach, location, owner, and account facts.',
      icon: Contact,
    },
    {
      id: 'colleagues',
      label: 'People at the account',
      description: 'Other contacts on the same account.',
      icon: Users,
      conditional: 'Appears when the contact has an account.',
    },
  ],
  defaults: {
    template: 'three',
    regions: {
      left: ['details', 'colleagues'],
      main: ['stats', 'activity', 'timeline'],
      right: ['briefing', 'openCases', 'sentiment'],
    },
    leftWidth: 'narrow',
  },
});

export const ACCOUNT_LAYOUT = defineLayout({
  page: 'account',
  label: 'Account',
  panels: [
    {
      id: 'stats',
      label: 'Account metrics',
      description: 'Open and urgent cases, resolution time, and reach.',
      icon: BarChart3,
    },
    {
      id: 'activity',
      label: 'Engagement',
      description: 'Twelve months of interactions across every contact.',
      icon: Activity,
    },
    {
      id: 'caseMix',
      label: 'Case breakdown',
      description: 'Open work by priority and status, and the top case types.',
      icon: Layers,
    },
    {
      id: 'timeline',
      label: 'Account timeline',
      description: 'Every call, chat, case, and email on the account.',
      icon: History,
    },
    {
      id: 'briefing',
      label: 'AI account briefing',
      description: 'Relationship health, recurring themes, and next moves.',
      icon: Sparkles,
    },
    {
      id: 'service',
      label: 'Entitlements & SLA',
      description: 'Support entitlements and 90-day milestone performance.',
      icon: Timer,
    },
    {
      id: 'openCases',
      label: 'Open cases',
      description: 'Everything still in progress, with who raised it.',
      icon: Briefcase,
    },
    {
      id: 'pipeline',
      label: 'Open opportunities',
      description:
        'Renewals and deals in flight, so service knows what is at stake.',
      icon: Trophy,
      conditional: 'Appears when the account has open or recently won deals.',
    },
    {
      id: 'sentiment',
      label: 'Sentiment & channels',
      description: 'How conversations felt and where they happen.',
      icon: GaugeCircle,
    },
    {
      id: 'details',
      label: 'Account details',
      description: 'Industry, size, address, owner, and hierarchy.',
      icon: Building2,
    },
    {
      id: 'contacts',
      label: 'People',
      description: 'Contacts on the account, ranked by open work.',
      icon: Users,
    },
    {
      id: 'assets',
      label: 'Assets',
      description: 'Installed products and their support coverage.',
      icon: LayoutList,
      conditional: 'Appears when the account has assets.',
    },
  ],
  defaults: {
    template: 'three',
    regions: {
      left: ['details', 'contacts', 'assets'],
      main: ['stats', 'activity', 'caseMix', 'timeline'],
      right: ['briefing', 'service', 'openCases', 'pipeline', 'sentiment'],
    },
    leftWidth: 'narrow',
  },
});
