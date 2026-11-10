@IsTest
private class SLK_CommandCenterTest {
    private static final String SUBJECT_LINKED = 'GPUs fall off the bus after driver upgrade';
    private static final String SUBJECT_MISSING = 'Fans run at full speed after firmware update';

    private static final String KCS_DRAFT =
        '{"title":"Fans run at full speed after firmware update","summary":"Fans spin at 100% after updating firmware.",' +
        '"issue":"<p>Fans are loud.</p>","environment":"<p>Rack servers</p>","cause":"<p>Thermal profile reset.</p>",' +
        '"resolution":"<ol><li>Open the management console.</li><li>Restore the thermal profile.</li></ol>"}';
    private static final String QUALITY =
        '{"score":86,"verdict":"Ready","dimensions":[{"name":"Clarity","score":90,"note":"Clear"}],' +
        '"strengths":["Specific steps"],"issues":[{"severity":"low","field":"title","message":"ok","suggestion":"ok"}]}';

    @TestSetup
    static void setup() {
        Account account = new Account(Name = 'SLK Test Account');
        account.put('analyticsdemo_batch_id__c', 'SLK_TEST');
        insert account;
        Contact contact = new Contact(LastName = 'Tester', FirstName = 'SLK', Email = 'slk.tester@example.com', AccountId = account.Id);
        insert contact;

        List<Case> cases = new List<Case>();
        for (Integer i = 0; i < 3; i++) {
            cases.add(testCase(SUBJECT_LINKED, 'Xid 79 in dmesg', 'Technical Issue', contact));
        }
        for (Integer i = 0; i < 2; i++) {
            cases.add(testCase(SUBJECT_MISSING, 'Fans at 100%', 'Product Support', contact));
        }
        cases.add(testCase('Already covered case', 'covered', 'General', contact));
        insert cases;

        Knowledge__kav article = new Knowledge__kav(
            Title = 'GPUs drop off the bus (Xid 79) after driver upgrade',
            UrlName = 'gpus-drop-off-the-bus-test',
            Summary = 'Roll back the driver.',
            Language = 'en_US'
        );
        insert article;
        article = [SELECT KnowledgeArticleId FROM Knowledge__kav WHERE Id = :article.Id];
        KbManagement.PublishingService.publishArticle(article.KnowledgeArticleId, true);
        insert new CaseArticle(CaseId = cases[5].Id, KnowledgeArticleId = article.KnowledgeArticleId);
    }

    private static Case testCase(String subject, String description, String caseType, Contact contact) {
        return new Case(
            Subject = subject,
            Description = description,
            Status = 'New',
            Type = caseType,
            Origin = 'Web',
            ContactId = contact.Id,
            AccountId = contact.AccountId
        );
    }

    private static Knowledge__kav publishedArticle() {
        return [SELECT Id, KnowledgeArticleId FROM Knowledge__kav WHERE PublishStatus = 'Online' LIMIT 1];
    }

    private static Object call(String method, String path, Map<String, String> params, Map<String, Object> body) {
        return SLK_CommandCenterRest.route(
            method,
            SLK_CommandCenterRest.segments('/slk/' + path),
            params == null ? new Map<String, String>() : params,
            body == null ? new Map<String, Object>() : body
        );
    }

    private static void queue(List<String> responses) {
        SLK_AIService.mockResponses = new List<String>(responses);
    }

    private static String analysisJson() {
        return '{"themes":[' +
            '{"name":"GPU bus drops","kind":"UNLINKED","subjectIds":["S1"],"articleId":"A1","suggestedTitle":"GPU drops","articleType":"KCS",' +
            '"priority":"High","impactScore":80,"description":"GPUs disappear","rationale":"Existing article fits","keywords":["xid","gpu"]},' +
            '{"name":"Fan speed","kind":"MISSING","subjectIds":["S2"],"articleId":null,"suggestedTitle":"Fans at full speed","articleType":"KCS",' +
            '"priority":"Critical","impactScore":70,"description":"Fans loud","rationale":"No article","keywords":["fan"]}]}';
    }

