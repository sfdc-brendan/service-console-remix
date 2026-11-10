/**
 * AI gap analysis: groups uncovered cases into themes, decides whether each theme needs a
 * new article (Missing Content) or just needs an existing article attached (Unlinked
 * Content), and closes gaps by linking articles back to the member cases.
 */
public with sharing class SLK_GapService {
    private static final Integer SUBJECT_SAMPLE = 70;
    private static final Integer MAX_LINKS_PER_GAP = 2000;
    private static final Set<String> PRIORITIES = new Set<String>{ 'Critical', 'High', 'Medium', 'Low' };
    private static final Set<String> ACTIVE_STATUSES = new Set<String>{ 'Drafting', 'In Review', 'Covered', 'Dismissed' };

    public class GapException extends Exception {
    }

    public static Map<String, Object> analyze() {
        Set<String> claimedSubjects = claimedSubjects();

        List<String> subjects = new List<String>();
        Map<String, Integer> subjectCounts = new Map<String, Integer>();
        for (AggregateResult row : [
            SELECT Subject subj, COUNT(Id) total
            FROM Case
            WHERE Subject != NULL AND Id NOT IN (SELECT CaseId FROM CaseArticle)
            GROUP BY Subject
            ORDER BY COUNT(Id) DESC
            LIMIT 150
        ]) {
            String subject = (String) row.get('subj');
            if (claimedSubjects.contains(subject.toLowerCase()) || subjects.size() >= SUBJECT_SAMPLE) {
                continue;
            }
            subjects.add(subject);
            subjectCounts.put(subject, (Integer) row.get('total'));
        }
        if (subjects.isEmpty()) {
            return new Map<String, Object>{ 'created' => 0, 'message' => 'No uncovered case themes left to analyze.' };
        }

        Map<String, String> sampleDescription = new Map<String, String>();
        Map<String, Map<String, Integer>> typeVotes = new Map<String, Map<String, Integer>>();
        for (Case c : [
            SELECT Subject, Description, Type
            FROM Case
            WHERE Subject IN :subjects AND Id NOT IN (SELECT CaseId FROM CaseArticle)
            ORDER BY CreatedDate DESC
            LIMIT 3000
        ]) {
            if (!sampleDescription.containsKey(c.Subject) && String.isNotBlank(c.Description)) {
                sampleDescription.put(c.Subject, SLK_AIService.truncate(c.Description, 260));
            }
            Map<String, Integer> votes = typeVotes.containsKey(c.Subject) ? typeVotes.get(c.Subject) : new Map<String, Integer>();
            String caseType = String.isBlank(c.Type) ? 'Unspecified' : c.Type;
            votes.put(caseType, (votes.containsKey(caseType) ? votes.get(caseType) : 0) + 1);
            typeVotes.put(c.Subject, votes);
        }

        List<Knowledge__kav> catalog = [
            SELECT KnowledgeArticleId, Title
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = 'en_US'
            ORDER BY LastPublishedDate DESC
            LIMIT 600
        ];

        String subjectBlock = '';
        for (Integer i = 0; i < subjects.size(); i++) {
            String subject = subjects[i];
            subjectBlock +=
                'S' + (i + 1) + ' | ' + subjectCounts.get(subject) + ' cases | ' + subject +
                (sampleDescription.containsKey(subject) ? ' | e.g. ' + sampleDescription.get(subject) : '') + '\n';
        }
        String catalogBlock = '';
        for (Integer i = 0; i < catalog.size(); i++) {
            catalogBlock += 'A' + (i + 1) + ' | ' + catalog[i].Title + '\n';
        }

        String systemPrompt =
            'You are a Knowledge-Centered Service (KCS) analyst. You study support cases that have no knowledge article ' +
            'attached and decide how to close each knowledge gap.';
        String userPrompt =
            'UNCOVERED CASE SUBJECTS (id | uncovered case count | subject | sample description):\n' + subjectBlock +
            '\nPUBLISHED ARTICLE CATALOG (id | title):\n' + catalogBlock +
            '\nTASK:\n' +
            '1. Group subjects describing the same customer problem into themes. Every theme lists its subject ids.\n' +
            '2. Classify each theme:\n' +
            '   - "UNLINKED" when a catalog article clearly resolves the problem (agents simply did not attach it). Give its article id.\n' +
            '   - "MISSING" when no catalog article resolves it and a new article is needed.\n' +
            '   - "NOISE" for generic subjects with no specific problem (e.g. "Inbound Support call", "Chat conversation").\n' +
            '3. Return at most 14 themes, ordered by total case count, skipping NOISE themes from the output entirely.\n' +
            'JSON shape: {"themes":[{"name":"short theme name","kind":"MISSING|UNLINKED","subjectIds":["S1"],' +
            '"articleId":"A3 or null","suggestedTitle":"customer-language article title","articleType":"KCS|FAQ",' +
            '"priority":"Critical|High|Medium|Low","impactScore":0-100,"description":"one-sentence customer problem",' +
            '"rationale":"one sentence on why you grouped and classified it this way","keywords":["k1","k2"]}]}';

        Map<String, Object> result = SLK_AIService.generateJson(systemPrompt, userPrompt);

        String runId = 'RUN-' + Datetime.now().format('yyyyMMddHHmmss');
        List<SLK_Knowledge_Gap__c> gaps = new List<SLK_Knowledge_Gap__c>();
        for (Object item : SLK_AIService.getList(result, 'themes')) {
            if (!(item instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> theme = (Map<String, Object>) item;
            String kind = SLK_AIService.getStr(theme, 'kind');
            if (kind != 'MISSING' && kind != 'UNLINKED') {
                continue;
            }
            List<String> members = new List<String>();
            Integer caseCount = 0;
            Map<String, Integer> themeVotes = new Map<String, Integer>();
            for (Object sid : SLK_AIService.getList(theme, 'subjectIds')) {
                Integer idx = parseIndex(String.valueOf(sid), 'S');
                if (idx == null || idx < 1 || idx > subjects.size()) {
                    continue;
                }
                String subject = subjects[idx - 1];
                if (members.contains(subject)) {
                    continue;
                }
                members.add(subject);
                caseCount += subjectCounts.get(subject);
                Map<String, Integer> votes = typeVotes.get(subject);
                if (votes != null) {
                    for (String t : votes.keySet()) {
                        themeVotes.put(t, (themeVotes.containsKey(t) ? themeVotes.get(t) : 0) + votes.get(t));
                    }
                }
            }
            if (members.isEmpty()) {
                continue;
            }

            Knowledge__kav matched;
            Integer articleIdx = parseIndex(SLK_AIService.getStr(theme, 'articleId'), 'A');
            if (kind == 'UNLINKED' && articleIdx != null && articleIdx >= 1 && articleIdx <= catalog.size()) {
                matched = catalog[articleIdx - 1];
            }
            if (kind == 'UNLINKED' && matched == null) {
                kind = 'MISSING';
            }

            List<String> keywords = new List<String>();
            for (Object k : SLK_AIService.getList(theme, 'keywords')) {
                keywords.add(String.valueOf(k));
            }

            gaps.add(
                new SLK_Knowledge_Gap__c(
                    Name = SLK_AIService.truncate(SLK_AIService.getStr(theme, 'name'), 80),
                    Gap_Kind__c = kind == 'UNLINKED' ? 'Unlinked Content' : 'Missing Content',
                    Status__c = 'Open',
                    Priority__c = SLK_AIService.pick(SLK_AIService.getStr(theme, 'priority'), PRIORITIES, 'Medium'),
                    Impact_Score__c = Math.min(Math.max(SLK_AIService.getInt(theme, 'impactScore', 50), 0), 100),
                    Case_Count__c = caseCount,
                    Description__c = SLK_AIService.getStr(theme, 'description'),
                    AI_Rationale__c = SLK_AIService.getStr(theme, 'rationale'),
                    Member_Subjects__c = String.join(members, '\n'),
                    Suggested_Title__c = SLK_AIService.truncate(SLK_AIService.getStr(theme, 'suggestedTitle'), 255),
                    Suggested_Article_Type__c = SLK_AIService.getStr(theme, 'articleType') == 'FAQ' ? 'FAQ' : 'KCS',
                    Keywords__c = SLK_AIService.truncate(String.join(keywords, ', '), 255),
                    Case_Category__c = topVote(themeVotes),
                    Matched_Article_Id__c = matched?.KnowledgeArticleId,
                    Matched_Article_Title__c = matched == null ? null : SLK_AIService.truncate(matched.Title, 255),
                    Analysis_Run_Id__c = runId,
                    Analyzed_At__c = Datetime.now()
                )
            );
        }

        delete [SELECT Id FROM SLK_Knowledge_Gap__c WHERE Status__c = 'Open' AND Draft_Article_Version_Id__c = NULL];
        insert gaps;

        return new Map<String, Object>{
            'created' => gaps.size(),
            'runId' => runId,
            'subjectsAnalyzed' => subjects.size(),
            'message' => 'Found ' + gaps.size() + ' knowledge gap themes across ' + subjects.size() + ' case subjects.'
        };
    }

    public static List<Map<String, Object>> listGaps(String status) {
        Set<String> statuses = String.isBlank(status) || status == 'active'
            ? new Set<String>{ 'Open', 'Drafting', 'In Review' }
            : (status == 'all' ? new Set<String>{ 'Open', 'Drafting', 'In Review', 'Covered', 'Dismissed' } : new Set<String>{ status });
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (SLK_Knowledge_Gap__c gap : [
            SELECT
                Id, Name, Gap_Kind__c, Status__c, Priority__c, Case_Count__c, Linked_Case_Count__c, Impact_Score__c,
                Description__c, AI_Rationale__c, Member_Subjects__c, Suggested_Title__c, Suggested_Article_Type__c,
                Keywords__c, Case_Category__c, Matched_Article_Id__c, Matched_Article_Title__c,
                Draft_Article_Version_Id__c, Analysis_Run_Id__c, Analyzed_At__c, Resolved_At__c
            FROM SLK_Knowledge_Gap__c
            WHERE Status__c IN :statuses
            ORDER BY Impact_Score__c DESC NULLS LAST, Case_Count__c DESC NULLS LAST
            LIMIT 200
        ]) {
            rows.add(gapRow(gap));
        }
        return rows;
    }

    public static Map<String, Object> gapRow(SLK_Knowledge_Gap__c gap) {
        return new Map<String, Object>{
            'id' => gap.Id,
            'name' => gap.Name,
            'kind' => gap.Gap_Kind__c,
            'status' => gap.Status__c,
            'priority' => gap.Priority__c,
            'caseCount' => gap.Case_Count__c,
            'linkedCaseCount' => gap.Linked_Case_Count__c,
            'impact' => gap.Impact_Score__c,
            'description' => gap.Description__c,
            'rationale' => gap.AI_Rationale__c,
            'subjects' => memberSubjects(gap),
            'suggestedTitle' => gap.Suggested_Title__c,
            'suggestedType' => gap.Suggested_Article_Type__c,
            'keywords' => gap.Keywords__c,
            'category' => gap.Case_Category__c,
            'matchedArticleId' => gap.Matched_Article_Id__c,
            'matchedArticleTitle' => gap.Matched_Article_Title__c,
            'draftVersionId' => gap.Draft_Article_Version_Id__c,
            'runId' => gap.Analysis_Run_Id__c,
            'analyzedAt' => gap.Analyzed_At__c,
            'resolvedAt' => gap.Resolved_At__c
        };
    }

    public static Map<String, Object> getGapCases(Id gapId, Integer limitSize) {
        SLK_Knowledge_Gap__c gap = loadGap(gapId);
        List<String> subjects = memberSubjects(gap);
        Integer total = [
            SELECT COUNT()
            FROM Case
            WHERE Subject IN :subjects AND Id NOT IN (SELECT CaseId FROM CaseArticle)
        ];
        Integer lim = Math.min(Math.max(limitSize == null ? 25 : limitSize, 1), 200);
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (Case c : [
            SELECT Id, CaseNumber, Subject, Status, Type, Priority, Origin, CreatedDate, IsClosed, Account.Name
            FROM Case
            WHERE Subject IN :subjects AND Id NOT IN (SELECT CaseId FROM CaseArticle)
            ORDER BY CreatedDate DESC
            LIMIT :lim
        ]) {
            items.add(SLK_CoverageService.caseRow(c));
        }
        return new Map<String, Object>{ 'total' => total, 'items' => items, 'subjects' => subjects };
    }

    public static Map<String, Object> linkGap(Id gapId, Id knowledgeArticleId) {
        SLK_Knowledge_Gap__c gap = loadGap(gapId);
        Id kaId = knowledgeArticleId != null ? knowledgeArticleId : (Id) gap.Matched_Article_Id__c;
        if (kaId == null) {
            throw new GapException('This gap has no matched article to link.');
        }
        Integer linked = linkCasesBySubject(memberSubjects(gap), kaId);
        gap.Status__c = 'Covered';
        gap.Resolved_At__c = Datetime.now();
        gap.Linked_Case_Count__c = linked;
        if (gap.Matched_Article_Id__c == null) {
            gap.Matched_Article_Id__c = kaId;
        }
        update gap;
        return new Map<String, Object>{ 'linked' => linked, 'gapId' => gap.Id };
    }

    public static Map<String, Object> dismiss(Id gapId, String reason) {
        SLK_Knowledge_Gap__c gap = loadGap(gapId);
        gap.Status__c = 'Dismissed';
        gap.Resolved_At__c = Datetime.now();
        if (String.isNotBlank(reason)) {
            gap.AI_Rationale__c = (String.isBlank(gap.AI_Rationale__c) ? '' : gap.AI_Rationale__c + '\n\n') + 'Dismissed: ' + reason;
        }
        update gap;
        return new Map<String, Object>{ 'gapId' => gap.Id, 'status' => gap.Status__c };
    }

    public static Integer linkCasesBySubject(List<String> subjects, Id knowledgeArticleId) {
        List<CaseArticle> links = new List<CaseArticle>();
        for (Case c : [
            SELECT Id
            FROM Case
            WHERE Subject IN :subjects AND Id NOT IN (SELECT CaseId FROM CaseArticle)
            LIMIT :MAX_LINKS_PER_GAP
        ]) {
            links.add(new CaseArticle(CaseId = c.Id, KnowledgeArticleId = knowledgeArticleId));
        }
        Integer linked = 0;
        for (Database.SaveResult sr : Database.insert(links, false)) {
            if (sr.isSuccess()) {
                linked++;
            }
        }
        return linked;
    }

    public static SLK_Knowledge_Gap__c loadGap(Id gapId) {
        List<SLK_Knowledge_Gap__c> gaps = [
            SELECT
                Id, Name, Gap_Kind__c, Status__c, Priority__c, Case_Count__c, Description__c, AI_Rationale__c,
                Member_Subjects__c, Suggested_Title__c, Suggested_Article_Type__c, Keywords__c, Case_Category__c,
                Matched_Article_Id__c, Matched_Article_Title__c, Draft_Article_Version_Id__c, Linked_Case_Count__c
            FROM SLK_Knowledge_Gap__c
            WHERE Id = :gapId
        ];
        if (gaps.isEmpty()) {
            throw new GapException('Knowledge gap not found.');
        }
        return gaps[0];
    }

    public static List<String> memberSubjects(SLK_Knowledge_Gap__c gap) {
        List<String> subjects = new List<String>();
        if (String.isBlank(gap.Member_Subjects__c)) {
            return subjects;
        }
        for (String line : gap.Member_Subjects__c.split('\n')) {
            if (String.isNotBlank(line)) {
                subjects.add(line.trim());
            }
        }
        return subjects;
    }

    private static Set<String> claimedSubjects() {
        Set<String> claimed = new Set<String>();
        for (SLK_Knowledge_Gap__c gap : [
            SELECT Member_Subjects__c
            FROM SLK_Knowledge_Gap__c
            WHERE Status__c IN :ACTIVE_STATUSES OR (Status__c = 'Open' AND Draft_Article_Version_Id__c != NULL)
        ]) {
            for (String subject : memberSubjects(gap)) {
                claimed.add(subject.toLowerCase());
            }
        }
        return claimed;
    }

    private static Integer parseIndex(String token, String prefix) {
        if (String.isBlank(token) || token == 'null') {
            return null;
        }
        String digits = token.trim().removeStartIgnoreCase(prefix).replaceAll('[^0-9]', '');
        return String.isBlank(digits) ? null : Integer.valueOf(digits);
    }

    private static String topVote(Map<String, Integer> votes) {
        String best;
        Integer bestCount = -1;
        for (String key : votes.keySet()) {
            if (votes.get(key) > bestCount) {
                best = key;
                bestCount = votes.get(key);
            }
        }
        return best;
    }
}