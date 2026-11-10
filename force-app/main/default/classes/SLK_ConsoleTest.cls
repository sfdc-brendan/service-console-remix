@IsTest
private class SLK_ConsoleTest {
    private static final String SCENARIO =
        '{"subject":"Router drops connection every hour","description":"Customer router reboots hourly.","persona":"Calm",' +
        '"goal":"Stable connection","openingMessage":"Hi, my router keeps dropping.","priority":"High","queue":"Technical Support","sentiment":"Negative"}';

    @TestSetup
    static void setup() {
        Id permissionSetId = [SELECT Id FROM PermissionSet WHERE Name = 'SLK_Service_Console'].Id;
        Id userId = UserInfo.getUserId();
        if ([SELECT COUNT() FROM PermissionSetAssignment WHERE AssigneeId = :userId AND PermissionSetId = :permissionSetId] == 0) {
            System.runAs(new User(Id = userId)) {
                insert new PermissionSetAssignment(AssigneeId = userId, PermissionSetId = permissionSetId);
            }
        }
        Account account = new Account(Name = 'SLK Console Account');
        account.put('analyticsdemo_batch_id__c', 'SLK_TEST');
        insert account;
        insert new Contact(LastName = 'Customer', FirstName = 'Console', Email = 'console.customer@example.com', Phone = '+14155550100', AccountId = account.Id);
    }

    private static Object call(String method, String path, Map<String, Object> body) {
        return SLK_ConsoleRest.route(method, SLK_ConsoleRest.segments('/slkconsole/' + path), body == null ? new Map<String, Object>() : body);
    }

    private static void queue(List<String> responses) {
        SLK_AIService.mockResponses = new List<String>(responses);
    }

    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    private static Map<String, Object> injectAndAccept(String channel) {
        call('POST', 'presence', new Map<String, Object>{ 'status' => 'Online' });
        queue(new List<String>{ SCENARIO });
        Map<String, Object> work = asMap(call('POST', 'simulate', new Map<String, Object>{ 'channel' => channel }));
        Map<String, Object> omni = asMap(call('POST', 'omni/sync', null));
        List<Object> offers = (List<Object>) omni.get('offers');
        System.assertEquals(1, offers.size(), 'Online agent should receive the offer');
        System.assertEquals(work.get('id'), asMap(offers[0]).get('id'));
        return asMap(call('POST', 'work/' + work.get('id') + '/accept', null));
    }

    @IsTest
    static void routesVoiceWorkThroughFullLifecycle() {
        Test.startTest();
        Map<String, Object> accepted = injectAndAccept('Voice');
        String workId = (String) accepted.get('id');
        System.assertEquals('Accepted', accepted.get('status'));
        System.assertEquals('High', accepted.get('priority'));

        call('POST', 'work/' + workId + '/send', new Map<String, Object>{ 'body' => 'Let me check your router.' });
        queue(new List<String>{ '{"reply":"Thanks, that would be great.","sentiment":"Positive","resolved":false}' });
        Map<String, Object> convo = asMap(call('POST', 'work/' + workId + '/tick', null));
        List<Object> messages = (List<Object>) convo.get('messages');
        System.assertEquals('Customer', asMap(messages[messages.size() - 1]).get('sender'));

        call('POST', 'work/' + workId + '/hold', new Map<String, Object>{ 'onHold' => true });
        call('POST', 'work/' + workId + '/hold', new Map<String, Object>{ 'onHold' => false });

        queue(new List<String>{
            '{"sentiment":"Positive","sentimentScore":80,"customerIntent":"fix","nextLine":"Try a reboot.","tips":["Be clear"],' +
            '"checklist":[{"label":"Greeted","done":true}],"warnings":[]}',
            '{"intent":"fix","suggestions":[{"label":"Reboot","text":"Please reboot."}]}',
            '{"summary":"Fixed router.","resolution":"Firmware update","disposition":"Resolved","caseStatus":"Closed","sentiment":"Positive","followUps":[]}'
        });
        System.assertEquals('Positive', asMap(call('POST', 'ai/work/' + workId + '/coach', null)).get('sentiment'));
        System.assertEquals(1, ((List<Object>) asMap(call('POST', 'ai/work/' + workId + '/replies', null)).get('suggestions')).size());
        Map<String, Object> wrap = asMap(call('POST', 'ai/work/' + workId + '/wrapup', null));

        Map<String, Object> closed = asMap(
            call('POST', 'work/' + workId + '/close', new Map<String, Object>{
                'summary' => wrap.get('summary'),
                'caseStatus' => wrap.get('caseStatus'),
                'sentiment' => wrap.get('sentiment')
            })
        );
        Test.stopTest();

        System.assertEquals('Closed', closed.get('status'));
        Id caseId = (Id) closed.get('caseId');
        Case c = [SELECT Status FROM Case WHERE Id = :caseId];
        System.assertEquals('Closed', c.Status);
        System.assertEquals(1, [SELECT COUNT() FROM CaseComment WHERE ParentId = :c.Id]);
    }

