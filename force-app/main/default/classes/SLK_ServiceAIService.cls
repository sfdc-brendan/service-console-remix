/**
 * AI assistance for the Service Console, grounded on live case, conversation, and knowledge data.
 * Every model call goes through SLK_AIService (Models API / Einstein Trust Layer).
 */
public with sharing class SLK_ServiceAIService {
    public static final Set<String> ACTION_TYPES = new Set<String>{
        'updateStatus',
        'updatePriority',
        'createTask',
        'linkArticle',
        'escalate',
        'sendEmail',
        'addComment'
    };
    private static final Set<String> SENTIMENTS = new Set<String>{ 'Positive', 'Neutral', 'Negative' };
    private static final String SERVICE_SENDER = 'Customer Service';
    private static final Map<String, String> NOTE_STYLES = new Map<String, String>{
        'summary' => 'an internal status note: where the case stands, what has been done so far, and what is still pending',
        'handoff' => 'an internal handoff note so another agent can pick this up cold: context, what was tried, open questions, and the next step',
        'nextSteps' => 'an internal checklist of the concrete next steps, one per line starting with "- ", each with who owns it',
        'customer' => 'a case comment the customer will read: a warm, plain-language progress update and what happens next, with no internal details'
    };
    private static final Set<String> RISKS = new Set<String>{ 'low', 'medium', 'high' };

    public class AIServiceException extends Exception {
    }

    // ---------------------------------------------------------------- case intelligence

    public static Map<String, Object> summarize(Id caseId) {
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are an expert service agent assistant. Summarize the case so an agent can pick it up in ten seconds. Be factual; never invent details.',
            caseContext(caseId) +
            '\n\nJSON shape: {"headline":"one line, max 12 words","summary":"3-4 sentence narrative",' +
            '"keyPoints":["up to 4 short facts"],"sentiment":"Positive|Neutral|Negative","sentimentReason":"short",' +
            '"customerContext":"one sentence about the customer and their history","risk":"low|medium|high","riskReason":"short"}'
        );
        return new Map<String, Object>{
            'headline' => SLK_AIService.getStr(ai, 'headline'),
            'summary' => SLK_AIService.getStr(ai, 'summary'),
            'keyPoints' => stringList(SLK_AIService.getList(ai, 'keyPoints')),
            'sentiment' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'sentiment'), SENTIMENTS, 'Neutral'),
            'sentimentReason' => SLK_AIService.getStr(ai, 'sentimentReason'),
            'customerContext' => SLK_AIService.getStr(ai, 'customerContext'),
            'risk' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'risk'), RISKS, 'medium'),
            'riskReason' => SLK_AIService.getStr(ai, 'riskReason'),
            'generatedAt' => Datetime.now()
        };
    }

    public static Map<String, Object> nextBestActions(Id caseId) {
        Case c = loadCase(caseId);
        List<Knowledge__kav> articles = SLK_ArticleService.searchArticles(
            c.Subject + ' ' + SLK_AIService.truncate(c.Description, 300),
            4
        );
        String articleBlock = '';
        for (Integer i = 0; i < articles.size(); i++) {
            articleBlock += 'K' + (i + 1) + ' | ' + articles[i].Title + ' | ' + SLK_AIService.truncate(articles[i].Summary, 200) + '\n';
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are a next-best-action engine for service agents. Recommend the 3 to 4 most useful concrete actions for THIS case right now, ' +
            'ordered by impact. Only use the allowed action types and fill their payloads exactly.',
            caseContext(caseId) +
            (String.isBlank(articleBlock) ? '' : '\n\nCANDIDATE KNOWLEDGE ARTICLES:\n' + articleBlock) +
            '\n\nALLOWED ACTION TYPES AND PAYLOADS:\n' +
            'updateStatus {"status":"New|Working|Waiting on Customer|Escalated|Closed"}\n' +
            'updatePriority {"priority":"Critical|High|Medium|Low"}\n' +
            'createTask {"subject":"...","dueInDays":1}\n' +
            'linkArticle {"ref":"K1"} (only for candidate articles above that truly help)\n' +
            'escalate {"reason":"..."}\n' +
            'sendEmail {"subject":"...","body":"complete plain-text email to the customer, signed by the agent"}\n' +
            'addComment {"body":"internal note"}\n\n' +
            'JSON shape: {"actions":[{"title":"imperative, max 8 words","rationale":"why now, one sentence","type":"...","confidence":0-100,"payload":{}}]}'
        );
        return new Map<String, Object>{ 'actions' => normalizeActions(SLK_AIService.getList(ai, 'actions'), articles, 'nba-'), 'generatedAt' => Datetime.now() };
    }

    private static List<Map<String, Object>> normalizeActions(List<Object> rawActions, List<Knowledge__kav> articles, String idPrefix) {
        List<Map<String, Object>> actions = new List<Map<String, Object>>();
        Integer index = 0;
        for (Object raw : rawActions) {
            if (!(raw instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> action = (Map<String, Object>) raw;
            String type = SLK_AIService.getStr(action, 'type');
            if (!ACTION_TYPES.contains(type)) {
                continue;
            }
            Map<String, Object> payload = action.get('payload') instanceof Map<String, Object>
                ? (Map<String, Object>) action.get('payload')
                : new Map<String, Object>();
            if (type == 'linkArticle') {
                Knowledge__kav article = resolveArticleRef(SLK_AIService.getStr(payload, 'ref'), articles);
                if (article == null) {
                    continue;
                }
                payload = new Map<String, Object>{
                    'knowledgeArticleId' => article.KnowledgeArticleId,
                    'articleId' => article.Id,
                    'title' => article.Title
                };
            }
            index++;
            actions.add(
                new Map<String, Object>{
                    'id' => idPrefix + index,
                    'title' => SLK_AIService.getStr(action, 'title'),
                    'rationale' => SLK_AIService.getStr(action, 'rationale'),
                    'type' => type,
                    'confidence' => SLK_AIService.getInt(action, 'confidence', 70),
                    'payload' => payload
                }
            );
        }
        return actions;
    }

    private static final Set<String> STAGES = new Set<String>{ 'Understand', 'Diagnose', 'Resolve', 'Confirm', 'Follow up' };
    private static final Set<String> STEP_STATES = new Set<String>{ 'done', 'current', 'todo' };

    /**
     * Service Rep Assistant style guidance: one grounded plan with replies, shareable articles,
     * an email draft, and quick actions for the case (and the live conversation when workId is set).
     */
    public static Map<String, Object> assist(Id caseId, Id workId) {
        Case c = loadCase(caseId);
        SLK_Work_Item__c work = workId == null ? null : SLK_RoutingService.loadWork(workId);
        Boolean live = work != null && work.Status__c == 'Accepted';
        String lastCustomer = work == null ? '' : lastCustomerMessage(work.Id);
        List<Knowledge__kav> articles = SLK_ArticleService.searchArticles(
            c.Subject + ' ' + (String.isBlank(lastCustomer) ? SLK_AIService.truncate(c.Description, 300) : lastCustomer),
            3
        );
        String articleBlock = '';
        for (Integer i = 0; i < articles.size(); i++) {
            Knowledge__kav a = articles[i];
            String body = SLK_AIService.stripHtml(String.isNotBlank(a.KCSArticle_Resolution__c) ? a.KCSArticle_Resolution__c : a.FAQ_Answer__c);
            articleBlock += 'K' + (i + 1) + ' | ' + a.Title + ' | ' + SLK_AIService.truncate(String.isNotBlank(body) ? body : a.Summary, 450) + '\n';
        }
        String channelHint = live
            ? 'The agent is in a LIVE ' + (work.Channel__c == 'Voice' ? 'phone call: replies are lines to say aloud.' : 'chat: replies are chat messages.')
            : 'The agent is working the case asynchronously: replies are not needed; focus on the email and actions.';
        String liveBlock = live ? '\n\nLIVE TRANSCRIPT (' + work.Channel__c + '):\n' + transcript(work.Id, 24) : '';

        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are Service Assistant, an AI copilot that guides a service rep step by step to resolve the customer issue. ' +
            channelHint + ' Ground everything in the case, conversation, and knowledge. Never invent policies, prices, or facts.',
            caseContext(caseId) + liveBlock +
            (String.isBlank(articleBlock) ? '' : '\n\nCANDIDATE KNOWLEDGE ARTICLES:\n' + articleBlock) +
            '\n\nALLOWED QUICK ACTION TYPES AND PAYLOADS:\n' +
            'updateStatus {"status":"New|Working|Waiting on Customer|Escalated|Closed"}\n' +
            'updatePriority {"priority":"Critical|High|Medium|Low"}\n' +
            'createTask {"subject":"...","dueInDays":1}\n' +
            'escalate {"reason":"..."}\n' +
            'addComment {"body":"internal note"}\n\n' +
            'JSON shape: {"intent":"what the customer needs, one sentence","stage":"Understand|Diagnose|Resolve|Confirm|Follow up",' +
            '"plan":[{"step":"short imperative","status":"done|current|todo"}],' +
            '"replies":[{"label":"2-4 word tag","text":"reply"}],' +
            '"articles":[{"ref":"K1","why":"why it helps, short","shareText":"customer-facing message that shares the article guidance in plain words"}],' +
            '"email":{"subject":"...","body":"complete plain-text email to the customer, signed by the agent","why":"short"} or null,' +
            '"actions":[{"title":"imperative, max 8 words","rationale":"one sentence","type":"...","confidence":0-100,"payload":{}}]}\n' +
            'Rules: 3-5 plan steps with exactly one "current"; ' + (live ? '2-3 replies' : 'replies must be []') +
            '; only articles from the candidates that truly help (0-2); ' +
            (live ? 'email only if a written follow-up is warranted after the conversation' : 'always draft the email') +
            '; 0-2 actions.'
        );

        List<Map<String, Object>> plan = new List<Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(ai, 'plan')) {
            if (raw instanceof Map<String, Object>) {
                Map<String, Object> step = (Map<String, Object>) raw;
                plan.add(new Map<String, Object>{
                    'step' => SLK_AIService.getStr(step, 'step'),
                    'status' => SLK_AIService.pick(SLK_AIService.getStr(step, 'status'), STEP_STATES, 'todo')
                });
            }
        }
        List<Map<String, Object>> replies = new List<Map<String, Object>>();
        if (live) {
            for (Object raw : SLK_AIService.getList(ai, 'replies')) {
                if (raw instanceof Map<String, Object>) {
                    Map<String, Object> item = (Map<String, Object>) raw;
                    replies.add(new Map<String, Object>{ 'label' => SLK_AIService.getStr(item, 'label'), 'text' => SLK_AIService.getStr(item, 'text') });
                }
            }
        }
        Set<Id> linked = new Set<Id>();
        for (CaseArticle link : [SELECT KnowledgeArticleId FROM CaseArticle WHERE CaseId = :caseId]) {
            linked.add(link.KnowledgeArticleId);
        }
        List<Map<String, Object>> shareable = new List<Map<String, Object>>();
        Set<Id> seen = new Set<Id>();
        for (Object raw : SLK_AIService.getList(ai, 'articles')) {
            if (!(raw instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> item = (Map<String, Object>) raw;
            Knowledge__kav article = resolveArticleRef(SLK_AIService.getStr(item, 'ref'), articles);
            if (article == null || seen.contains(article.Id)) {
                continue;
            }
            seen.add(article.Id);
            shareable.add(new Map<String, Object>{
                'articleId' => article.Id,
                'knowledgeArticleId' => article.KnowledgeArticleId,
                'title' => article.Title,
                'articleNumber' => article.ArticleNumber,
                'why' => SLK_AIService.getStr(item, 'why'),
                'shareText' => SLK_AIService.getStr(item, 'shareText'),
                'linked' => linked.contains(article.KnowledgeArticleId)
            });
        }
        Map<String, Object> email = null;
        if (ai.get('email') instanceof Map<String, Object>) {
            Map<String, Object> draft = (Map<String, Object>) ai.get('email');
            if (String.isNotBlank(SLK_AIService.getStr(draft, 'body'))) {
                email = new Map<String, Object>{
                    'subject' => SLK_AIService.getStr(draft, 'subject'),
                    'body' => SLK_AIService.getStr(draft, 'body'),
                    'why' => SLK_AIService.getStr(draft, 'why'),
                    'to' => c.Contact?.Email
                };
            }
        }
        return new Map<String, Object>{
            'intent' => SLK_AIService.getStr(ai, 'intent'),
            'stage' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'stage'), STAGES, 'Understand'),
            'plan' => plan,
            'replies' => replies,
            'articles' => shareable,
            'email' => email,
            'actions' => normalizeActions(SLK_AIService.getList(ai, 'actions'), articles, 'sa-'),
            'live' => live,
            'generatedAt' => Datetime.now()
        };
    }

    private static Knowledge__kav resolveArticleRef(String ref, List<Knowledge__kav> articles) {
        String digits = ref == null ? '' : ref.replaceAll('[^0-9]', '');
        if (String.isBlank(digits)) {
            return null;
        }
        Integer idx = Integer.valueOf(digits);
        return idx >= 1 && idx <= articles.size() ? articles[idx - 1] : null;
    }

    public static Map<String, Object> executeAction(Id caseId, String type, Map<String, Object> payload) {
        if (!ACTION_TYPES.contains(type)) {
            throw new AIServiceException('Unsupported action: ' + type);
        }
        Case c = loadCase(caseId);
        switch on type {
            when 'updateStatus' {
                String status = SLK_AIService.getStr(payload, 'status');
                if (!SLK_RoutingService.CASE_STATUSES.contains(status)) {
                    throw new AIServiceException('Unknown case status: ' + status);
                }
                update new Case(Id = caseId, Status = status);
                return result('Case status set to ' + status + '.');
            }
            when 'updatePriority' {
                String priority = SLK_AIService.getStr(payload, 'priority');
                if (!SLK_RoutingService.PRIORITIES.contains(priority)) {
                    throw new AIServiceException('Unknown priority: ' + priority);
                }
                update new Case(Id = caseId, Priority = priority);
                return result('Priority set to ' + priority + '.');
            }
            when 'createTask' {
                Integer days = SLK_AIService.getInt(payload, 'dueInDays', 1);
                insert new Task(
                    WhatId = caseId,
                    WhoId = c.ContactId,
                    OwnerId = UserInfo.getUserId(),
                    Subject = SLK_AIService.truncate(SLK_AIService.getStr(payload, 'subject'), 250),
                    ActivityDate = Date.today().addDays(days == null ? 1 : days),
                    Status = 'Not Started',
                    Priority = 'Normal'
                );
                return result('Task created.');
            }
            when 'linkArticle' {
                Id knowledgeArticleId = (Id) SLK_AIService.getStr(payload, 'knowledgeArticleId');
                SLK_ArticleService.linkCase(caseId, knowledgeArticleId, false);
                return result('Article linked to the case.');
            }
            when 'escalate' {
                String reason = SLK_AIService.getStr(payload, 'reason');
                update new Case(Id = caseId, Status = 'Escalated', IsEscalated = true);
                insert new CaseComment(ParentId = caseId, CommentBody = ('Escalated: ' + reason).left(3900), IsPublished = false);
                return result('Case escalated.');
            }
            when 'sendEmail' {
                String toAddress = c.Contact?.Email;
                if (String.isBlank(toAddress)) {
                    throw new AIServiceException('The case contact has no email address.');
                }
                EmailMessage email = new EmailMessage(
                    ParentId = caseId,
                    Subject = SLK_AIService.truncate(SLK_AIService.getStr(payload, 'subject'), 250),
                    TextBody = SLK_AIService.getStr(payload, 'body'),
                    ToAddress = toAddress,
                    FromAddress = UserInfo.getUserEmail(),
                    FromName = c.IsClosed ? SERVICE_SENDER : UserInfo.getName(),
                    Incoming = false,
                    Status = '3',
                    MessageDate = Datetime.now()
                );
                insertEmail(email);
                return result('Email sent to ' + toAddress + '.');
            }
            when 'addComment' {
                insert new CaseComment(ParentId = caseId, CommentBody = SLK_AIService.getStr(payload, 'body').left(3900), IsPublished = false);
                return result('Internal note added.');
            }
            when else {
                throw new AIServiceException('Unsupported action: ' + type);
            }
        }
    }

    /**
     * The org's email flow completes the First Response milestone and moves the case to
     * Waiting on Customer for agent emails, but skips mail from the service sender. That
     * update fails once a case has exited its entitlement process, so fall back to it.
     */
    private static void insertEmail(EmailMessage email) {
        Savepoint sp = Database.setSavepoint();
        try {
            insert email;
        } catch (DmlException e) {
            Database.rollback(sp);
            if (email.FromName == SERVICE_SENDER || !e.getMessage().contains('entitlement process')) {
                throw e;
            }
            EmailMessage retry = email.clone(false, true);
            retry.FromName = SERVICE_SENDER;
            insert retry;
        }
    }

    private static Map<String, Object> result(String message) {
        return new Map<String, Object>{ 'ok' => true, 'message' => message };
    }

    public static Map<String, Object> knowledge(Id caseId) {
        Map<String, Object> suggestion = SLK_ArticleService.suggestForCase(caseId);
        List<Object> matches = (List<Object>) suggestion.get('matches');
        Set<Id> versionIds = new Set<Id>();
        for (Object match : matches) {
            versionIds.add((Id) ((Map<String, Object>) match).get('id'));
        }
        Map<Id, Knowledge__kav> bodies = new Map<Id, Knowledge__kav>(
            [SELECT Id, KCSArticle_Resolution__c, FAQ_Answer__c FROM Knowledge__kav WHERE Id IN :versionIds]
        );
        Set<Id> linked = new Set<Id>();
        for (CaseArticle link : [SELECT KnowledgeArticleId FROM CaseArticle WHERE CaseId = :caseId]) {
            linked.add(link.KnowledgeArticleId);
        }
        for (Object match : matches) {
            Map<String, Object> row = (Map<String, Object>) match;
            Knowledge__kav body = bodies.get((Id) row.get('id'));
            String html = body == null ? null : (String.isNotBlank(body.KCSArticle_Resolution__c) ? body.KCSArticle_Resolution__c : body.FAQ_Answer__c);
            row.put('snippet', SLK_AIService.truncate(SLK_AIService.stripHtml(html), 700));
            row.put('linked', linked.contains((Id) row.get('knowledgeArticleId')));
        }
        return suggestion;
    }

    // ---------------------------------------------------------------- live conversation assistance

    public static Map<String, Object> replySuggestions(Id workId) {
        SLK_Work_Item__c work = SLK_RoutingService.loadWork(workId);
        String transcript = transcript(workId, 30);
        String knowledge = knowledgeSnippets(work.Subject__c + ' ' + lastCustomerMessage(workId));
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You draft replies for a service agent in a live ' + (work.Channel__c == 'Voice' ? 'phone call (spoken lines)' : 'chat') +
            '. Replies must be empathetic, specific, and move toward resolution. Use knowledge content when it applies.',
            'CASE: ' + work.Subject__c + '\nCUSTOMER: ' + work.Customer_Name__c + '\n\nTRANSCRIPT:\n' + transcript +
            (String.isBlank(knowledge) ? '' : '\n\nKNOWLEDGE:\n' + knowledge) +
            '\n\nJSON shape: {"intent":"what the customer needs right now","suggestions":[{"label":"2-4 word tag","text":"reply"}]} — exactly 3 suggestions.'
        );
        List<Map<String, Object>> suggestions = new List<Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(ai, 'suggestions')) {
            if (raw instanceof Map<String, Object>) {
                Map<String, Object> item = (Map<String, Object>) raw;
                suggestions.add(new Map<String, Object>{ 'label' => SLK_AIService.getStr(item, 'label'), 'text' => SLK_AIService.getStr(item, 'text') });
            }
        }
        return new Map<String, Object>{ 'intent' => SLK_AIService.getStr(ai, 'intent'), 'suggestions' => suggestions };
    }

    public static Map<String, Object> coach(Id workId) {
        SLK_Work_Item__c work = SLK_RoutingService.loadWork(workId);
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are a real-time coach listening to a service ' + (work.Channel__c == 'Voice' ? 'call' : 'chat') +
            '. Give the agent crisp, actionable guidance. Check for: greeting and identity verification, empathy, clear next steps, and confirming resolution.',
            'CASE: ' + work.Subject__c + '\n\nTRANSCRIPT:\n' + transcript(workId, 40) +
            '\n\nJSON shape: {"sentiment":"Positive|Neutral|Negative","sentimentScore":0-100,"customerIntent":"short",' +
            '"nextLine":"the single best thing for the agent to say next","tips":["up to 3 short tips"],' +
            '"checklist":[{"label":"Greeted and verified identity","done":true|false},{"label":"Acknowledged the issue with empathy","done":true|false},' +
            '{"label":"Explained the resolution or next step","done":true|false},{"label":"Confirmed the customer is satisfied","done":true|false}],' +
            '"warnings":["compliance or tone risks, empty if none"]}'
        );
        List<Map<String, Object>> checklist = new List<Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(ai, 'checklist')) {
            if (raw instanceof Map<String, Object>) {
                Map<String, Object> item = (Map<String, Object>) raw;
                checklist.add(new Map<String, Object>{ 'label' => SLK_AIService.getStr(item, 'label'), 'done' => item.get('done') == true });
            }
        }
        return new Map<String, Object>{
            'sentiment' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'sentiment'), SENTIMENTS, 'Neutral'),
            'sentimentScore' => SLK_AIService.getInt(ai, 'sentimentScore', 50),
            'customerIntent' => SLK_AIService.getStr(ai, 'customerIntent'),
            'nextLine' => SLK_AIService.getStr(ai, 'nextLine'),
            'tips' => stringList(SLK_AIService.getList(ai, 'tips')),
            'checklist' => checklist,
            'warnings' => stringList(SLK_AIService.getList(ai, 'warnings'))
        };
    }

    public static Map<String, Object> wrapUp(Id workId) {
        SLK_Work_Item__c work = SLK_RoutingService.loadWork(workId);
        String context = work.Case__c == null ? 'CASE: ' + work.Subject__c : caseContext(work.Case__c);
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You write after-contact wrap-up notes for service agents. Be concise and factual; only use what happened in the conversation and case.',
            context + '\n\nCHANNEL: ' + work.Channel__c + '\nTRANSCRIPT:\n' + transcript(workId, 80) +
            '\n\nJSON shape: {"summary":"3-5 sentence summary of the contact","resolution":"what was done or agreed",' +
            '"disposition":"Resolved|Follow-up required|Escalated","caseStatus":"Working|Waiting on Customer|Escalated|Closed",' +
            '"sentiment":"Positive|Neutral|Negative","followUps":["concrete follow-up tasks, empty if none"]}'
        );
        return new Map<String, Object>{
            'summary' => SLK_AIService.getStr(ai, 'summary'),
            'resolution' => SLK_AIService.getStr(ai, 'resolution'),
            'disposition' => SLK_AIService.pick(
                SLK_AIService.getStr(ai, 'disposition'),
                new Set<String>{ 'Resolved', 'Follow-up required', 'Escalated' },
                'Follow-up required'
            ),
            'caseStatus' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'caseStatus'), SLK_RoutingService.CASE_STATUSES, 'Working'),
            'sentiment' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'sentiment'), SENTIMENTS, 'Neutral'),
            'followUps' => stringList(SLK_AIService.getList(ai, 'followUps'))
        };
    }

    public static Map<String, Object> draftNote(Id caseId, String style, String agentNotes) {
        String key = NOTE_STYLES.containsKey(style) ? style : 'summary';
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You write case comments for service agents. Use only facts from the case data; never invent order numbers, dates, or promises. ' +
            'Plain text, no markdown headings, no greeting or sign-off unless the comment is for the customer. Under 120 words.',
            caseContext(caseId) + '\n\nTODAY: ' + Date.today().format() +
            (String.isBlank(agentNotes) ? '' : '\n\nAGENT\'S ROUGH NOTES TO BUILD ON:\n' + SLK_AIService.truncate(agentNotes, 1500)) +
            '\n\nWrite ' + NOTE_STYLES.get(key) + '.\nJSON shape: {"text":"the comment"}'
        );
        return new Map<String, Object>{ 'text' => SLK_AIService.getStr(ai, 'text'), 'style' => key, 'isPublic' => key == 'customer' };
    }

    public static Map<String, Object> rewrite(String text, String tone) {
        if (String.isBlank(text)) {
            throw new AIServiceException('Write something to rewrite.');
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You polish customer service replies. Keep the meaning and facts, fix grammar, and match the requested tone.',
            'TONE: ' + (String.isBlank(tone) ? 'warm and professional' : tone) + '\nTEXT: ' + SLK_AIService.truncate(text, 3000) +
            '\n\nJSON shape: {"text":"rewritten reply"}'
        );
        return new Map<String, Object>{ 'text' => SLK_AIService.getStr(ai, 'text') };
    }

    // ---------------------------------------------------------------- supervisor and agent focus

    public static Map<String, Object> supervisorInsights() {
        Map<String, Object> snapshot = SLK_RoutingService.supervisor();
        snapshot.remove('serverTime');
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are an AI operations analyst for a contact center supervisor. Read the live floor snapshot and surface what needs attention now. ' +
            'Be specific: name agents, queues, and work items.',
            'LIVE SNAPSHOT (JSON):\n' + SLK_AIService.truncate(JSON.serialize(compact(snapshot)), 12000) +
            '\n\nJSON shape: {"headline":"one sentence on overall floor health","insights":[{"severity":"critical|warning|info",' +
            '"title":"short","detail":"one or two sentences","action":"recommended supervisor action"}],' +
            '"staffing":"one sentence staffing recommendation"} — at most 5 insights.'
        );
        List<Map<String, Object>> insights = new List<Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(ai, 'insights')) {
            if (raw instanceof Map<String, Object>) {
                Map<String, Object> item = (Map<String, Object>) raw;
                insights.add(
                    new Map<String, Object>{
                        'severity' => SLK_AIService.pick(SLK_AIService.getStr(item, 'severity'), new Set<String>{ 'critical', 'warning', 'info' }, 'info'),
                        'title' => SLK_AIService.getStr(item, 'title'),
                        'detail' => SLK_AIService.getStr(item, 'detail'),
                        'action' => SLK_AIService.getStr(item, 'action')
                    }
                );
            }
        }
        return new Map<String, Object>{
            'headline' => SLK_AIService.getStr(ai, 'headline'),
            'insights' => insights,
            'staffing' => SLK_AIService.getStr(ai, 'staffing'),
            'generatedAt' => Datetime.now()
        };
    }

    private static Map<String, Object> compact(Map<String, Object> snapshot) {
        List<Object> agents = new List<Object>();
        for (Object raw : (List<Object>) snapshot.get('agents')) {
            Map<String, Object> agent = (Map<String, Object>) raw;
            List<String> work = new List<String>();
            for (Object w : (List<Object>) agent.get('work')) {
                Map<String, Object> item = (Map<String, Object>) w;
                work.add(item.get('channel') + ': ' + item.get('subject') + ' (sentiment ' + item.get('sentiment') + ')');
            }
            agents.add(
                new Map<String, Object>{
                    'name' => agent.get('name'),
                    'status' => agent.get('status'),
                    'load' => agent.get('usedCapacity') + '/' + agent.get('capacity'),
                    'closedToday' => agent.get('closedToday'),
                    'work' => work
                }
            );
        }
        return new Map<String, Object>{
            'kpis' => snapshot.get('kpis'),
            'queues' => snapshot.get('queues'),
            'alerts' => snapshot.get('alerts'),
            'agents' => agents
        };
    }

    public static Map<String, Object> focus(Id userId) {
        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Status, Priority, CreatedDate, LastModifiedDate, Contact.Name
            FROM Case
            WHERE OwnerId = :userId AND IsClosed = FALSE
            ORDER BY LastModifiedDate DESC
            LIMIT 15
        ];
        if (cases.isEmpty()) {
            return new Map<String, Object>{ 'items' => new List<Object>(), 'headline' => 'No open cases. Go online to receive work.' };
        }
        String block = '';
        for (Integer i = 0; i < cases.size(); i++) {
            Case c = cases[i];
            block +=
                'C' + (i + 1) + ' | ' + c.CaseNumber + ' | ' + c.Subject + ' | ' + c.Status + ' | ' + c.Priority +
                ' | opened ' + c.CreatedDate.format('yyyy-MM-dd') + ' | last touched ' + c.LastModifiedDate.format('yyyy-MM-dd') + '\n';
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You help a service agent plan their day. Pick the cases that deserve attention first and say why in a few words.',
            'TODAY: ' + Date.today().format() + '\nMY OPEN CASES:\n' + block +
            '\n\nJSON shape: {"headline":"one encouraging sentence about the day","items":[{"ref":"C1","reason":"max 14 words"}]} — at most 4 items.'
        );
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(ai, 'items')) {
            if (!(raw instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> item = (Map<String, Object>) raw;
            String digits = String.valueOf(item.get('ref')).replaceAll('[^0-9]', '');
            if (String.isBlank(digits)) {
                continue;
            }
            Integer idx = Integer.valueOf(digits);
            if (idx < 1 || idx > cases.size()) {
                continue;
            }
            Case c = cases[idx - 1];
            items.add(
                new Map<String, Object>{
                    'caseId' => c.Id,
                    'caseNumber' => c.CaseNumber,
                    'subject' => c.Subject,
                    'priority' => c.Priority,
                    'reason' => SLK_AIService.getStr(item, 'reason')
                }
            );
        }
        return new Map<String, Object>{ 'headline' => SLK_AIService.getStr(ai, 'headline'), 'items' => items };
    }

    // ---------------------------------------------------------------- grounding

    private static Case loadCase(Id caseId) {
        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Description, Status, Priority, Origin, Type, CreatedDate, IsEscalated, IsClosed, ContactId, AccountId,
                Contact.Name, Contact.Email, Contact.Title, Account.Name, Account.Industry, Owner.Name
            FROM Case
            WHERE Id = :caseId
        ];
        if (cases.isEmpty()) {
            throw new AIServiceException('Case not found.');
        }
        return cases[0];
    }

    @TestVisible
    private static String caseContext(Id caseId) {
        Case c = loadCase(caseId);
        String context =
            'CASE ' + c.CaseNumber + '\nSubject: ' + c.Subject + '\nStatus: ' + c.Status + ' | Priority: ' + c.Priority +
            ' | Channel: ' + c.Origin + ' | Type: ' + c.Type + ' | Opened: ' + c.CreatedDate.format('yyyy-MM-dd HH:mm') +
            (c.IsEscalated ? ' | ESCALATED' : '') +
            '\nDescription: ' + SLK_AIService.truncate(c.Description, 1500) +
            '\nCustomer: ' + c.Contact?.Name + (c.Contact?.Title == null ? '' : ' (' + c.Contact.Title + ')') +
            ' at ' + c.Account?.Name + (c.Account?.Industry == null ? '' : ', ' + c.Account.Industry) +
            '\nOwner: ' + c.Owner?.Name;

        if (c.AccountId != null) {
            Integer priorCases = [SELECT COUNT() FROM Case WHERE AccountId = :c.AccountId AND Id != :caseId];
            context += '\nOther cases for this account: ' + priorCases;
        }
        String comments = '';
        for (CaseComment comment : [
            SELECT CommentBody, CreatedDate, CreatedBy.Name
            FROM CaseComment
            WHERE ParentId = :caseId
            ORDER BY CreatedDate DESC
            LIMIT 6
        ]) {
            comments += '- ' + comment.CreatedDate.format('MM-dd HH:mm') + ' ' + comment.CreatedBy.Name + ': ' + SLK_AIService.truncate(comment.CommentBody, 400) + '\n';
        }
        if (String.isNotBlank(comments)) {
            context += '\n\nRECENT COMMENTS:\n' + comments;
        }
        String emails = '';
        for (EmailMessage email : [
            SELECT Subject, TextBody, Incoming, MessageDate
            FROM EmailMessage
            WHERE ParentId = :caseId
            ORDER BY MessageDate DESC
            LIMIT 4
        ]) {
            emails += '- ' + (email.Incoming ? 'FROM CUSTOMER' : 'TO CUSTOMER') + ': ' + email.Subject + ' — ' + SLK_AIService.truncate(email.TextBody, 400) + '\n';
        }
        if (String.isNotBlank(emails)) {
            context += '\n\nRECENT EMAILS:\n' + emails;
        }
        List<SLK_Work_Item__c> work = [
            SELECT Id, Channel__c
            FROM SLK_Work_Item__c
            WHERE Case__c = :caseId
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        if (!work.isEmpty()) {
            String convo = transcript(work[0].Id, 20);
            if (String.isNotBlank(convo)) {
                context += '\n\nLATEST ' + work[0].Channel__c.toUpperCase() + ' CONVERSATION:\n' + convo;
            }
        }
        return context;
    }

    private static String transcript(Id workId, Integer maxTurns) {
        List<SLK_Conversation_Message__c> rows = [
            SELECT Sender__c, Body__c
            FROM SLK_Conversation_Message__c
            WHERE Work_Item__c = :workId AND Sender__c IN ('Customer', 'Agent')
            ORDER BY Sent_At__c DESC, Name DESC
            LIMIT :maxTurns
        ];
        List<SLK_Conversation_Message__c> ordered = new List<SLK_Conversation_Message__c>();
        for (Integer i = rows.size() - 1; i >= 0; i--) {
            ordered.add(rows[i]);
        }
        return SLK_SimulationService.transcriptText(ordered);
    }

    private static String lastCustomerMessage(Id workId) {
        List<SLK_Conversation_Message__c> rows = [
            SELECT Body__c
            FROM SLK_Conversation_Message__c
            WHERE Work_Item__c = :workId AND Sender__c = 'Customer'
            ORDER BY Sent_At__c DESC, Name DESC
            LIMIT 1
        ];
        return rows.isEmpty() ? '' : SLK_AIService.truncate(rows[0].Body__c, 300);
    }

    private static String knowledgeSnippets(String text) {
        String block = '';
        for (Knowledge__kav article : SLK_ArticleService.searchArticles(text, 2)) {
            String body = SLK_AIService.stripHtml(
                String.isNotBlank(article.KCSArticle_Resolution__c) ? article.KCSArticle_Resolution__c : article.FAQ_Answer__c
            );
            block += '- ' + article.Title + ': ' + SLK_AIService.truncate(body, 500) + '\n';
        }
        return block;
    }

    private static List<String> stringList(List<Object> raw) {
        List<String> values = new List<String>();
        for (Object item : raw) {
            if (item != null && String.isNotBlank(String.valueOf(item))) {
                values.add(String.valueOf(item));
            }
        }
        return values;
    }
}