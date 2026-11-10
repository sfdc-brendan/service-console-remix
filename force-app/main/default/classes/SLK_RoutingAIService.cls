/**
 * AI triage for skills-based routing. Reads a case the way a senior dispatcher would, works out
 * what the customer needs, and tags skills from the routing catalog (one required, the rest
 * preferred) before the routing engine scores agents. Falls back to keyword triage if the
 * Models API is unavailable. Model calls always run before DML in the same transaction.
 */
public with sharing class SLK_RoutingAIService {
    @TestVisible
    private static Boolean aiTriage = !Test.isRunningTest();
    public static final Integer PENDING_GRACE_SECONDS = 20;
    private static final Integer MAX_SKILLS = 4;
    private static final Set<String> SENTIMENTS = new Set<String>{ 'Positive', 'Neutral', 'Negative' };

    public class TriageInput {
        public String subject;
        public String description;
        public String channel;
        public String origin;
        public String priority;
        public String caseType;
        public String contactName;
        public String contactTitle;
        public String accountName;
        public String industry;
        public String accountType;
        public Integer openCases;
        public List<Object> keepSkills = new List<Object>();
    }

    // ---------------------------------------------------------------- triage

    public static TriageInput inputFor(Case c, String channel) {
        TriageInput input = new TriageInput();
        input.subject = c.Subject;
        input.description = c.Description;
        input.channel = channel;
        input.origin = c.Origin;
        input.priority = c.Priority;
        input.caseType = c.Type;
        input.contactName = c.Contact?.Name;
        input.contactTitle = c.Contact?.Title;
        input.accountName = c.Account?.Name;
        input.industry = c.Account?.Industry;
        input.accountType = c.Account?.Type;
        return input;
    }

    public static Map<String, Object> analyze(TriageInput input, Boolean useAi) {
        List<String> catalog = SLK_RoutingSkills.catalogNames();
        if (useAi && aiTriage) {
            try {
                return normalize(callModel(input, catalog), input, catalog, 'ai');
            } catch (Exception e) {
                Map<String, Object> fallback = rules(input, catalog);
                fallback.put('fallbackReason', SLK_AIService.truncate(e.getMessage(), 200));
                return fallback;
            }
        }
        return rules(input, catalog);
    }

    /** Triage queued work: every model call first, then one round of DML, then route. */
    public static void triage(List<Id> workIds) {
        List<SLK_Work_Item__c> items = SLK_RoutingService.queryRouting(
            'WHERE Id IN :ids AND Status__c IN (\'Analyzing\', \'Queued\')',
            new Map<String, Object>{ 'ids' => workIds }
        );
        if (items.isEmpty()) {
            return;
        }
        Map<Id, Case> cases = loadCases(items);
        Map<Id, Map<String, Object>> results = new Map<Id, Map<String, Object>>();
        for (SLK_Work_Item__c item : items) {
            Case source = cases.get(item.Case__c);
            TriageInput input = source == null ? inputFor(item) : inputFor(source, item.Channel__c);
            input.keepSkills = manualSkills(item);
            input.openCases = source == null ? null : openCasesFor(source.ContactId);
            results.put(item.Id, analyze(input, true));
        }
        for (SLK_Work_Item__c item : items) {
            apply(item, results.get(item.Id));
        }
        update items;
        SLK_RoutingService.routeTick();
    }

    /** Safety net if the triage job never ran: picks up work that has waited too long in Analyzing. */
    public static void triagePending() {
        Datetime cutoff = Datetime.now().addSeconds(-PENDING_GRACE_SECONDS);
        List<Id> stuck = new List<Id>();
        for (SLK_Work_Item__c item : [
            SELECT Id
            FROM SLK_Work_Item__c
            WHERE Status__c = 'Analyzing' AND CreatedDate < :cutoff
            ORDER BY CreatedDate ASC
            LIMIT 2
        ]) {
            stuck.add(item.Id);
        }
        if (!stuck.isEmpty()) {
            triage(stuck);
        }
    }

    public static Map<String, Object> retriage(Id workId) {
        SLK_Work_Item__c item = SLK_RoutingService.loadWork(workId);
        Case source = loadCases(new List<SLK_Work_Item__c>{ item }).get(item.Case__c);
        TriageInput input = source == null ? inputFor(item) : inputFor(source, item.Channel__c);
        input.keepSkills = manualSkills(item);
        input.openCases = source == null ? null : openCasesFor(source.ContactId);
        Map<String, Object> analysis = analyze(input, true);
        apply(item, analysis);
        if (item.Status__c == 'Offered') {
            reopen(item);
        }
        update item;
        SLK_RoutingService.routeTick();
        return routing(workId);
    }

    /** A person edits the tags. Skills they keep retain the AI's reasoning; new ones are marked manual. */
    public static Map<String, Object> retag(Id workId, List<Object> skills, String required, Id userId) {
        SLK_Work_Item__c item = SLK_RoutingService.loadWork(workId);
        Map<String, Object> analysis = parseAnalysis(item.Routing_Analysis__c);
        if (analysis == null) {
            analysis = new Map<String, Object>{ 'model' => 'manual', 'analyzedAt' => Datetime.now() };
        }
        Map<String, Map<String, Object>> existing = new Map<String, Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(analysis, 'skills')) {
            Map<String, Object> skill = (Map<String, Object>) raw;
            existing.put(String.valueOf(skill.get('name')).toLowerCase(), skill);
        }
        Map<String, String> canonical = SLK_RoutingSkills.canonicalMap(SLK_RoutingSkills.catalogNames());
        String who = [SELECT Name FROM User WHERE Id = :userId].Name;
        String requiredKey = String.isBlank(required) ? null : required.trim().toLowerCase();
        List<Object> next = new List<Object>();
        Set<String> seen = new Set<String>();
        for (Object raw : skills) {
            String name = raw == null ? null : String.valueOf(raw).trim();
            if (String.isBlank(name) || SLK_RoutingSkills.isChannel(name) || seen.contains(name.toLowerCase())) {
                continue;
            }
            String key = name.toLowerCase();
            seen.add(key);
            Map<String, Object> skill = existing.containsKey(key)
                ? existing.get(key)
                : new Map<String, Object>{
                      'name' => canonical.containsKey(key) ? canonical.get(key) : name.left(40),
                      'source' => 'manual',
                      'confidence' => 100,
                      'reason' => 'Tagged by ' + who
                  };
            skill.put('level', key == requiredKey ? 'required' : 'preferred');
            next.add(skill);
        }
        analysis.put('skills', next);
        writeSkills(item, analysis);

        Map<String, Object> entry = SLK_RoutingLog.event('retagged', who + ' updated the skills', skillSummary(next));
        entry.put('actor', who);
        entry.put('skills', next);
        SLK_RoutingLog.add(item, entry);
        if (item.Status__c == 'Offered') {
            reopen(item);
        }
        update item;
        SLK_RoutingService.routeTick();
        return routing(workId);
    }

    /** A transfer's skill becomes the required tag; everything the AI tagged stays as preferred context. */
    public static void tagTransfer(SLK_Work_Item__c item, String skill, String queue) {
        Map<String, Object> analysis = parseAnalysis(item.Routing_Analysis__c);
        if (String.isBlank(skill)) {
            if (analysis == null) {
                item.Required_Skill__c = null;
                return;
            }
            for (Object raw : SLK_AIService.getList(analysis, 'skills')) {
                ((Map<String, Object>) raw).put('level', 'preferred');
            }
            writeSkills(item, analysis);
            return;
        }
        if (analysis == null) {
            analysis = new Map<String, Object>{ 'model' => 'manual', 'analyzedAt' => Datetime.now(), 'queue' => queue };
        }
        List<Object> next = new List<Object>{
            new Map<String, Object>{
                'name' => skill.trim().left(40),
                'level' => 'required',
                'confidence' => 100,
                'reason' => 'Transferred to ' + queue,
                'source' => 'transfer'
            }
        };
        for (Object raw : SLK_AIService.getList(analysis, 'skills')) {
            Map<String, Object> existing = (Map<String, Object>) raw;
            if (!String.valueOf(existing.get('name')).equalsIgnoreCase(skill.trim()) && next.size() < MAX_SKILLS) {
                existing.put('level', 'preferred');
                next.add(existing);
            }
        }
        analysis.put('skills', next);
        writeSkills(item, analysis);
    }

    public static void apply(SLK_Work_Item__c item, Map<String, Object> analysis) {
        writeSkills(item, analysis);
        String queue = SLK_AIService.getStr(analysis, 'queue');
        if (String.isNotBlank(queue)) {
            item.Queue__c = queue.left(80);
        }
        String sentiment = SLK_AIService.getStr(analysis, 'sentiment');
        if (String.isNotBlank(sentiment) && (item.Sentiment__c == null || item.Sentiment__c == 'Neutral')) {
            item.Sentiment__c = sentiment;
        }
        if (item.Status__c == 'Analyzing') {
            item.Status__c = 'Queued';
        }
        Boolean ai = analysis.get('model') == 'ai';
        Map<String, Object> analyzed = SLK_RoutingLog.event(
            'analyzed',
            ai ? 'AI analyzed the case' : 'Keyword triage',
            SLK_AIService.getStr(analysis, 'intent')
        );
        analyzed.put('confidence', analysis.get('confidence'));
        analyzed.put('model', analysis.get('model'));
        analyzed.put('signals', analysis.get('signals'));
        SLK_RoutingLog.add(item, analyzed);

        List<Object> skills = SLK_AIService.getList(analysis, 'skills');
        Map<String, Object> tagged = SLK_RoutingLog.event(
            'tagged',
            skills.isEmpty() ? 'No specialist skills needed' : 'Tagged ' + skills.size() + ' skill' + (skills.size() == 1 ? '' : 's'),
            skillSummary(skills)
        );
        tagged.put('skills', skills);
        SLK_RoutingLog.add(item, tagged);
    }

    // ---------------------------------------------------------------- read models

    public static Map<String, Object> routing(Id workId) {
        SLK_Work_Item__c item = SLK_RoutingService.loadWork(workId);
        Map<String, Object> analysis = parseAnalysis(item.Routing_Analysis__c);
        return new Map<String, Object>{
            'work' => SLK_RoutingService.workDto(item),
            'analysis' => analysis,
            'events' => SLK_RoutingLog.read(item.Routing_Log__c),
            'coverage' => coverage(analysis == null ? new List<Object>() : SLK_AIService.getList(analysis, 'skills')),
            'serverTime' => Datetime.now()
        };
    }

    public static Map<String, Object> caseRouting(Id caseId) {
        List<SLK_Work_Item__c> latest = [SELECT Id FROM SLK_Work_Item__c WHERE Case__c = :caseId ORDER BY CreatedDate DESC LIMIT 1];
        if (latest.isEmpty()) {
            return new Map<String, Object>{ 'work' => null, 'analysis' => null, 'events' => new List<Object>(), 'serverTime' => Datetime.now() };
        }
        return routing(latest[0].Id);
    }

    /** Live routing decisions across the floor for the Command Center. */
    public static Map<String, Object> feed() {
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (SLK_Work_Item__c item : SLK_RoutingService.queryRouting(
            'WHERE Skills__c != null OR Status__c = \'Analyzing\' ORDER BY LastModifiedDate DESC LIMIT 15',
            new Map<String, Object>()
        )) {
            Map<String, Object> analysis = parseAnalysis(item.Routing_Analysis__c);
            List<Object> events = SLK_RoutingLog.read(item.Routing_Log__c);
            items.add(new Map<String, Object>{
                'work' => SLK_RoutingService.workDto(item),
                'intent' => analysis == null ? null : analysis.get('intent'),
                'model' => analysis == null ? null : analysis.get('model'),
                'skills' => analysis == null ? new List<Object>() : SLK_AIService.getList(analysis, 'skills'),
                'lastEvent' => events.isEmpty() ? null : events[events.size() - 1],
                'offer' => SLK_RoutingLog.lastOfType(item, 'offered')
            });
        }
        return new Map<String, Object>{
            'items' => items,
            'analyzing' => [SELECT COUNT() FROM SLK_Work_Item__c WHERE Status__c = 'Analyzing'],
            'queued' => [SELECT COUNT() FROM SLK_Work_Item__c WHERE Status__c = 'Queued'],
            'offered' => [SELECT COUNT() FROM SLK_Work_Item__c WHERE Status__c = 'Offered'],
            'serverTime' => Datetime.now()
        };
    }

    /** Compact routing context for an offer card: what the case needs and why this agent got it. */
    public static Map<String, Object> offerContext(SLK_Work_Item__c item) {
        Map<String, Object> analysis = parseAnalysis(item.Routing_Analysis__c);
        Map<String, Object> offer = SLK_RoutingLog.lastOfType(item, 'offered');
        if (analysis == null && offer == null) {
            return null;
        }
        return new Map<String, Object>{
            'intent' => analysis == null ? null : analysis.get('intent'),
            'summary' => analysis == null ? null : analysis.get('summary'),
            'confidence' => analysis == null ? null : analysis.get('confidence'),
            'model' => analysis == null ? null : analysis.get('model'),
            'skills' => analysis == null ? new List<Object>() : SLK_AIService.getList(analysis, 'skills'),
            'score' => offer == null ? null : offer.get('score'),
            'matched' => offer == null ? new List<Object>() : SLK_AIService.getList(offer, 'matched'),
            'missing' => offer == null ? new List<Object>() : SLK_AIService.getList(offer, 'missing'),
            'relaxed' => offer != null && offer.get('relaxed') == true
        };
    }

    public static Map<String, Object> parseAnalysis(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        try {
            Object parsed = JSON.deserializeUntyped(raw);
            return parsed instanceof Map<String, Object> ? (Map<String, Object>) parsed : null;
        } catch (JSONException e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- internals

    private static Map<String, Object> callModel(TriageInput input, List<String> catalog) {
        String keep = '';
        for (Object raw : input.keepSkills) {
            keep += '- ' + ((Map<String, Object>) raw).get('name') + '\n';
        }
        return SLK_AIService.generateJson(
            'You are the triage brain of a skills-based routing engine in a customer service center. ' +
            'Read the case like a senior dispatcher: work out what the customer actually needs and which expertise resolves it fastest. ' +
            'Choose skills ONLY from the catalog, spelled exactly as listed. Tag a language skill only when the customer writes in that language. ' +
            'Never invent facts that are not in the case.',
            'CHANNEL: ' + input.channel + (input.origin == null ? '' : ' (origin ' + input.origin + ')') +
            '\nPRIORITY: ' + input.priority + (input.caseType == null ? '' : ' | TYPE: ' + input.caseType) +
            '\nCUSTOMER: ' + input.contactName + (input.contactTitle == null ? '' : ', ' + input.contactTitle) +
            (input.accountName == null ? '' : '\nACCOUNT: ' + input.accountName + ' | ' + input.industry + ' | ' + input.accountType) +
            (input.openCases == null ? '' : '\nOTHER OPEN CASES FOR THIS CUSTOMER: ' + input.openCases) +
            '\nSUBJECT: ' + input.subject +
            '\nDESCRIPTION: ' + SLK_AIService.truncate(input.description, 2000) +
            (String.isBlank(keep) ? '' : '\n\nSKILLS A PERSON ALREADY TAGGED (keep these):\n' + keep) +
            '\n\nSKILL CATALOG:\n- ' + String.join(catalog, '\n- ') +
            '\n\nJSON shape: {"intent":"max 8 words, what the customer needs","category":"2-3 words","summary":"one sentence for the agent receiving this",' +
            '"sentiment":"Positive|Neutral|Negative","suggestedPriority":"Critical|High|Medium|Low","language":"language the customer wrote in",' +
            '"confidence":0-100,"signals":["up to 4 short phrases quoted or paraphrased from the case that drove the routing"],' +
            '"queue":"short queue name","skills":[{"name":"catalog skill","level":"required|preferred","confidence":0-100,"reason":"max 12 words"}]}' +
            '\nTag 1 to ' + MAX_SKILLS + ' skills; exactly one should be required (the expertise without which the case cannot be solved).'
        );
    }

    @TestVisible
    private static Map<String, Object> normalize(Map<String, Object> ai, TriageInput input, List<String> catalog, String model) {
        Map<String, String> canonical = SLK_RoutingSkills.canonicalMap(catalog);
        List<Map<String, Object>> skills = new List<Map<String, Object>>();
        Set<String> seen = new Set<String>();
        for (Object raw : input.keepSkills) {
            Map<String, Object> skill = (Map<String, Object>) raw;
            seen.add(String.valueOf(skill.get('name')).toLowerCase());
            skills.add(skill);
        }
        for (Object raw : SLK_AIService.getList(ai, 'skills')) {
            if (!(raw instanceof Map<String, Object>) || skills.size() >= MAX_SKILLS) {
                continue;
            }
            Map<String, Object> source = (Map<String, Object>) raw;
            String key = SLK_AIService.getStr(source, 'name').trim().toLowerCase();
            if (!canonical.containsKey(key) || seen.contains(key)) {
                continue;
            }
            seen.add(key);
            skills.add(new Map<String, Object>{
                'name' => canonical.get(key),
                'level' => SLK_AIService.getStr(source, 'level') == 'required' ? 'required' : 'preferred',
                'confidence' => clamp(SLK_AIService.getInt(source, 'confidence', 70)),
                'reason' => SLK_AIService.truncate(SLK_AIService.getStr(source, 'reason'), 120),
                'source' => 'ai'
            });
        }
        oneRequired(skills);

        List<String> signals = new List<String>();
        for (Object raw : SLK_AIService.getList(ai, 'signals')) {
            if (raw != null && String.isNotBlank(String.valueOf(raw)) && signals.size() < 4) {
                signals.add(SLK_AIService.truncate(String.valueOf(raw), 80));
            }
        }
        String required = requiredName(skills);
        String queue = SLK_AIService.getStr(ai, 'queue');
        String suggested = SLK_AIService.getStr(ai, 'suggestedPriority');
        return new Map<String, Object>{
            'intent' => SLK_AIService.truncate(SLK_AIService.getStr(ai, 'intent'), 80),
            'category' => SLK_AIService.truncate(SLK_AIService.getStr(ai, 'category'), 40),
            'summary' => SLK_AIService.truncate(SLK_AIService.getStr(ai, 'summary'), 300),
            'sentiment' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'sentiment'), SENTIMENTS, 'Neutral'),
            'suggestedPriority' => SLK_RoutingService.PRIORITIES.contains(suggested) ? suggested : null,
            'language' => SLK_AIService.truncate(SLK_AIService.getStr(ai, 'language'), 30),
            'confidence' => clamp(SLK_AIService.getInt(ai, 'confidence', 70)),
            'signals' => signals,
            'queue' => String.isNotBlank(queue) ? SLK_AIService.truncate(queue, 80) : required == null ? 'General Support' : required,
            'skills' => skills,
            'model' => model,
            'analyzedAt' => Datetime.now()
        };
    }

    private static Map<String, Object> rules(TriageInput input, List<String> catalog) {
        Map<String, String> canonical = SLK_RoutingSkills.canonicalMap(catalog);
        List<Map<String, Object>> skills = new List<Map<String, Object>>();
        Set<String> seen = new Set<String>();
        for (Object raw : input.keepSkills) {
            Map<String, Object> skill = (Map<String, Object>) raw;
            seen.add(String.valueOf(skill.get('name')).toLowerCase());
            skills.add(skill);
        }
        List<String> signals = new List<String>();
        for (Map<String, Object> match : SLK_RoutingSkills.keywordMatches(input.subject + ' ' + input.description)) {
            String name = (String) match.get('name');
            List<String> hits = (List<String>) match.get('hits');
            if (skills.size() >= MAX_SKILLS || seen.contains(name.toLowerCase()) || !canonical.containsKey(name.toLowerCase())) {
                continue;
            }
            seen.add(name.toLowerCase());
            skills.add(new Map<String, Object>{
                'name' => name,
                'level' => 'preferred',
                'confidence' => Math.min(90, 40 + hits.size() * 15),
                'reason' => 'Mentions ' + String.join(hits, ', '),
                'source' => 'rules'
            });
            for (String hit : hits) {
                if (signals.size() < 4) {
                    signals.add(hit);
                }
            }
        }
        oneRequired(skills);
        String required = requiredName(skills);
        return new Map<String, Object>{
            'intent' => SLK_AIService.truncate(input.subject, 80),
            'category' => required,
            'summary' => skills.isEmpty() ? 'No specialist keywords found; routing to any available agent.' : 'Routed on keywords in the case text.',
            'sentiment' => 'Neutral',
            'suggestedPriority' => null,
            'language' => null,
            'confidence' => skills.isEmpty() ? 30 : 55,
            'signals' => signals,
            'queue' => required == null ? 'General Support' : required,
            'skills' => skills,
            'model' => 'rules',
            'analyzedAt' => Datetime.now()
        };
    }

    private static void oneRequired(List<Map<String, Object>> skills) {
        Boolean found = false;
        Map<String, Object> strongest = null;
        for (Map<String, Object> skill : skills) {
            if (skill.get('level') == 'required') {
                if (found) {
                    skill.put('level', 'preferred');
                }
                found = true;
            }
            if (strongest == null || (Integer) skill.get('confidence') > (Integer) strongest.get('confidence')) {
                strongest = skill;
            }
        }
        if (!found && strongest != null) {
            strongest.put('level', 'required');
        }
    }

    private static String requiredName(List<Object> skills) {
        for (Object raw : skills) {
            Map<String, Object> skill = (Map<String, Object>) raw;
            if (skill.get('level') == 'required') {
                return (String) skill.get('name');
            }
        }
        return null;
    }

    private static void writeSkills(SLK_Work_Item__c item, Map<String, Object> analysis) {
        List<Object> skills = SLK_AIService.getList(analysis, 'skills');
        List<String> names = new List<String>();
        for (Object raw : skills) {
            names.add(String.valueOf(((Map<String, Object>) raw).get('name')));
        }
        String required = requiredName(skills);
        item.Skills__c = names.isEmpty() ? null : String.join(names, ';').left(255);
        item.Required_Skill__c = required == null ? null : required.left(40);
        item.Routing_Analysis__c = JSON.serialize(analysis);
    }

    private static List<Object> manualSkills(SLK_Work_Item__c item) {
        List<Object> kept = new List<Object>();
        Map<String, Object> analysis = parseAnalysis(item.Routing_Analysis__c);
        if (analysis != null) {
            for (Object raw : SLK_AIService.getList(analysis, 'skills')) {
                Map<String, Object> skill = (Map<String, Object>) raw;
                if (skill.get('source') == 'manual' || skill.get('source') == 'transfer') {
                    kept.add(skill);
                }
            }
        } else if (String.isNotBlank(item.Required_Skill__c)) {
            kept.add(new Map<String, Object>{
                'name' => item.Required_Skill__c,
                'level' => 'required',
                'confidence' => 100,
                'reason' => 'Set when the work was transferred',
                'source' => 'transfer'
            });
        }
        return kept;
    }

    private static void reopen(SLK_Work_Item__c item) {
        item.Status__c = 'Queued';
        item.Agent__c = null;
        item.Offered_At__c = null;
    }

    private static Map<String, Object> coverage(List<Object> skills) {
        Map<String, Object> result = new Map<String, Object>();
        if (skills.isEmpty()) {
            return result;
        }
        List<SLK_Agent_Presence__c> presences = [SELECT Skills__c, Status__c FROM SLK_Agent_Presence__c WHERE Agent__c != NULL];
        for (Object raw : skills) {
            String name = String.valueOf(((Map<String, Object>) raw).get('name'));
            Integer agents = 0;
            Integer online = 0;
            for (SLK_Agent_Presence__c presence : presences) {
                if (SLK_RoutingSkills.parse(presence.Skills__c).containsKey(name.toLowerCase())) {
                    agents++;
                    if (presence.Status__c == 'Online') {
                        online++;
                    }
                }
            }
            result.put(name, new Map<String, Object>{ 'agents' => agents, 'online' => online });
        }
        return result;
    }

    private static String skillSummary(List<Object> skills) {
        List<String> parts = new List<String>();
        for (Object raw : skills) {
            Map<String, Object> skill = (Map<String, Object>) raw;
            parts.add(skill.get('name') + (skill.get('level') == 'required' ? ' (required)' : ''));
        }
        return parts.isEmpty() ? null : String.join(parts, ', ');
    }

    private static TriageInput inputFor(SLK_Work_Item__c item) {
        TriageInput input = new TriageInput();
        input.subject = item.Subject__c;
        input.channel = item.Channel__c;
        input.priority = item.Priority__c;
        input.contactName = item.Customer_Name__c;
        return input;
    }

    private static Map<Id, Case> loadCases(List<SLK_Work_Item__c> items) {
        Set<Id> ids = new Set<Id>();
        for (SLK_Work_Item__c item : items) {
            if (item.Case__c != null) {
                ids.add(item.Case__c);
            }
        }
        return new Map<Id, Case>([
            SELECT Id, Subject, Description, Origin, Priority, Type, ContactId, Contact.Name, Contact.Title, Account.Name, Account.Industry, Account.Type
            FROM Case
            WHERE Id IN :ids
        ]);
    }

    private static Integer openCasesFor(Id contactId) {
        return contactId == null ? null : [SELECT COUNT() FROM Case WHERE ContactId = :contactId AND IsClosed = FALSE];
    }

    private static Integer clamp(Integer value) {
        return Math.max(0, Math.min(100, value == null ? 0 : value));
    }
}