    @IsTest
    static void declinedOfferReturnsToQueue() {
        call('POST', 'presence', new Map<String, Object>{ 'status' => 'Online' });
        queue(new List<String>());
        Map<String, Object> work = asMap(call('POST', 'simulate', new Map<String, Object>{ 'channel' => 'Messaging', 'priority' => 'Critical' }));
        System.assertEquals('Offered', work.get('status'));

        Map<String, Object> declined = asMap(call('POST', 'work/' + work.get('id') + '/decline', null));
        System.assertEquals('Queued', declined.get('status'), 'The only agent declined, so it waits in the queue');

        Map<String, Object> state = asMap(call('POST', 'presence', new Map<String, Object>{ 'status' => 'Break' }));
        System.assertEquals('Break', asMap(state.get('presence')).get('status'));
    }

    @IsTest
    static void supervisorCanReassignWhisperAndSeeFloor() {
        Map<String, Object> accepted = injectAndAccept('Messaging');
        Id me = UserInfo.getUserId();

        call('POST', 'supervisor/agents/' + me + '/whisper', new Map<String, Object>{ 'text' => 'Great job' });
        Map<String, Object> reassigned = asMap(call('POST', 'work/' + accepted.get('id') + '/reassign', new Map<String, Object>{ 'userId' => me }));
        System.assertEquals('Offered', reassigned.get('status'));

        Map<String, Object> floor = asMap(call('GET', 'supervisor', null));
        System.assertEquals(1, ((List<Object>) floor.get('agents')).size());
        System.assertEquals(1, asMap(floor.get('kpis')).get('active'));

        queue(new List<String>{ '{"headline":"Floor is calm","insights":[{"severity":"info","title":"OK","detail":"d","action":"a"}],"staffing":"Fine"}' });
        System.assertEquals('Floor is calm', asMap(call('POST', 'supervisor/insights', null)).get('headline'));

        call('POST', 'work/' + accepted.get('id') + '/transfer', new Map<String, Object>{ 'queue' => 'Billing', 'skill' => 'Billing' });
        Map<String, Object> me2 = asMap(call('GET', 'me', null));
        System.assertEquals('Great job', asMap(me2.get('presence')).get('whisper'));
        System.assertNotEquals(null, call('GET', 'home', null));
        System.assertNotEquals(null, call('GET', 'work/' + accepted.get('id'), null));
    }

