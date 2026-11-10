/**
 * Knowledge article lifecycle for the Command Center: AI drafting from cases and gaps,
 * editing, AI writing assistance, quality scoring, publishing, versioning, and
 * case-to-article matching.
 */
public with sharing class SLK_ArticleService {
    private static final String LANG = 'en_US';
    private static final Set<String> CONFIDENCE = new Set<String>{ 'Work in Progress', 'Not Validated', 'Validated', 'Archived' };
    private static final Set<String> STOP_WORDS = new Set<String>{
        'after', 'again', 'about', 'cannot', 'could', 'does', 'from', 'have', 'into', 'issue', 'need', 'not', 'our',
        'please', 'problem', 'since', 'still', 'that', 'than', 'their', 'them', 'then', 'there', 'they', 'this',
        'when', 'where', 'which', 'while', 'with', 'without', 'would', 'your', 'help', 'unable', 'getting', 'being'
    };

    private static final Map<String, String> FIELD_MAP = new Map<String, String>{
        'title' => 'Title',
        'summary' => 'Summary',
        'urlName' => 'UrlName',
        'issue' => 'KCSArticle_Issue__c',
        'environment' => 'KCSArticle_Environment__c',
        'cause' => 'KCSArticle_Cause__c',
        'resolution' => 'KCSArticle_Resolution__c',
        'question' => 'FAQ_Question__c',
        'answer' => 'FAQ_Answer__c',
        'internalNotes' => 'FAQ_Internal_Comments__c',
        'confidence' => 'Article_Confidence__c'
    };
    private static final Map<String, String> BOOLEAN_FIELD_MAP = new Map<String, String>{
        'visibleInPkb' => 'IsVisibleInPkb',
        'visibleInCsp' => 'IsVisibleInCsp',
        'visibleInPrm' => 'IsVisibleInPrm',
        'requiresRevision' => 'Requires_Revision__c'
    };

    public class ArticleException extends Exception {
    }

    // ---------------------------------------------------------------- drafting

    public static Map<String, Object> draftFromGap(Id gapId) {
        SLK_Knowledge_Gap__c gap = SLK_GapService.loadGap(gapId);
        if (gap.Draft_Article_Version_Id__c != null) {
            List<Knowledge__kav> existing = [
                SELECT Id
                FROM Knowledge__kav
                WHERE Id = :gap.Draft_Article_Version_Id__c AND PublishStatus = 'Draft'
            ];
            if (!existing.isEmpty()) {
                return new Map<String, Object>{ 'articleId' => existing[0].Id, 'existing' => true };
            }
        }
        List<String> subjects = SLK_GapService.memberSubjects(gap);
        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Description, Type, Status
            FROM Case
            WHERE Subject IN :subjects
            ORDER BY ClosedDate DESC NULLS LAST
            LIMIT 6
        ];
        String type = gap.Suggested_Article_Type__c == 'FAQ' ? 'FAQ' : 'KCS';
        String context =
            'GAP THEME: ' + gap.Name + '\nPROBLEM: ' + gap.Description__c + '\nSUGGESTED TITLE: ' + gap.Suggested_Title__c +
            '\nKEYWORDS: ' + gap.Keywords__c + '\n\n' + caseContext(cases);
        Map<String, Object> draft = SLK_AIService.generateJson(draftSystemPrompt(), draftUserPrompt(type, context));
        Knowledge__kav article = buildArticle(draft, type, gap.Suggested_Title__c);
        insert article;
        gap.Draft_Article_Version_Id__c = article.Id;
        gap.Status__c = 'Drafting';
        update gap;
        return new Map<String, Object>{ 'articleId' => article.Id, 'existing' => false };
    }

    public static Map<String, Object> draftFromCase(Id caseId) {
        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Description, Type, Status
            FROM Case
            WHERE Id = :caseId
        ];
        if (cases.isEmpty()) {
            throw new ArticleException('Case not found.');
        }
        Case source = cases[0];
        List<Case> siblings = [
            SELECT Id, CaseNumber, Subject, Description, Type, Status
            FROM Case
            WHERE Subject = :source.Subject AND Id != :source.Id
            ORDER BY ClosedDate DESC NULLS LAST
            LIMIT 3
        ];
        List<Case> contextCases = new List<Case>{ source };
        contextCases.addAll(siblings);
        Map<String, Object> draft = SLK_AIService.generateJson(
            draftSystemPrompt(),
            draftUserPrompt('KCS', caseContext(contextCases))
        );
        Knowledge__kav article = buildArticle(draft, 'KCS', source.Subject);
        insert article;

        Integer siblingsUncovered = [
            SELECT COUNT()
            FROM Case
            WHERE Subject = :source.Subject AND Id NOT IN (SELECT CaseId FROM CaseArticle)
        ];
        SLK_Knowledge_Gap__c gap = new SLK_Knowledge_Gap__c(
            Name = SLK_AIService.truncate(source.Subject, 80),
            Gap_Kind__c = 'Missing Content',
            Status__c = 'Drafting',
            Priority__c = 'Medium',
            Case_Count__c = siblingsUncovered,
            Description__c = 'Drafted directly from case ' + source.CaseNumber + '.',
            Member_Subjects__c = source.Subject,
            Suggested_Title__c = article.Title,
            Suggested_Article_Type__c = 'KCS',
            Case_Category__c = source.Type,
            Draft_Article_Version_Id__c = article.Id,
            Analysis_Run_Id__c = 'CASE-' + source.CaseNumber,
            Analyzed_At__c = Datetime.now()
        );
        insert gap;
        return new Map<String, Object>{ 'articleId' => article.Id, 'gapId' => gap.Id };
    }

    public static Map<String, Object> draftFromTopic(String topic, String type) {
        if (String.isBlank(topic)) {
            throw new ArticleException('Describe the topic to draft.');
        }
        String articleType = type == 'FAQ' ? 'FAQ' : 'KCS';
        Map<String, Object> draft = SLK_AIService.generateJson(
            draftSystemPrompt(),
            draftUserPrompt(
                articleType,
                'TOPIC FROM A KNOWLEDGE WORKER:\n' + SLK_AIService.truncate(topic, 2000) +
                '\n\nNo case history is available. Where specifics are unknown, insert clearly marked [SME: ...] placeholders instead of inventing facts.'
            )
        );
        Knowledge__kav article = buildArticle(draft, articleType, SLK_AIService.truncate(topic, 120));
        insert article;
        return new Map<String, Object>{ 'articleId' => article.Id };
    }

    public static Map<String, Object> createBlank(String title, String type) {
        String articleType = type == 'FAQ' ? 'FAQ' : 'KCS';
        String safeTitle = String.isBlank(title) ? 'Untitled article' : SLK_AIService.truncate(title, 255);
        Knowledge__kav article = new Knowledge__kav(
            Title = safeTitle,
            UrlName = urlNameFor(safeTitle),
            Language = LANG,
            RecordTypeId = recordTypeId(articleType),
            Article_Confidence__c = 'Work in Progress'
        );
        insert article;
        return new Map<String, Object>{ 'articleId' => article.Id };
    }

    private static String draftSystemPrompt() {
        return 'You are a senior technical writer following Knowledge-Centered Service (KCS) v6. You turn real support ' +
            'case history into reusable knowledge articles written in the customer\'s language. Be specific, use ' +
            'numbered steps for resolutions, and never invent version numbers, URLs, or commands that are not ' +
            'supported by the source material; use [SME: ...] placeholders instead. ' + SLK_AIService.HTML_RULES;
    }

    private static String draftUserPrompt(String type, String context) {
        String shape = type == 'FAQ'
            ? '{"title":"question-style title","summary":"1-2 plain-text sentences","question":"plain text question","answer":"HTML answer"}'
            : '{"title":"symptom-focused title","summary":"1-2 plain-text sentences","issue":"HTML","environment":"HTML",' +
              '"cause":"HTML","resolution":"HTML with an <ol> of steps"}';
        return 'Write a ' + type + ' knowledge article from this source material.\n\n' + context +
            '\n\nJSON shape: ' + shape;
    }

    private static String caseContext(List<Case> cases) {
        Set<Id> ids = new Map<Id, Case>(cases).keySet();
        Map<Id, List<String>> notes = new Map<Id, List<String>>();
        for (CaseComment comment : [
            SELECT ParentId, CommentBody
            FROM CaseComment
            WHERE ParentId IN :ids
            ORDER BY CreatedDate ASC
            LIMIT 30
        ]) {
            addNote(notes, comment.ParentId, 'Comment: ' + SLK_AIService.truncate(comment.CommentBody, 400));
        }
        for (EmailMessage email : [
            SELECT ParentId, TextBody, Incoming
            FROM EmailMessage
            WHERE ParentId IN :ids
            ORDER BY MessageDate ASC
            LIMIT 18
        ]) {
            addNote(
                notes,
                email.ParentId,
                (email.Incoming ? 'Customer email: ' : 'Agent email: ') + SLK_AIService.truncate(email.TextBody, 500)
            );
        }
        String block = 'SOURCE CASES:\n';
        for (Case c : cases) {
            block +=
                '--- Case ' + c.CaseNumber + ' (' + c.Status + ', ' + c.Type + ')\nSubject: ' + c.Subject +
                '\nDescription: ' + SLK_AIService.truncate(c.Description, 900) + '\n';
            if (notes.containsKey(c.Id)) {
                block += String.join(notes.get(c.Id), '\n') + '\n';
            }
        }
        return block;
    }

    private static void addNote(Map<Id, List<String>> notes, Id parentId, String note) {
        if (!notes.containsKey(parentId)) {
            notes.put(parentId, new List<String>());
        }
        notes.get(parentId).add(note);
    }

    private static Knowledge__kav buildArticle(Map<String, Object> draft, String type, String fallbackTitle) {
        String title = SLK_AIService.getStr(draft, 'title');
        if (String.isBlank(title)) {
            title = String.isBlank(fallbackTitle) ? 'Untitled article' : fallbackTitle;
        }
        title = SLK_AIService.truncate(title, 255);
        Knowledge__kav article = new Knowledge__kav(
            Title = title,
            UrlName = urlNameFor(title),
            Summary = SLK_AIService.truncate(SLK_AIService.getStr(draft, 'summary'), 1000),
            Language = LANG,
            RecordTypeId = recordTypeId(type),
            Article_Confidence__c = 'Work in Progress'
        );
        if (type == 'FAQ') {
            article.FAQ_Question__c = SLK_AIService.getStr(draft, 'question');
            article.FAQ_Answer__c = SLK_AIService.getStr(draft, 'answer');
        } else {
            article.KCSArticle_Issue__c = SLK_AIService.getStr(draft, 'issue');
            article.KCSArticle_Environment__c = SLK_AIService.getStr(draft, 'environment');
            article.KCSArticle_Cause__c = SLK_AIService.getStr(draft, 'cause');
            article.KCSArticle_Resolution__c = SLK_AIService.getStr(draft, 'resolution');
        }
        return article;
    }

    @TestVisible
    private static String urlNameFor(String title) {
        String slug = (title == null ? 'article' : title).replaceAll('[^A-Za-z0-9 ]', ' ').trim().replaceAll('\\s+', '-');
        if (String.isBlank(slug)) {
            slug = 'article';
        }
        return slug.left(200) + '-' + String.valueOf(Datetime.now().getTime()).right(8) + '-' + Crypto.getRandomInteger().format().replaceAll('[^0-9]', '').right(4);
    }

    private static Id recordTypeId(String type) {
        String needle = type == 'FAQ' ? '%FAQ%' : '%KCS%';
        List<RecordType> types = [
            SELECT Id
            FROM RecordType
            WHERE SobjectType = 'Knowledge__kav' AND DeveloperName LIKE :needle AND IsActive = TRUE
            LIMIT 1
        ];
        return types.isEmpty() ? null : types[0].Id;
    }

    // ---------------------------------------------------------------- read / write

    public static List<Map<String, Object>> listDrafts(String scope) {
        Id me = UserInfo.getUserId();
        List<Knowledge__kav> drafts = scope == 'mine'
            ? [
                  SELECT Id, KnowledgeArticleId, Title, ArticleNumber, VersionNumber, LastModifiedDate, RecordType.Name,
                      Owner.Name, CreatedBy.Name, Requires_Revision__c, Article_Confidence__c
                  FROM Knowledge__kav
                  WHERE PublishStatus = 'Draft' AND Language = :LANG AND (OwnerId = :me OR CreatedById = :me)
                  ORDER BY LastModifiedDate DESC
                  LIMIT 200
              ]
            : [
                  SELECT Id, KnowledgeArticleId, Title, ArticleNumber, VersionNumber, LastModifiedDate, RecordType.Name,
                      Owner.Name, CreatedBy.Name, Requires_Revision__c, Article_Confidence__c
                  FROM Knowledge__kav
                  WHERE PublishStatus = 'Draft' AND Language = :LANG
                  ORDER BY LastModifiedDate DESC
                  LIMIT 200
              ];
        Set<Id> ids = new Map<Id, Knowledge__kav>(drafts).keySet();
        Map<String, SLK_Article_Review__c> latestReview = new Map<String, SLK_Article_Review__c>();
        for (SLK_Article_Review__c review : [
            SELECT Id, Article_Version_Id__c, Status__c, AI_Quality_Score__c, Reviewer__r.Name, Round__c
            FROM SLK_Article_Review__c
            WHERE Article_Version_Id__c IN :ids
            ORDER BY CreatedDate DESC
        ]) {
            if (!latestReview.containsKey(review.Article_Version_Id__c)) {
                latestReview.put(review.Article_Version_Id__c, review);
            }
        }
        Map<String, SLK_Knowledge_Gap__c> gapByDraft = new Map<String, SLK_Knowledge_Gap__c>();
        for (SLK_Knowledge_Gap__c gap : [
            SELECT Id, Name, Case_Count__c, Draft_Article_Version_Id__c
            FROM SLK_Knowledge_Gap__c
            WHERE Draft_Article_Version_Id__c IN :ids
        ]) {
            gapByDraft.put(gap.Draft_Article_Version_Id__c, gap);
        }
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (Knowledge__kav draft : drafts) {
            String key = String.valueOf(draft.Id).left(18);
            SLK_Article_Review__c review = latestReview.get(key);
            SLK_Knowledge_Gap__c gap = gapByDraft.get(key);
            rows.add(
                new Map<String, Object>{
                    'id' => draft.Id,
                    'knowledgeArticleId' => draft.KnowledgeArticleId,
                    'title' => draft.Title,
                    'articleNumber' => draft.ArticleNumber,
                    'versionNumber' => draft.VersionNumber,
                    'lastModified' => draft.LastModifiedDate,
                    'recordType' => draft.RecordType?.Name,
                    'owner' => draft.Owner?.Name,
                    'requiresRevision' => draft.Requires_Revision__c,
                    'confidence' => draft.Article_Confidence__c,
                    'reviewStatus' => review?.Status__c,
                    'reviewId' => review?.Id,
                    'reviewer' => review?.Reviewer__r?.Name,
                    'qualityScore' => review?.AI_Quality_Score__c,
                    'gapId' => gap?.Id,
                    'gapName' => gap?.Name,
                    'gapCaseCount' => gap?.Case_Count__c
                }
            );
        }
        return rows;
    }

    public static List<Map<String, Object>> listPublished(String search) {
        List<Knowledge__kav> articles;
        String term = String.isBlank(search) ? null : search.trim().replaceAll('[?&|!{}\\[\\]()^~*:\\\\"\'+-]', ' ').trim();
        if (String.isNotBlank(term) && term.length() >= 2) {
            articles = (List<Knowledge__kav>) [
                FIND :term
                IN ALL FIELDS
                RETURNING
                    Knowledge__kav(
                        Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name, Article_Confidence__c
                        WHERE PublishStatus = 'Online' AND Language = 'en_US'
                        LIMIT 100)
            ][0];
        } else {
            articles = [
                SELECT Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name, Article_Confidence__c
                FROM Knowledge__kav
                WHERE PublishStatus = 'Online' AND Language = :LANG
                ORDER BY LastPublishedDate DESC
                LIMIT 100
            ];
        }
        Set<Id> kaIds = new Set<Id>();
        for (Knowledge__kav article : articles) {
            kaIds.add(article.KnowledgeArticleId);
        }
        Map<Id, Integer> counts = new Map<Id, Integer>();
        for (AggregateResult row : [
            SELECT KnowledgeArticleId kaId, COUNT(Id) total
            FROM CaseArticle
            WHERE KnowledgeArticleId IN :kaIds
            GROUP BY KnowledgeArticleId
        ]) {
            counts.put((Id) row.get('kaId'), (Integer) row.get('total'));
        }
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (Knowledge__kav article : articles) {
            Map<String, Object> row = SLK_CoverageService.articleRow(article);
            row.put('attachCount', counts.containsKey(article.KnowledgeArticleId) ? counts.get(article.KnowledgeArticleId) : 0);
            rows.add(row);
        }
        return rows;
    }

    public static Map<String, Object> getArticle(Id versionId) {
        Knowledge__kav article = loadArticle(versionId);
        Map<String, Object> fields = new Map<String, Object>();
        for (String key : FIELD_MAP.keySet()) {
            fields.put(key, article.get(FIELD_MAP.get(key)));
        }
        for (String key : BOOLEAN_FIELD_MAP.keySet()) {
            fields.put(key, article.get(BOOLEAN_FIELD_MAP.get(key)));
        }

        List<Map<String, Object>> reviews = new List<Map<String, Object>>();
        for (SLK_Article_Review__c review : [
            SELECT Id, Name, Status__c, Round__c, Reviewer__c, Reviewer__r.Name, Submitted_By__r.Name, Submitted_At__c,
                Decision_At__c, Submitter_Notes__c, Reviewer_Comments__c, AI_Quality_Score__c, AI_Quality_Report__c,
                Article_Version_Id__c
            FROM SLK_Article_Review__c
            WHERE Knowledge_Article_Id__c = :article.KnowledgeArticleId OR Article_Version_Id__c = :article.Id
            ORDER BY CreatedDate DESC
            LIMIT 20
        ]) {
            reviews.add(SLK_ReviewService.reviewRow(review));
        }

        List<SLK_Knowledge_Gap__c> gaps = [
            SELECT Id, Name, Case_Count__c, Status__c, Member_Subjects__c
            FROM SLK_Knowledge_Gap__c
            WHERE Draft_Article_Version_Id__c = :article.Id
            LIMIT 1
        ];
        Integer pendingLinks = 0;
        if (!gaps.isEmpty()) {
            List<String> subjects = SLK_GapService.memberSubjects(gaps[0]);
            pendingLinks = [
                SELECT COUNT()
                FROM Case
                WHERE Subject IN :subjects AND Id NOT IN (SELECT CaseId FROM CaseArticle)
            ];
        }
        Integer attached = article.KnowledgeArticleId == null
            ? 0
            : [SELECT COUNT() FROM CaseArticle WHERE KnowledgeArticleId = :article.KnowledgeArticleId];

        return new Map<String, Object>{
            'id' => article.Id,
            'knowledgeArticleId' => article.KnowledgeArticleId,
            'articleNumber' => article.ArticleNumber,
            'versionNumber' => article.VersionNumber,
            'publishStatus' => article.PublishStatus,
            'recordType' => article.RecordType?.DeveloperName != null &&
                article.RecordType.DeveloperName.containsIgnoreCase('FAQ')
                ? 'FAQ'
                : 'KCS',
            'recordTypeLabel' => article.RecordType?.Name,
            'owner' => article.Owner?.Name,
            'lastModified' => article.LastModifiedDate,
            'lastPublished' => article.LastPublishedDate,
            'views' => article.ArticleTotalViewCount,
            'fields' => fields,
            'reviews' => reviews,
            'gap' => gaps.isEmpty()
                ? null
                : new Map<String, Object>{
                      'id' => gaps[0].Id,
                      'name' => gaps[0].Name,
                      'status' => gaps[0].Status__c,
                      'caseCount' => gaps[0].Case_Count__c,
                      'pendingLinks' => pendingLinks
                  },
            'attachedCases' => attached
        };
    }

    public static Map<String, Object> saveArticle(Id versionId, Map<String, Object> changes) {
        Knowledge__kav article = loadArticle(versionId);
        if (article.PublishStatus != 'Draft') {
            throw new ArticleException('Only draft articles can be edited. Start a new version first.');
        }
        Knowledge__kav updated = new Knowledge__kav(Id = article.Id);
        for (String key : changes.keySet()) {
            Object value = changes.get(key);
            if (FIELD_MAP.containsKey(key)) {
                String text = value == null ? null : String.valueOf(value);
                if (key == 'confidence' && text != null && !CONFIDENCE.contains(text)) {
                    continue;
                }
                if (key == 'urlName') {
                    text = text == null ? null : text.replaceAll('[^A-Za-z0-9-]', '-').left(255);
                }
                updated.put(FIELD_MAP.get(key), text);
            } else if (BOOLEAN_FIELD_MAP.containsKey(key)) {
                updated.put(BOOLEAN_FIELD_MAP.get(key), value == true);
            }
        }
        update updated;
        return getArticle(versionId);
    }

    public static Map<String, Object> deleteDraft(Id versionId) {
        Knowledge__kav article = loadArticle(versionId);
        if (article.PublishStatus != 'Draft') {
            throw new ArticleException('Only drafts can be discarded.');
        }
        KbManagement.PublishingService.deleteDraftArticle(article.KnowledgeArticleId);
        List<SLK_Knowledge_Gap__c> gaps = [
            SELECT Id
            FROM SLK_Knowledge_Gap__c
            WHERE Draft_Article_Version_Id__c = :article.Id
        ];
        for (SLK_Knowledge_Gap__c gap : gaps) {
            gap.Draft_Article_Version_Id__c = null;
            gap.Status__c = 'Open';
        }
        update gaps;
        List<SLK_Article_Review__c> openReviews = [
            SELECT Id
            FROM SLK_Article_Review__c
            WHERE Article_Version_Id__c = :article.Id AND Status__c IN ('Pending', 'Approved', 'Changes Requested')
        ];
        for (SLK_Article_Review__c review : openReviews) {
            review.Status__c = 'Withdrawn';
        }
        update openReviews;
        return new Map<String, Object>{ 'deleted' => true };
    }

    // ---------------------------------------------------------------- AI assistance

    public static Map<String, Object> assist(Id versionId, Map<String, Object> body) {
        Knowledge__kav article = loadArticle(versionId);
        String field = SLK_AIService.getStr(body, 'field');
        String instruction = SLK_AIService.getStr(body, 'instruction');
        String content = SLK_AIService.getStr(body, 'content');
        if (String.isBlank(instruction)) {
            throw new ArticleException('Tell the assistant what to change.');
        }
        Boolean plain = field == 'title' || field == 'summary' || field == 'question';
        Map<String, Object> result = SLK_AIService.generateJson(
            draftSystemPrompt(),
            'ARTICLE TITLE: ' + article.Title + '\nFIELD: ' + field + '\nCURRENT CONTENT:\n' +
            (String.isBlank(content) ? '(empty)' : SLK_AIService.truncate(content, 8000)) +
            '\n\nARTICLE CONTEXT:\n' + articleText(article, 4000) +
            '\n\nINSTRUCTION: ' + SLK_AIService.truncate(instruction, 800) +
            '\n\nReturn the rewritten field as ' + (plain ? 'plain text (no HTML)' : 'HTML') +
            '. JSON shape: {"content":"...","note":"one short sentence describing what you changed"}'
        );
        return new Map<String, Object>{
            'content' => SLK_AIService.getStr(result, 'content'),
            'note' => SLK_AIService.getStr(result, 'note')
        };
    }

    public static Map<String, Object> qualityCheck(Id versionId) {
        Knowledge__kav article = loadArticle(versionId);
        Boolean faq = article.RecordType?.DeveloperName != null && article.RecordType.DeveloperName.containsIgnoreCase('FAQ');

        List<Map<String, Object>> ruleIssues = new List<Map<String, Object>>();
        if (String.isBlank(article.Title) || article.Title.length() < 15) {
            ruleIssues.add(issue('high', 'title', 'Title is too short to be findable.', 'Describe the symptom in the customer\'s words.'));
        } else if (article.Title.length() > 120) {
            ruleIssues.add(issue('low', 'title', 'Title is longer than 120 characters.', 'Tighten the title to the core symptom.'));
        }
        if (String.isBlank(article.Summary)) {
            ruleIssues.add(issue('medium', 'summary', 'Summary is empty.', 'Add a 1-2 sentence summary for search results.'));
        }
        if (faq) {
            if (String.isBlank(article.FAQ_Answer__c)) {
                ruleIssues.add(issue('high', 'answer', 'Answer is empty.', 'Write the answer.'));
            }
        } else {
            if (String.isBlank(article.KCSArticle_Issue__c)) {
                ruleIssues.add(issue('high', 'issue', 'Issue section is empty.', 'Describe the symptom the customer sees.'));
            }
            if (String.isBlank(article.KCSArticle_Resolution__c)) {
                ruleIssues.add(issue('high', 'resolution', 'Resolution section is empty.', 'Add numbered resolution steps.'));
            }
        }
        if (articleText(article, 20000).contains('[SME')) {
            ruleIssues.add(issue('high', 'resolution', 'Unresolved [SME: ...] placeholders remain.', 'Replace every placeholder with verified detail.'));
        }

        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are a strict KCS knowledge quality reviewer. Score articles against the KCS Article Quality Index: ' +
            'clarity, completeness, accuracy signals (specific, verifiable steps), structure, findability, and tone.',
            'ARTICLE TYPE: ' + (faq ? 'FAQ' : 'KCS') + '\n' + articleText(article, 12000) +
            '\n\nJSON shape: {"score":0-100,"verdict":"Ready|Needs work|Not ready",' +
            '"dimensions":[{"name":"Clarity|Completeness|Accuracy|Structure|Findability|Tone","score":0-100,"note":"short"}],' +
            '"strengths":["short"],"issues":[{"severity":"high|medium|low","field":"title|summary|issue|environment|cause|resolution|question|answer",' +
            '"message":"short","suggestion":"short"}]}'
        );

        List<Object> issues = new List<Object>();
        for (Map<String, Object> rule : ruleIssues) {
            issues.add(rule);
        }
        issues.addAll(SLK_AIService.getList(ai, 'issues'));
        Integer score = Math.min(Math.max(SLK_AIService.getInt(ai, 'score', 0), 0), 100);
        for (Map<String, Object> rule : ruleIssues) {
            if (rule.get('severity') == 'high') {
                score = Math.max(score - 8, 0);
            }
        }
        String verdict = score >= 80 ? 'Ready' : (score >= 60 ? 'Needs work' : 'Not ready');
        return new Map<String, Object>{
            'score' => score,
            'verdict' => verdict,
            'dimensions' => SLK_AIService.getList(ai, 'dimensions'),
            'strengths' => SLK_AIService.getList(ai, 'strengths'),
            'issues' => issues,
            'checkedAt' => Datetime.now()
        };
    }

    private static Map<String, Object> issue(String severity, String field, String message, String suggestion) {
        return new Map<String, Object>{
            'severity' => severity,
            'field' => field,
            'message' => message,
            'suggestion' => suggestion,
            'source' => 'rule'
        };
    }

    public static String articleText(Knowledge__kav article, Integer maxLength) {
        String text =
            'Title: ' + article.Title + '\nSummary: ' + (article.Summary == null ? '' : article.Summary) +
            section('Question', article.FAQ_Question__c) + section('Answer', article.FAQ_Answer__c) +
            section('Issue', article.KCSArticle_Issue__c) + section('Environment', article.KCSArticle_Environment__c) +
            section('Cause', article.KCSArticle_Cause__c) + section('Resolution', article.KCSArticle_Resolution__c);
        return text.length() > maxLength ? text.left(maxLength) : text;
    }

    private static String section(String label, String html) {
        return String.isBlank(html) ? '' : '\n' + label + ':\n' + SLK_AIService.stripHtml(html);
    }

    // ---------------------------------------------------------------- lifecycle

    public static Map<String, Object> publish(Id versionId, Boolean linkGapCases) {
        Knowledge__kav article = loadArticle(versionId);
        if (article.PublishStatus != 'Draft') {
            throw new ArticleException('Only draft articles can be published.');
        }
        List<SLK_Article_Review__c> approved = [
            SELECT Id
            FROM SLK_Article_Review__c
            WHERE Article_Version_Id__c = :article.Id AND Status__c = 'Approved'
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        if (approved.isEmpty()) {
            throw new ArticleException('This draft needs an approved review before it can be published.');
        }

        Knowledge__kav validated = new Knowledge__kav(Id = article.Id, Article_Confidence__c = 'Validated', Requires_Revision__c = false);
        update validated;
        KbManagement.PublishingService.publishArticle(article.KnowledgeArticleId, true);

        approved[0].Status__c = 'Published';
        update approved;

        Integer linked = 0;
        List<SLK_Knowledge_Gap__c> gaps = [
            SELECT Id, Member_Subjects__c, Linked_Case_Count__c
            FROM SLK_Knowledge_Gap__c
            WHERE Draft_Article_Version_Id__c = :article.Id
        ];
        for (SLK_Knowledge_Gap__c gap : gaps) {
            if (linkGapCases != false) {
                linked += SLK_GapService.linkCasesBySubject(SLK_GapService.memberSubjects(gap), article.KnowledgeArticleId);
            }
            gap.Status__c = 'Covered';
            gap.Resolved_At__c = Datetime.now();
            gap.Linked_Case_Count__c = linked;
            gap.Matched_Article_Id__c = article.KnowledgeArticleId;
        }
        update gaps;

        return new Map<String, Object>{
            'published' => true,
            'knowledgeArticleId' => article.KnowledgeArticleId,
            'linkedCases' => linked
        };
    }

    public static Map<String, Object> startRevision(Id versionId, String reason) {
        Knowledge__kav article = loadArticle(versionId);
        if (article.PublishStatus == 'Draft') {
            return new Map<String, Object>{ 'articleId' => article.Id, 'existing' => true };
        }
        List<Knowledge__kav> existingDraft = [
            SELECT Id
            FROM Knowledge__kav
            WHERE KnowledgeArticleId = :article.KnowledgeArticleId AND PublishStatus = 'Draft' AND Language = :LANG
            LIMIT 1
        ];
        if (!existingDraft.isEmpty()) {
            return new Map<String, Object>{ 'articleId' => existingDraft[0].Id, 'existing' => true };
        }
        String draftId = KbManagement.PublishingService.editOnlineArticle(article.KnowledgeArticleId, false);
        Knowledge__kav draft = new Knowledge__kav(Id = draftId, Requires_Revision__c = true);
        if (String.isNotBlank(reason)) {
            draft.FAQ_Internal_Comments__c = 'Revision requested: ' + SLK_AIService.truncate(reason, 2000);
        }
        update draft;
        return new Map<String, Object>{ 'articleId' => draftId, 'existing' => false };
    }

    public static Map<String, Object> archive(Id versionId) {
        Knowledge__kav article = loadArticle(versionId);
        if (article.PublishStatus != 'Online') {
            throw new ArticleException('Only published articles can be archived.');
        }
        KbManagement.PublishingService.archiveOnlineArticle(article.KnowledgeArticleId, null);
        return new Map<String, Object>{ 'archived' => true };
    }

    public static Knowledge__kav loadArticle(Id versionId) {
        List<Knowledge__kav> articles = [
            SELECT Id, KnowledgeArticleId, Title, Summary, UrlName, ArticleNumber, VersionNumber, PublishStatus, Language,
                RecordType.DeveloperName, RecordType.Name, Owner.Name, LastModifiedDate, LastPublishedDate,
                ArticleTotalViewCount, KCSArticle_Issue__c, KCSArticle_Environment__c, KCSArticle_Cause__c,
                KCSArticle_Resolution__c, FAQ_Question__c, FAQ_Answer__c, FAQ_Internal_Comments__c,
                Article_Confidence__c, IsVisibleInPkb, IsVisibleInCsp, IsVisibleInPrm, Requires_Revision__c
            FROM Knowledge__kav
            WHERE Id = :versionId
        ];
        if (articles.isEmpty()) {
            throw new ArticleException('Article not found.');
        }
        return articles[0];
    }

    // ---------------------------------------------------------------- case matching

    public static Map<String, Object> suggestForCase(Id caseId) {
        List<Case> cases = [SELECT Id, CaseNumber, Subject, Description, Type FROM Case WHERE Id = :caseId];
        if (cases.isEmpty()) {
            throw new ArticleException('Case not found.');
        }
        Case c = cases[0];
        List<Knowledge__kav> candidates = searchArticles(c.Subject + ' ' + SLK_AIService.truncate(c.Description, 300), 8);
        Integer siblings = [
            SELECT COUNT()
            FROM Case
            WHERE Subject = :c.Subject AND Id NOT IN (SELECT CaseId FROM CaseArticle)
        ];
        if (candidates.isEmpty()) {
            return new Map<String, Object>{
                'verdict' => 'NOT_COVERED',
                'summary' => 'No published article matched this case. It is a candidate for a new article.',
                'matches' => new List<Object>(),
                'similarUncovered' => siblings
            };
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are a support knowledge expert matching a case to existing knowledge articles.',
            'CASE ' + c.CaseNumber + '\nSubject: ' + c.Subject + '\nDescription: ' + SLK_AIService.truncate(c.Description, 1500) +
            '\n\nCANDIDATE ARTICLES:\n' + candidateBlock(candidates) +
            '\n\nDecide which candidates actually resolve this case. JSON shape: {"verdict":"COVERED|PARTIAL|NOT_COVERED",' +
            '"summary":"one sentence","matches":[{"ref":"C1","confidence":0-100,"reason":"short"}]} — include only candidates with confidence >= 40.'
        );
        return new Map<String, Object>{
            'verdict' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'verdict'), new Set<String>{ 'COVERED', 'PARTIAL', 'NOT_COVERED' }, 'NOT_COVERED'),
            'summary' => SLK_AIService.getStr(ai, 'summary'),
            'matches' => resolveMatches(SLK_AIService.getList(ai, 'matches'), candidates),
            'similarUncovered' => siblings
        };
    }

    public static Map<String, Object> linkCase(Id caseId, Id knowledgeArticleId, Boolean includeSimilar) {
        List<Case> cases = [SELECT Id, Subject FROM Case WHERE Id = :caseId];
        if (cases.isEmpty()) {
            throw new ArticleException('Case not found.');
        }
        Integer linked = 0;
        if (includeSimilar == true && String.isNotBlank(cases[0].Subject)) {
            linked = SLK_GapService.linkCasesBySubject(new List<String>{ cases[0].Subject }, knowledgeArticleId);
        } else {
            Integer existing = [
                SELECT COUNT()
                FROM CaseArticle
                WHERE CaseId = :caseId AND KnowledgeArticleId = :knowledgeArticleId
            ];
            if (existing == 0) {
                insert new CaseArticle(CaseId = caseId, KnowledgeArticleId = knowledgeArticleId);
                linked = 1;
            }
        }
        return new Map<String, Object>{ 'linked' => linked };
    }

    public static Map<String, Object> probe(String question) {
        if (String.isBlank(question)) {
            throw new ArticleException('Ask a question to probe coverage.');
        }
        List<Knowledge__kav> candidates = searchArticles(question, 6);
        if (candidates.isEmpty()) {
            return new Map<String, Object>{
                'verdict' => 'NOT_COVERED',
                'answer' => 'No published article addresses this question.',
                'citations' => new List<Object>(),
                'suggestedTitle' => SLK_AIService.truncate(question, 120)
            };
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You answer support questions strictly from the provided knowledge articles and judge how well the knowledge base covers the question.',
            'QUESTION: ' + SLK_AIService.truncate(question, 1500) + '\n\nARTICLES:\n' + candidateBlock(candidates) +
            '\n\nAnswer only from the articles. JSON shape: {"verdict":"COVERED|PARTIAL|NOT_COVERED","answer":"2-5 sentence answer or explanation of what is missing",' +
            '"citations":[{"ref":"C1","confidence":0-100,"reason":"what this article contributes"}],"suggestedTitle":"title for a new article if coverage is not complete, else null"}'
        );
        return new Map<String, Object>{
            'verdict' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'verdict'), new Set<String>{ 'COVERED', 'PARTIAL', 'NOT_COVERED' }, 'NOT_COVERED'),
            'answer' => SLK_AIService.getStr(ai, 'answer'),
            'citations' => resolveMatches(SLK_AIService.getList(ai, 'citations'), candidates),
            'suggestedTitle' => SLK_AIService.getStr(ai, 'suggestedTitle')
        };
    }

    public static Map<String, Object> findDuplicates() {
        List<Knowledge__kav> catalog = [
            SELECT Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name, Article_Confidence__c
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = :LANG
            ORDER BY Title
            LIMIT 600
        ];
        String block = '';
        for (Integer i = 0; i < catalog.size(); i++) {
            block += 'A' + (i + 1) + ' | ' + catalog[i].Title + '\n';
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You maintain a knowledge base and spot articles that cover the same problem and should be merged.',
            'PUBLISHED ARTICLES (id | title):\n' + block +
            '\nFind up to 10 groups of near-duplicate articles (same problem, same resolution). JSON shape: ' +
            '{"clusters":[{"ids":["A1","A9"],"reason":"short","recommendation":"which to keep and what to merge"}]}'
        );
        List<Map<String, Object>> clusters = new List<Map<String, Object>>();
        for (Object item : SLK_AIService.getList(ai, 'clusters')) {
            if (!(item instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> cluster = (Map<String, Object>) item;
            List<Map<String, Object>> members = new List<Map<String, Object>>();
            for (Object ref : SLK_AIService.getList(cluster, 'ids')) {
                String digits = String.valueOf(ref).replaceAll('[^0-9]', '');
                if (String.isBlank(digits)) {
                    continue;
                }
                Integer idx = Integer.valueOf(digits);
                if (idx >= 1 && idx <= catalog.size()) {
                    members.add(SLK_CoverageService.articleRow(catalog[idx - 1]));
                }
            }
            if (members.size() > 1) {
                clusters.add(
                    new Map<String, Object>{
                        'articles' => members,
                        'reason' => SLK_AIService.getStr(cluster, 'reason'),
                        'recommendation' => SLK_AIService.getStr(cluster, 'recommendation')
                    }
                );
            }
        }
        return new Map<String, Object>{ 'clusters' => clusters, 'scanned' => catalog.size() };
    }

    @TestVisible
    private static String searchTerm(String text) {
        if (String.isBlank(text)) {
            return null;
        }
        List<String> words = new List<String>();
        for (String raw : text.toLowerCase().replaceAll('[^a-z0-9 ]', ' ').split(' ')) {
            if (raw.length() >= 4 && !STOP_WORDS.contains(raw) && !words.contains(raw)) {
                words.add(raw);
            }
            if (words.size() >= 8) {
                break;
            }
        }
        return words.isEmpty() ? null : String.join(words, ' OR ');
    }

    public static List<Knowledge__kav> searchArticles(String text, Integer limitSize) {
        String term = searchTerm(text);
        if (term == null) {
            return new List<Knowledge__kav>();
        }
        List<List<SObject>> results = [
            FIND :term
            IN ALL FIELDS
            RETURNING
                Knowledge__kav(
                    Id, KnowledgeArticleId, Title, Summary, ArticleNumber, KCSArticle_Resolution__c, FAQ_Answer__c
                    WHERE PublishStatus = 'Online' AND Language = 'en_US'
                    LIMIT 10)
        ];
        List<Knowledge__kav> articles = (List<Knowledge__kav>) results[0];
        while (articles.size() > limitSize) {
            articles.remove(articles.size() - 1);
        }
        return articles;
    }

    private static String candidateBlock(List<Knowledge__kav> candidates) {
        String block = '';
        for (Integer i = 0; i < candidates.size(); i++) {
            Knowledge__kav a = candidates[i];
            String body = SLK_AIService.stripHtml(String.isNotBlank(a.KCSArticle_Resolution__c) ? a.KCSArticle_Resolution__c : a.FAQ_Answer__c);
            block +=
                'C' + (i + 1) + ' | ' + a.Title + '\nSummary: ' + SLK_AIService.truncate(a.Summary, 300) + '\nContent: ' +
                SLK_AIService.truncate(body, 700) + '\n';
        }
        return block;
    }

    private static List<Map<String, Object>> resolveMatches(List<Object> raw, List<Knowledge__kav> candidates) {
        List<Map<String, Object>> matches = new List<Map<String, Object>>();
        Set<Integer> seen = new Set<Integer>();
        for (Object item : raw) {
            if (!(item instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> match = (Map<String, Object>) item;
            String digits = String.valueOf(match.get('ref')).replaceAll('[^0-9]', '');
            if (String.isBlank(digits)) {
                continue;
            }
            Integer idx = Integer.valueOf(digits);
            if (idx < 1 || idx > candidates.size() || seen.contains(idx)) {
                continue;
            }
            seen.add(idx);
            Knowledge__kav a = candidates[idx - 1];
            matches.add(
                new Map<String, Object>{
                    'id' => a.Id,
                    'knowledgeArticleId' => a.KnowledgeArticleId,
                    'title' => a.Title,
                    'articleNumber' => a.ArticleNumber,
                    'summary' => a.Summary,
                    'confidence' => SLK_AIService.getInt(match, 'confidence', 50),
                    'reason' => SLK_AIService.getStr(match, 'reason')
                }
            );
        }
        return matches;
    }
}