    @IsTest
    static void dashboardHealthAndLists() {
        Test.startTest();
        Map<String, Object> dashboard = (Map<String, Object>) call('GET', 'dashboard', null, null);
        Map<String, Object> health = (Map<String, Object>) call('GET', 'health', null, null);
        Map<String, Object> uncovered = (Map<String, Object>) call(
            'GET',
            'cases',
            new Map<String, String>{ 'type' => 'Technical Issue', 'q' => 'GPU', 'scope' => 'open', 'limit' => '10' },
            null
        );
        call('GET', 'cases', new Map<String, String>{ 'type' => 'Unspecified', 'scope' => 'closed' }, null);
        List<Object> drafts = (List<Object>) call('GET', 'drafts', new Map<String, String>{ 'scope' => 'mine' }, null);
        call('GET', 'drafts', null, null);
        call('GET', 'reviews', new Map<String, String>{ 'scope' => 'mine' }, null);
        call('GET', 'reviews', new Map<String, String>{ 'scope' => 'submitted' }, null);
        call('GET', 'reviews', null, null);
        List<Object> reviewers = (List<Object>) call('GET', 'reviewers', null, null);
        Test.stopTest();

        Map<String, Object> totals = (Map<String, Object>) dashboard.get('totals');
        System.assertEquals(6, totals.get('cases'));
        System.assertEquals(1, totals.get('coveredCases'));
        System.assertEquals(3, uncovered.get('total'));
        System.assertEquals(1, ((List<Object>) health.get('top')).size());
        System.assertEquals(0, drafts.size());
        System.assertNotEquals(null, reviewers);
    }

    @IsTest
    static void gapAnalysisLinkAndDismiss() {
        queue(new List<String>{ analysisJson() });
        Test.startTest();
        Map<String, Object> result = (Map<String, Object>) call('POST', 'gaps/analyze', null, null);
        Test.stopTest();
        System.assertEquals(2, result.get('created'));

        SLK_Knowledge_Gap__c linkedGap = [SELECT Id, Matched_Article_Id__c FROM SLK_Knowledge_Gap__c WHERE Gap_Kind__c = 'Unlinked Content'];
        SLK_Knowledge_Gap__c missingGap = [SELECT Id FROM SLK_Knowledge_Gap__c WHERE Gap_Kind__c = 'Missing Content'];
        System.assertEquals(publishedArticle().KnowledgeArticleId, linkedGap.Matched_Article_Id__c);

        Map<String, Object> gapCases = (Map<String, Object>) call('GET', 'gaps/' + linkedGap.Id + '/cases', null, null);
        System.assertEquals(3, gapCases.get('total'));

        Map<String, Object> linked = (Map<String, Object>) call('POST', 'gaps/' + linkedGap.Id + '/link', null, null);
        System.assertEquals(3, linked.get('linked'));
        System.assertEquals('Covered', [SELECT Status__c FROM SLK_Knowledge_Gap__c WHERE Id = :linkedGap.Id].Status__c);

        call('POST', 'gaps/' + missingGap.Id + '/dismiss', null, new Map<String, Object>{ 'reason' => 'Not actionable' });
        System.assertEquals('Dismissed', [SELECT Status__c FROM SLK_Knowledge_Gap__c WHERE Id = :missingGap.Id].Status__c);
    }

    @IsTest
    static void draftReviewAndPublishLoop() {
        insert new SLK_Knowledge_Gap__c(
            Name = 'Fan speed',
            Gap_Kind__c = 'Missing Content',
            Status__c = 'Open',
            Member_Subjects__c = SUBJECT_MISSING,
            Suggested_Title__c = 'Fans at full speed',
            Suggested_Article_Type__c = 'KCS'
        );
        SLK_Knowledge_Gap__c gap = [SELECT Id FROM SLK_Knowledge_Gap__c LIMIT 1];

        queue(new List<String>{ KCS_DRAFT, '{"content":"<p>Better</p>","note":"Tightened"}', QUALITY, QUALITY, QUALITY, QUALITY });
        Test.startTest();
        Map<String, Object> draft = (Map<String, Object>) call('POST', 'gaps/' + gap.Id + '/draft', null, null);
        Id articleId = (Id) draft.get('articleId');
        Map<String, Object> again = (Map<String, Object>) call('POST', 'gaps/' + gap.Id + '/draft', null, null);
        System.assertEquals(true, again.get('existing'));

        Map<String, Object> assisted = (Map<String, Object>) call(
            'POST',
            'articles/' + articleId + '/assist',
            null,
            new Map<String, Object>{ 'field' => 'resolution', 'instruction' => 'Make it concise', 'content' => '<p>x</p>' }
        );
        System.assertEquals('<p>Better</p>', assisted.get('content'));

        call(
            'PATCH',
            'articles/' + articleId,
            null,
            new Map<String, Object>{
                'fields' => new Map<String, Object>{ 'summary' => 'Updated summary', 'visibleInPkb' => true, 'confidence' => 'Not Validated', 'urlName' => 'fans full speed' }
            }
        );
        Map<String, Object> quality = (Map<String, Object>) call('POST', 'articles/' + articleId + '/quality', null, null);
        System.assert((Integer) quality.get('score') > 0);

        User reviewer = [SELECT Id FROM User WHERE Id = :UserInfo.getUserId()];
        Map<String, Object> submitted = (Map<String, Object>) call(
            'POST',
            'articles/' + articleId + '/submit',
            null,
            new Map<String, Object>{ 'reviewerId' => reviewer.Id, 'notes' => 'Please review' }
        );
        Id reviewId = (Id) submitted.get('reviewId');
        call('POST', 'reviews/' + reviewId + '/quality', null, null);
        Map<String, Object> fetched = (Map<String, Object>) call('GET', 'reviews/' + reviewId, null, null);
        System.assertEquals('Pending', fetched.get('status'));
        call('POST', 'reviews/' + reviewId + '/decision', null, new Map<String, Object>{ 'decision' => 'changes', 'comments' => 'Add a cause' });

        Map<String, Object> resubmitted = (Map<String, Object>) call(
            'POST',
            'articles/' + articleId + '/submit',
            null,
            new Map<String, Object>{ 'reviewerId' => reviewer.Id, 'notes' => 'Fixed' }
        );
        Id secondReview = (Id) resubmitted.get('reviewId');
        call('POST', 'reviews/' + secondReview + '/decision', null, new Map<String, Object>{ 'decision' => 'approve', 'comments' => 'Looks good' });

        Map<String, Object> detail = (Map<String, Object>) call('GET', 'articles/' + articleId, null, null);
        System.assertEquals(2, ((List<Object>) detail.get('reviews')).size());

        Map<String, Object> published = (Map<String, Object>) call('POST', 'articles/' + articleId + '/publish', null, new Map<String, Object>());
        Test.stopTest();

        System.assertEquals(2, published.get('linkedCases'));
        System.assertEquals('Covered', [SELECT Status__c FROM SLK_Knowledge_Gap__c WHERE Id = :gap.Id].Status__c);
        System.assertEquals('Published', [SELECT Status__c FROM SLK_Article_Review__c WHERE Id = :secondReview].Status__c);
    }