    @IsTest
    static void caseIntelligenceAndActions() {
        Contact contact = [SELECT Id, AccountId FROM Contact LIMIT 1];
        Case c = new Case(Subject = 'Billing overcharge', Description = 'Charged twice', Status = 'New', Priority = 'Medium', ContactId = contact.Id, AccountId = contact.AccountId);
        insert c;
        insert new CaseComment(ParentId = c.Id, CommentBody = 'Customer called in.');

        queue(new List<String>{
            '{"headline":"Double charge","summary":"Customer was charged twice.","keyPoints":["Two charges"],"sentiment":"Negative",' +
            '"sentimentReason":"Upset","customerContext":"Long-time customer","risk":"high","riskReason":"Churn"}',
            '{"actions":[{"title":"Raise priority","rationale":"Churn risk","type":"updatePriority","confidence":90,"payload":{"priority":"High"}},' +
            '{"title":"Bad","type":"deleteEverything","payload":{}}]}',
            '{"headline":"Busy day","items":[{"ref":"C1","reason":"Churn risk"}]}',
            '{"text":"Polished reply"}'
        });
        Test.startTest();
        Map<String, Object> summary = asMap(call('POST', 'ai/case/' + c.Id + '/summary', null));
        Map<String, Object> nba = asMap(call('POST', 'ai/case/' + c.Id + '/actions', null));
        Map<String, Object> focus = asMap(call('POST', 'ai/focus', null));
        Map<String, Object> rewrite = asMap(call('POST', 'ai/rewrite', new Map<String, Object>{ 'text' => 'fix soon', 'tone' => 'warm' }));
        Map<String, Object> knowledge = asMap(call('POST', 'ai/case/' + c.Id + '/knowledge', null));

        for (String type : new List<String>{ 'updatePriority', 'updateStatus', 'createTask', 'escalate', 'sendEmail', 'addComment' }) {
            call('POST', 'case/' + c.Id + '/action', new Map<String, Object>{
                'type' => type,
                'payload' => new Map<String, Object>{
                    'priority' => 'High',
                    'status' => 'Working',
                    'subject' => 'Follow up',
                    'dueInDays' => 2,
                    'reason' => 'Churn risk',
                    'body' => 'Hello, we refunded you.'
                }
            });
        }
        Test.stopTest();

        System.assertEquals('high', summary.get('risk'));
        List<Object> actions = (List<Object>) nba.get('actions');
        System.assertEquals(1, actions.size(), 'Unknown action types are dropped');
        System.assertEquals(1, ((List<Object>) focus.get('items')).size());
        System.assertEquals('Polished reply', rewrite.get('text'));
        System.assertEquals('NOT_COVERED', knowledge.get('verdict'));
        Case updated = [SELECT Priority, Status, IsEscalated FROM Case WHERE Id = :c.Id];
        System.assertEquals('High', updated.Priority);
        System.assertEquals(true, updated.IsEscalated);
        System.assertEquals(1, [SELECT COUNT() FROM Task WHERE WhatId = :c.Id AND Subject = 'Follow up']);
        System.assertEquals(1, [SELECT COUNT() FROM EmailMessage WHERE ParentId = :c.Id]);
        System.assertEquals(1, ((List<Object>) call('GET', 'case/' + c.Id + '/emails', null)).size());
    }

