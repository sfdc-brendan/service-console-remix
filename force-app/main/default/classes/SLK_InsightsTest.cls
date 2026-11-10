@IsTest
private class SLK_InsightsTest {
    @TestSetup
    static void setup() {
        Account account = new Account(Name = 'SLK Insights Account');
        account.put('analyticsdemo_batch_id__c', 'SLK_TEST');
        insert account;
        insert new Contact(LastName = 'Insight', FirstName = 'Iris', Email = 'iris.insight@example.com', AccountId = account.Id);
    }

    private static Object call(String method, String path, Map<String, Object> body) {
        return SLK_ConsoleRest.route(method, SLK_ConsoleRest.segments('/slkconsole/' + path), body == null ? new Map<String, Object>() : body);
    }

    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    private static Case newCase(String subject, String status) {
        Contact contact = [SELECT Id, AccountId FROM Contact LIMIT 1];
        return new Case(Subject = subject, Status = status, Priority = 'High', Origin = 'Web', ContactId = contact.Id, AccountId = contact.AccountId);
    }

    @IsTest
    static void homePanelsSummarizeMyWork() {
        Case open = newCase('Router firmware update fails', 'Working');
        Case closed = newCase('Router firmware rollback', 'Closed');
        Case third = newCase('Billing address change', 'New');
        insert new List<Case>{ open, closed, third };
        insert new SLK_Work_Item__c(
            Channel__c = 'Voice',
            Status__c = 'Closed',
            Subject__c = 'Router firmware',
            Case__c = open.Id,
            Agent__c = UserInfo.getUserId(),
            Sentiment__c = 'Positive',
            Accepted_At__c = Datetime.now().addMinutes(-6),
            Closed_At__c = Datetime.now()
        );
        Task overdue = new Task(Subject = 'Call back Iris', ActivityDate = Date.today().addDays(-1), OwnerId = UserInfo.getUserId(), WhatId = open.Id);
        insert overdue;

        SLK_AIService.mockResponses = new List<String>{
            '{"headline":"Firmware drives volume","clusters":[{"label":"Router firmware","refs":["S1","S2","S99"],"trend":"surging",' +
            '"insight":"Updates fail on older routers","action":"Share the rollback article"}]}'
        };
        Test.startTest();
        Map<String, Object> sla = asMap(call('GET', 'home/sla', null));
        Map<String, Object> scorecard = asMap(call('GET', 'home/scorecard', null));
        Map<String, Object> tasks = asMap(call('GET', 'home/tasks', null));
        call('POST', 'tasks/' + overdue.Id + '/complete', null);
        Map<String, Object> trends = asMap(call('POST', 'ai/trends', null));
        Test.stopTest();

        System.assert(sla.containsKey('breached') && sla.get('items') instanceof List<Object>);
        System.assertEquals(7, ((List<Object>) scorecard.get('days')).size());
        System.assertEquals(1, scorecard.get('conversations'));
        System.assertEquals(100, scorecard.get('positivePct'));
        System.assertEquals(1, tasks.get('overdue'));
        System.assertEquals(true, asMap(((List<Object>) tasks.get('items'))[0]).get('overdue'));
        System.assertEquals('Completed', [SELECT Status FROM Task WHERE Id = :overdue.Id].Status);
        Map<String, Object> cluster = asMap(((List<Object>) trends.get('clusters'))[0]);
        System.assertEquals(2, cluster.get('count'), 'Out-of-range refs are dropped');
        System.assertEquals('steady', cluster.get('trend'), 'Unknown trends fall back to steady');
    }

    @IsTest
    static void accountProfileRollsUpEveryContact() {
        Case open = newCase('Router firmware update fails', 'Working');
        Case closed = newCase('Router firmware rollback', 'Closed');
        insert new List<Case>{ open, closed };
        insert new SLK_Work_Item__c(Channel__c = 'Messaging', Status__c = 'Closed', Subject__c = 'Firmware chat', Sentiment__c = 'Negative', Case__c = open.Id);
        Contact contact = [SELECT Id, AccountId FROM Contact LIMIT 1];
        SLK_AIService.mockResponses = new List<String>{
            '{"headline":"Firmware pain","summary":"One open issue.","relationship":"Shaky","caresAbout":["uptime"],"talkingPoints":["Ship fix"]}'
        };
        Test.startTest();
        Map<String, Object> viaContact = asMap(call('GET', 'account/' + contact.Id, null));
        Map<String, Object> insight = asMap(call('POST', 'ai/account/' + contact.AccountId + '/insight', null));
        Test.stopTest();

        Map<String, Object> stats = asMap(viaContact.get('stats'));
        System.assertEquals(contact.AccountId, asMap(viaContact.get('account')).get('id'), 'A contact id resolves to its account');
        System.assertEquals(1, stats.get('openCases'));
        System.assertEquals(1, stats.get('urgentOpen'), 'High-priority open cases count as urgent');
        System.assertEquals(2, stats.get('totalCases'));
        System.assertEquals(1, asMap(viaContact.get('sentiment')).get('Negative'));
        System.assertEquals(12, ((List<Object>) asMap(viaContact.get('activity')).get('months')).size());
        List<Object> contacts = (List<Object>) viaContact.get('contacts');
        System.assertEquals(1, asMap(contacts[0]).get('openCases'));
        System.assertNotEquals(null, viaContact.get('service'));
        System.assertNotEquals(null, viaContact.get('pipeline'));
        System.assertEquals('Stable', insight.get('relationship'), 'Unknown relationship labels fall back to Stable');
    }