    @IsTest
    static void revisionArchiveAndDiscard() {
        Knowledge__kav article = publishedArticle();
        Test.startTest();
        Map<String, Object> revision = (Map<String, Object>) call('POST', 'articles/' + article.Id + '/revise', null, new Map<String, Object>{ 'reason' => 'Outdated' });
        Id draftId = (Id) revision.get('articleId');
        Map<String, Object> again = (Map<String, Object>) call('POST', 'articles/' + article.Id + '/revise', null, null);
        System.assertEquals(draftId, again.get('articleId'));
        call('DELETE', 'articles/' + draftId, null, null);
        call('POST', 'articles/' + article.Id + '/archive', null, null);
        Test.stopTest();
        System.assertEquals(0, [SELECT COUNT() FROM Knowledge__kav WHERE PublishStatus = 'Draft']);
    }

    @IsTest
    static void caseToolsProbeAndDuplicates() {
        Knowledge__kav article = publishedArticle();
        Case gpuCase = [SELECT Id FROM Case WHERE Subject = :SUBJECT_LINKED LIMIT 1];
        Case fanCase = [SELECT Id FROM Case WHERE Subject = :SUBJECT_MISSING LIMIT 1];
        Test.setFixedSearchResults(new List<Id>{ article.Id });
        queue(
            new List<String>{
                '{"verdict":"COVERED","summary":"Article resolves it","matches":[{"ref":"C1","confidence":92,"reason":"Same Xid"}]}',
                '{"verdict":"PARTIAL","answer":"Roll back the driver.","citations":[{"ref":"C1","confidence":70,"reason":"Rollback"}],"suggestedTitle":null}',
                '{"clusters":[{"ids":["A1","A1"],"reason":"same","recommendation":"merge"}]}',
                KCS_DRAFT,
                KCS_DRAFT
            }
        );
        Test.startTest();
        Map<String, Object> suggestion = (Map<String, Object>) call('POST', 'cases/' + gpuCase.Id + '/suggest', null, null);
        Map<String, Object> linkOne = (Map<String, Object>) call(
            'POST',
            'cases/' + gpuCase.Id + '/link',
            null,
            new Map<String, Object>{ 'knowledgeArticleId' => article.KnowledgeArticleId }
        );
        Map<String, Object> linkSimilar = (Map<String, Object>) call(
            'POST',
            'cases/' + gpuCase.Id + '/link',
            null,
            new Map<String, Object>{ 'knowledgeArticleId' => article.KnowledgeArticleId, 'includeSimilar' => true }
        );
        Map<String, Object> probe = (Map<String, Object>) call('POST', 'probe', null, new Map<String, Object>{ 'question' => 'GPU driver bus failure' });
        Map<String, Object> dupes = (Map<String, Object>) call('POST', 'health/duplicates', null, null);
        Map<String, Object> fromCase = (Map<String, Object>) call('POST', 'cases/' + fanCase.Id + '/draft', null, null);
        Map<String, Object> fromTopic = (Map<String, Object>) call(
            'POST',
            'articles/generate',
            null,
            new Map<String, Object>{ 'topic' => 'How to reset fan profiles', 'type' => 'FAQ' }
        );
        Map<String, Object> blank = (Map<String, Object>) call('POST', 'articles', null, new Map<String, Object>{ 'title' => 'Blank', 'type' => 'KCS' });
        Test.stopTest();

        System.assertEquals('COVERED', suggestion.get('verdict'));
        System.assertEquals(1, ((List<Object>) suggestion.get('matches')).size());
        System.assertEquals(1, linkOne.get('linked'));
        System.assertEquals(2, linkSimilar.get('linked'));
        System.assertEquals('PARTIAL', probe.get('verdict'));
        System.assertEquals(1, dupes.get('scanned'));
        System.assertNotEquals(null, fromCase.get('gapId'));
        System.assertNotEquals(null, fromTopic.get('articleId'));
        System.assertNotEquals(null, blank.get('articleId'));
    }