    @IsTest
    static void customer360ResolvesFromAnyRecord() {
        Contact contact = [SELECT Id, AccountId FROM Contact LIMIT 1];
        Case open = new Case(Subject = 'Seat licenses', Status = 'Working', Priority = 'Low', Origin = 'Chat', ContactId = contact.Id, AccountId = contact.AccountId);
        Case closed = new Case(Subject = 'Invoice copy', Status = 'Closed', Priority = 'Low', Origin = 'Email', ContactId = contact.Id, AccountId = contact.AccountId);
        Case orphan = new Case(Subject = 'No contact', Status = 'New', Priority = 'Low', Origin = 'Web', AccountId = contact.AccountId);
        insert new List<Case>{ open, closed, orphan };
        insert new EmailMessage(ParentId = closed.Id, Subject = 'Your invoice', TextBody = 'Attached.', Incoming = false, Status = '3', MessageDate = Datetime.now());
        SLK_Work_Item__c work = new SLK_Work_Item__c(Channel__c = 'Messaging', Status__c = 'Closed', Subject__c = 'Seat licenses', Case__c = open.Id, Sentiment__c = 'Positive');
        insert work;

        queue(new List<String>{
            '{"headline":"Growing account","summary":"Adding engineers.","relationship":"Unknown","relationshipReason":"Healthy",' +
            '"caresAbout":["Fast onboarding"],"approach":"Be direct.","talkingPoints":["Seat pricing"]}'
        });
        Test.startTest();
        Map<String, Object> fromCase = asMap(call('GET', 'customer/' + open.Id, null));
        Map<String, Object> fromWork = asMap(call('GET', 'customer/' + work.Id, null));
        Map<String, Object> insight = asMap(call('POST', 'ai/customer/' + contact.Id + '/insight', null));
        Test.stopTest();

        Map<String, Object> stats = asMap(fromCase.get('stats'));
        System.assertEquals(1, stats.get('openCases'));
        System.assertEquals(2, stats.get('totalCases'));
        System.assertEquals(1, asMap(fromCase.get('sentiment')).get('Positive'));
        System.assertEquals(1, asMap(fromCase.get('channelMix')).get('Email'));
        System.assertEquals(4, ((List<Object>) fromCase.get('timeline')).size(), 'Two cases, one conversation, one email');
        System.assertEquals(contact.Id, asMap(fromWork.get('contact')).get('id'));
        System.assertEquals(12, ((List<Object>) asMap(fromCase.get('activity')).get('months')).size());
        System.assert(fromCase.get('colleagues') instanceof List<Object>);
        System.assertEquals('Stable', insight.get('relationship'), 'Unknown relationship values fall back to Stable');
        try {
            call('GET', 'customer/' + orphan.Id, null);
            System.assert(false, 'Cases without a contact have no Customer 360');
        } catch (SLK_CustomerService.CustomerException e) {
            System.assert(e.getMessage().contains('No customer contact'));
        }
    }

    @IsTest
    static void layoutsSaveResetAndRequireAdmin() {
        Map<String, Object> config = new Map<String, Object>{
            'version' => 1,
            'template' => 'three',
            'regions' => new Map<String, Object>{ 'main' => new List<Object>{ 'feed' } }
        };
        SLK_LayoutService.adminOverride = false;
        try {
            call('POST', 'layouts/case', new Map<String, Object>{ 'config' => config });
            System.assert(false, 'Non-admins cannot save layouts');
        } catch (SLK_LayoutService.LayoutException e) {
            System.assert(e.getMessage().contains('Layout Admin'));
        }
        System.assertEquals(false, asMap(call('GET', 'layouts', null)).get('canEdit'));

        SLK_LayoutService.adminOverride = true;
        call('POST', 'layouts/case', new Map<String, Object>{ 'config' => config });
        config.put('template', 'single');
        call('POST', 'layouts/case', new Map<String, Object>{ 'config' => config });
        Map<String, Object> saved = asMap(asMap(asMap(call('GET', 'layouts', null)).get('layouts')).get('case'));
        System.assertEquals('single', asMap(saved.get('config')).get('template'), 'Saving twice upserts the same page');
        System.assertEquals(1, [SELECT COUNT() FROM SLK_Console_Layout__c]);

        try {
            call('POST', 'layouts/nowhere', new Map<String, Object>{ 'config' => config });
            System.assert(false, 'Unknown pages are rejected');
        } catch (SLK_LayoutService.LayoutException e) {
            System.assert(e.getMessage().contains('Unknown console page'));
        }
        call('POST', 'layouts/case/reset', null);
        System.assertEquals(0, [SELECT COUNT() FROM SLK_Console_Layout__c]);
    }