    @IsTest
    static void draftsCaseNotesInEachStyle() {
        Case current = newCase('Router firmware update fails', 'Working');
        insert current;
        SLK_AIService.mockResponses = new List<String>{ '{"text":"Customer reports failed firmware update."}', '{"text":"Hi Iris, we are on it."}' };
        Test.startTest();
        Map<String, Object> internal = asMap(call('POST', 'ai/case/' + current.Id + '/note', new Map<String, Object>{ 'style' => 'bogus', 'notes' => 'tried reboot' }));
        Map<String, Object> customer = asMap(call('POST', 'ai/case/' + current.Id + '/note', new Map<String, Object>{ 'style' => 'customer' }));
        Test.stopTest();
        System.assertEquals('summary', internal.get('style'), 'Unknown styles fall back to a status note');
        System.assertEquals(false, internal.get('isPublic'));
        System.assertEquals(true, customer.get('isPublic'));
        System.assertEquals('Hi Iris, we are on it.', customer.get('text'));
    }

    @IsTest
    static void caseSlaAndSimilarCases() {
        Case current = newCase('Router firmware update fails', 'Working');
        Case solved = newCase('Firmware update stuck on router', 'Closed');
        insert new List<Case>{ current, solved };
        insert new CaseComment(ParentId = solved.Id, CommentBody = 'Rolled back to the previous firmware and it worked.');
        Test.setFixedSearchResults(new List<Id>{ solved.Id });

        Test.startTest();
        Map<String, Object> sla = asMap(call('GET', 'case/' + current.Id + '/sla', null));
        Map<String, Object> similar = asMap(call('GET', 'case/' + current.Id + '/similar', null));
        Test.stopTest();

        System.assert(sla.get('milestones') instanceof List<Object>);
        List<Object> items = (List<Object>) similar.get('items');
        System.assertEquals(1, items.size());
        System.assert(String.valueOf(asMap(items[0]).get('resolution')).contains('Rolled back'));
        System.assert(((List<Object>) asMap(items[0]).get('matched')).contains('firmware'));
        System.assertEquals(new List<String>{ 'router', 'firmware', 'update', 'fails' }, SLK_InsightsService.keyTerms('The router firmware update fails!'));
    }

    @IsTest
    static void callAnalysisPinsMarkersAndCaches() {
        SLK_Work_Item__c work = new SLK_Work_Item__c(Channel__c = 'Voice', Status__c = 'Closed', Subject__c = 'Router drops');
        insert work;
        Datetime start = Datetime.now().addMinutes(-5);
        insert new List<SLK_Conversation_Message__c>{
            new SLK_Conversation_Message__c(Work_Item__c = work.Id, Sender__c = 'System', Body__c = 'Call connected', Sent_At__c = start),
            new SLK_Conversation_Message__c(Work_Item__c = work.Id, Sender__c = 'Customer', Body__c = 'My router drops hourly.', Sent_At__c = start.addSeconds(5)),
            new SLK_Conversation_Message__c(Work_Item__c = work.Id, Sender__c = 'Agent', Body__c = 'I will send a replacement.', Sent_At__c = start.addSeconds(20))
        };

        SLK_AIService.mockResponses = new List<String>{
            '{"headline":"Replacement promised","summary":"Router fixed.","outcome":"Done","scores":{"empathy":140,"clarity":80},' +
            '"markers":[{"turn":"T1","kind":"issue","label":"Hourly drops"},{"turn":"T2","kind":"promise","label":"Replacement"},{"turn":"T9","kind":"issue"}],' +
            '"keywords":[{"term":"router","category":"product"},{"term":"Router","category":"product"}],"strengths":["Clear"],"improvements":[]}'
        };
        Test.startTest();
        SLK_CallAnalysisService.analyze(work.Id, false);
        Map<String, Object> cached = asMap(call('POST', 'ai/work/' + work.Id + '/analysis', null));
        Test.stopTest();

        List<Object> markers = (List<Object>) cached.get('markers');
        System.assertEquals(2, markers.size(), 'Markers outside the transcript are dropped');
        System.assertEquals(1, asMap(markers[0]).get('turn'));
        System.assertEquals('issue', asMap(markers[1]).get('kind'), 'Unknown kinds fall back to issue');
        System.assertEquals(100, asMap(cached.get('scores')).get('empathy'), 'Scores are clamped');
        System.assertEquals('Follow-up needed', cached.get('outcome'));
        System.assertEquals(1, ((List<Object>) cached.get('keywords')).size(), 'Duplicate keywords collapse');
        System.assertNotEquals(null, [SELECT Analysis__c FROM SLK_Work_Item__c WHERE Id = :work.Id].Analysis__c);

        SLK_Work_Item__c live = new SLK_Work_Item__c(Channel__c = 'Voice', Status__c = 'Accepted', Subject__c = 'Live');
        insert live;
        try {
            SLK_CallAnalysisService.analyze(live.Id, false);
            System.assert(false, 'Live calls cannot be analyzed yet');
        } catch (SLK_CallAnalysisService.AnalysisException e) {
            System.assert(e.getMessage().contains('after the conversation ends'));
        }
    }
}