    @IsTest
    static void restDispatchAndErrors() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/slk/dashboard';
        req.httpMethod = 'GET';
        RestContext.request = req;
        RestContext.response = new RestResponse();
        SLK_CommandCenterRest.doGet();
        System.assertEquals(200, RestContext.response.statusCode);

        req.requestURI = '/services/apexrest/slk/unknown';
        req.requestBody = Blob.valueOf('{}');
        RestContext.response = new RestResponse();
        SLK_CommandCenterRest.doPost();
        System.assertEquals(404, RestContext.response.statusCode);

        req.requestURI = '/services/apexrest/slk/probe';
        req.requestBody = Blob.valueOf('{"question":""}');
        RestContext.response = new RestResponse();
        SLK_CommandCenterRest.doPost();
        System.assertEquals(400, RestContext.response.statusCode);

        req.requestURI = '/services/apexrest/slk/articles/' + publishedArticle().Id;
        req.requestBody = Blob.valueOf('{"title":"x"}');
        RestContext.response = new RestResponse();
        SLK_CommandCenterRest.doPatch();
        System.assertEquals(400, RestContext.response.statusCode);

        RestContext.response = new RestResponse();
        SLK_CommandCenterRest.doDelete();
        System.assertEquals(400, RestContext.response.statusCode);

        insert new SLK_Knowledge_Gap__c(Name = 'Listed gap', Status__c = 'Open', Member_Subjects__c = SUBJECT_MISSING);
        List<Object> active = (List<Object>) SLK_CommandCenterRest.route('GET', new List<String>{ 'gaps' }, new Map<String, String>(), new Map<String, Object>());
        System.assertEquals(1, active.size());
        List<Object> all = (List<Object>) SLK_CommandCenterRest.route('GET', new List<String>{ 'gaps' }, new Map<String, String>{ 'status' => 'all' }, new Map<String, Object>());
        System.assertEquals(1, all.size());

        Knowledge__kav article = publishedArticle();
        Test.setFixedSearchResults(new List<Id>{ article.Id });
        List<Object> recent = (List<Object>) SLK_CommandCenterRest.route('GET', new List<String>{ 'articles' }, new Map<String, String>(), new Map<String, Object>());
        System.assertEquals(1, recent.size());
        List<Object> found = (List<Object>) SLK_CommandCenterRest.route('GET', new List<String>{ 'articles' }, new Map<String, String>{ 'q' => 'router' }, new Map<String, Object>());
        System.assertEquals(1, found.size());
    }

    @IsTest
    static void aiHelpers() {
        System.assertEquals(null, SLK_AIService.parseJsonObject('not json'));
        System.assertEquals(1, SLK_AIService.parseJsonObject('```json\n{"a":1}\n```').get('a'));
        System.assert(SLK_AIService.stripHtml('<p>Hello</p><p>World</p>').contains('World'));
        System.assertEquals('abc…', SLK_AIService.truncate('abcdef', 3));
        System.assertEquals(7, SLK_AIService.getInt(new Map<String, Object>{ 'n' => '7' }, 'n', 0));
        System.assertEquals('x', SLK_AIService.pick('y', new Set<String>{ 'a' }, 'x'));
        System.assertEquals(null, SLK_ArticleService.searchTerm('a an to'));
        System.assert(SLK_ArticleService.urlNameFor('Hello World!').startsWith('Hello-World-'));
        Boolean threw = false;
        try {
            SLK_AIService.generate('s', 'u');
        } catch (SLK_AIService.AIException e) {
            threw = true;
        }
        System.assert(threw);
    }
}