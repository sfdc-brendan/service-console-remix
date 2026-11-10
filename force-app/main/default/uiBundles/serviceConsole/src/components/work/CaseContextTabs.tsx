import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CaseSummaryCard } from '@/components/ai/CaseSummaryCard';
import { NextBestActions } from '@/components/ai/NextBestActions';
import { KnowledgePanel } from '@/components/ai/KnowledgePanel';

type ContextTab = 'summary' | 'actions' | 'knowledge';

function isContextTab(value: string): value is ContextTab {
  return value === 'summary' || value === 'actions' || value === 'knowledge';
}

export function CaseContextTabs({
  caseId,
  caseNumber,
  onInsert,
  defaultTab = 'summary',
}: {
  caseId: string;
  caseNumber: string | null;
  onInsert?: (text: string) => void;
  defaultTab?: ContextTab;
}) {
  const [tab, setTab] = useState<ContextTab>(defaultTab);
  const [visited, setVisited] = useState<Set<ContextTab>>(() => new Set([defaultTab]));

  const select = (value: string) => {
    if (isContextTab(value)) {
      setTab(value);
      setVisited(prev => new Set(prev).add(value));
    }
  };

  const panel = (value: ContextTab, content: ReactNode) => (
    <TabsContent value={value} forceMount className="data-[state=inactive]:hidden">
      {visited.has(value) ? content : null}
    </TabsContent>
  );

  return (
    <Tabs value={tab} onValueChange={select} className="gap-3">
      <div className="flex items-center gap-2">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>
        <Link to={`/case/${caseId}`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-case hover:underline">
          Case {caseNumber} <ExternalLink className="size-3" aria-hidden="true" />
        </Link>
      </div>
      {panel('summary', <CaseSummaryCard caseId={caseId} />)}
      {panel('actions', <NextBestActions caseId={caseId} />)}
      {panel('knowledge', <KnowledgePanel caseId={caseId} onInsert={onInsert} />)}
    </Tabs>
  );
}