    @IsTest
    static void serviceAssistantBuildsGroundedPlan() {
        Contact contact = [SELECT Id, AccountId FROM Contact LIMIT 1];
        Case c = new Case(Subject = 'Portal login loop', Description = 'Loops after reset', Status = 'Working', Priority = 'High', ContactId = contact.Id, AccountId = contact.AccountId);
        insert c;
        queue(new List<String>{
            '{"intent":"Regain access","stage":"Diagnose","plan":[{"step":"Verify identity","status":"done"},{"step":"Clear sessions","status":"current"},{"step":"Confirm","status":"bogus"}],' +
            '"replies":[{"label":"Clear cache","text":"Please clear your cache."}],"articles":[{"ref":"K9","why":"n/a","shareText":"n/a"}],' +
            '"email":{"subject":"Your portal access","body":"Hi, here is how to fix it.","why":"Recap"},' +
            '"actions":[{"title":"Set waiting","rationale":"Needs customer","type":"updateStatus","confidence":80,"payload":{"status":"Waiting on Customer"}}]}'
        });
        Test.startTest();
        Map<String, Object> plan = asMap(call('POST', 'ai/case/' + c.Id + '/assist', null));
        Test.stopTest();

        System.assertEquals('Diagnose', plan.get('stage'));
        List<Object> steps = (List<Object>) plan.get('plan');
        System.assertEquals(3, steps.size());
        System.assertEquals('todo', asMap(steps[2]).get('status'), 'Unknown step states fall back to todo');
        System.assertEquals(0, ((List<Object>) plan.get('replies')).size(), 'Replies are only offered during live work');
        System.assertEquals(0, ((List<Object>) plan.get('articles')).size(), 'Unresolvable article refs are dropped');
        System.assertEquals('console.customer@example.com', asMap(plan.get('email')).get('to'));
        System.assertEquals(1, ((List<Object>) plan.get('actions')).size());
    }

    @IsTest
    static void virtualAgentsAcceptAndUnknownRoutesFail() {
        User me = [SELECT Id, Name FROM User WHERE Id = :UserInfo.getUserId()];
        insert new SLK_Agent_Presence__c(Name = me.Name, Agent__c = me.Id, Status__c = 'Online', Virtual_Agent__c = true, Capacity__c = 4, Skills__c = 'Case;Voice;Messaging');
        queue(new List<String>());
        Map<String, Object> work = asMap(call('POST', 'simulate', new Map<String, Object>{ 'channel' => 'Case' }));
        SLK_RoutingService.routeTick();
        Id workId = (Id) work.get('id');
        System.assertEquals('Accepted', [SELECT Status__c FROM SLK_Work_Item__c WHERE Id = :workId].Status__c);
        System.assertEquals(240, SLK_SimulationService.slaMinutes('Medium'));
        System.assertEquals(30, SLK_SimulationService.slaMinutes('Critical'));
        System.assertEquals(60, SLK_SimulationService.slaMinutes('High'));
        System.assertEquals(480, SLK_SimulationService.slaMinutes('Low'));

        try {
            call('GET', 'nowhere', null);
            System.assert(false, 'Expected a route exception');
        } catch (SLK_ConsoleRest.RouteException e) {
            System.assert(e.getMessage().contains('No route'));
        }
    }

    @IsTest
    static void seedsDemoFloorWithoutAi() {
        Test.startTest();
        Map<String, Object> result = SLK_ConsoleSeed.run(true);
        Test.stopTest();
        System.assertEquals(8, ((List<Object>) result.get('inboundQueued')).size());
        System.assert([SELECT COUNT() FROM SLK_Work_Item__c WHERE Status__c = 'Closed'] > 0, 'History should be seeded');
        System.assertEquals(8, [SELECT COUNT() FROM SLK_Work_Item__c WHERE Case__c != NULL AND Status__c IN ('Queued', 'Offered', 'Accepted')]);
        Map<String, Object> floor = asMap(call('GET', 'supervisor', null));
        System.assertNotEquals(null, floor.get('waiting'));
    }
}