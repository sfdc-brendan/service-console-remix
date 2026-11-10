@IsTest
private class SLK_RoutingTest {
    @TestSetup
    static void setup() {
        Account account = new Account(Name = 'SLK Routing Account');
        account.put('analyticsdemo_batch_id__c', 'SLK_TEST');
        insert account;
        insert new Contact(LastName = 'Router', FirstName = 'Rhea', Email = 'rhea.router@example.com', AccountId = account.Id);
    }

    private static Object call(String method, String path, Map<String, Object> body) {
        return SLK_ConsoleRest.route(method, SLK_ConsoleRest.segments('/slkconsole/' + path), body == null ? new Map<String, Object>() : body);
    }

    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    private static User billingSpecialist() {
        User me = [SELECT ProfileId, TimeZoneSidKey, LocaleSidKey, EmailEncodingKey, LanguageLocaleKey FROM User WHERE Id = :UserInfo.getUserId()];
        String unique = String.valueOf(Crypto.getRandomInteger()).remove('-');
        User specialist = new User(
            LastName = 'Specialist',
            FirstName = 'Bea',
            Alias = 'bspec',
            Email = 'bea.specialist@example.com',
            Username = 'bea.specialist.' + unique + '@example.com.slk',
            ProfileId = me.ProfileId,
            TimeZoneSidKey = me.TimeZoneSidKey,
            LocaleSidKey = me.LocaleSidKey,
            EmailEncodingKey = me.EmailEncodingKey,
            LanguageLocaleKey = me.LanguageLocaleKey
        );
        insert specialist;
        return specialist;
    }

    private static void staff(Id userId, String skills) {
        insert new SLK_Agent_Presence__c(
            Name = 'Agent',
            Agent__c = userId,
            Status__c = 'Online',
            Capacity__c = 4,
            Skills__c = skills,
            Status_Changed_At__c = Datetime.now().addMinutes(-5)
        );
    }

    private static Set<String> eventTypes(SLK_Work_Item__c item) {
        Set<String> types = new Set<String>();
        for (Object raw : SLK_RoutingLog.read(item.Routing_Log__c)) {
            types.add((String) asMap(raw).get('type'));
        }
        return types;
    }

    @IsTest
    static void newCaseIsTriagedByAiAndOfferedToTheBestSkillMatch() {
        User specialist = billingSpecialist();
        staff(UserInfo.getUserId(), 'Case;Technical Support:4');
        staff(specialist.Id, 'Case;Billing:9;Customer Service:6');
        Contact contact = [SELECT Id, AccountId FROM Contact LIMIT 1];
        SLK_CaseIntake.enabled = true;
        SLK_RoutingAIService.aiTriage = true;
        SLK_AIService.mockResponses = new List<String>{
            '{"intent":"Refund a duplicate charge","summary":"Customer was billed twice.","sentiment":"Negative","confidence":91,' +
            '"signals":["charged twice"],"queue":"Billing","skills":[{"name":"billing","level":"required","confidence":95,"reason":"Duplicate charge"},' +
            '{"name":"Customer Service","level":"required","confidence":60,"reason":"Upset customer"},{"name":"Quantum Physics","level":"preferred","confidence":99,"reason":"x"}]}'
        };

        Test.startTest();
        Case c = new Case(Subject = 'Charged twice this month', Status = 'New', Priority = 'High', Origin = 'Web', ContactId = contact.Id, AccountId = contact.AccountId);
        insert c;
        Test.stopTest();

        SLK_Work_Item__c work = SLK_RoutingService.queryRouting('WHERE Case__c = :caseId', new Map<String, Object>{ 'caseId' => c.Id })[0];
        System.assertEquals('Offered', work.Status__c, 'Triage hands the case straight to routing');
        System.assertEquals(specialist.Id, work.Agent__c, 'The billing specialist outranks a generalist');
        System.assertEquals('Billing', work.Required_Skill__c, 'Catalog spelling wins over the model spelling');
        System.assertEquals('Billing;Customer Service', work.Skills__c, 'Unknown skills are dropped and only one stays required');
        System.assertEquals('Negative', work.Sentiment__c);
        System.assert(eventTypes(work).containsAll(new Set<String>{ 'received', 'analyzed', 'tagged', 'offered' }), work.Routing_Log__c);

        Map<String, Object> offer = SLK_RoutingLog.lastOfType(work, 'offered');
        List<Object> candidates = (List<Object>) offer.get('candidates');
        System.assertEquals(2, candidates.size());
        System.assert((Integer) asMap(candidates[0]).get('score') > (Integer) asMap(candidates[1]).get('score'));
        System.assertEquals('Missing Billing', asMap(candidates[1]).get('reason'));

        Map<String, Object> trace = asMap(call('GET', 'case/' + c.Id + '/routing', null));
        System.assertEquals('ai', asMap(trace.get('analysis')).get('model'));
        System.assertEquals(1, asMap(asMap(trace.get('coverage')).get('Billing')).get('agents'));
    }

    @IsTest
    static void unstaffedSkillIsRelaxedAndPeopleCanRetag() {
        staff(UserInfo.getUserId(), 'Case;Voice;Messaging;Billing:7');
        SLK_Work_Item__c work = new SLK_Work_Item__c(
            Channel__c = 'Case',
            Status__c = 'Queued',
            Subject__c = 'VPN drops every hour',
            Priority__c = 'Medium',
            Required_Skill__c = 'Networking',
            Skills__c = 'Networking'
        );
        insert work;

        Test.startTest();
        SLK_RoutingService.routeTick();
        SLK_Work_Item__c relaxed = SLK_RoutingService.loadWork(work.Id);
        System.assertEquals('Offered', relaxed.Status__c, 'Nobody on shift has Networking, so the engine widens the search');
        System.assert(eventTypes(relaxed).contains('relaxed'));

        Map<String, Object> retagged = asMap(
            call('POST', 'work/' + work.Id + '/skills', new Map<String, Object>{ 'skills' => new List<Object>{ 'billing', 'Hardware', 'Case' }, 'required' => 'Billing' })
        );
        Test.stopTest();

        SLK_Work_Item__c after = SLK_RoutingService.loadWork(work.Id);
        System.assertEquals('Billing;Hardware', after.Skills__c, 'Catalog spelling is applied and channels are ignored');
        System.assertEquals('Billing', after.Required_Skill__c);
        System.assertEquals('Offered', after.Status__c, 'Retagging re-routes the offer');
        System.assert(eventTypes(after).contains('retagged'));
        List<Object> skills = (List<Object>) asMap(retagged.get('analysis')).get('skills');
        System.assertEquals('manual', asMap(skills[1]).get('source'));
    }

    @IsTest
    static void declinesAndTimeoutsAreLoggedAndKeywordTriageCoversModelOutages() {
        staff(UserInfo.getUserId(), 'Case;Voice;Messaging');
        SLK_RoutingAIService.aiTriage = true;
        SLK_RoutingAIService.TriageInput input = new SLK_RoutingAIService.TriageInput();
        input.subject = 'Refund for a duplicate invoice';
        input.description = 'We were charged twice and need a refund.';
        input.channel = 'Case';
        Map<String, Object> analysis = SLK_RoutingAIService.analyze(input, true);
        System.assertEquals('rules', analysis.get('model'), 'No model response falls back to keyword triage');
        System.assertNotEquals(null, analysis.get('fallbackReason'));
        System.assertEquals('Billing', asMap(((List<Object>) analysis.get('skills'))[0]).get('name'));

        SLK_Work_Item__c work = new SLK_Work_Item__c(Channel__c = 'Case', Status__c = 'Queued', Subject__c = input.subject, Priority__c = 'Low');
        SLK_RoutingAIService.apply(work, analysis);
        insert work;

        Test.startTest();
        SLK_RoutingService.routeTick();
        call('POST', 'work/' + work.Id + '/decline', null);
        Test.stopTest();

        SLK_Work_Item__c after = SLK_RoutingService.loadWork(work.Id);
        System.assertEquals('Queued', after.Status__c);
        System.assert(eventTypes(after).containsAll(new Set<String>{ 'relaxed', 'offered', 'declined', 'waiting' }), after.Routing_Log__c);

        Map<String, Object> feed = asMap(call('GET', 'routing/feed', null));
        System.assertEquals(1, ((List<Object>) feed.get('items')).size());
        System.assertEquals(1, feed.get('queued'));
        Boolean listed = false;
        for (Object raw : (List<Object>) call('GET', 'routing/skills', null)) {
            listed = listed || asMap(raw).get('name') == 'Technical Support';
        }
        System.assert(listed, 'The built-in taxonomy is always in the catalog');
    }

    @IsTest
    static void retriageKeepsManualTagsAndOffersCarryRoutingContext() {
        staff(UserInfo.getUserId(), 'Case;Security & Compliance:8;Billing:3');
        Contact contact = [SELECT Id, AccountId FROM Contact LIMIT 1];
        Case c = new Case(Subject = 'SOC 2 report request', Status = 'New', Priority = 'Medium', Origin = 'Email', ContactId = contact.Id, AccountId = contact.AccountId);
        insert c;
        SLK_Work_Item__c work = new SLK_Work_Item__c(Channel__c = 'Case', Status__c = 'Analyzing', Case__c = c.Id, Subject__c = c.Subject, Priority__c = 'Medium');
        insert work;
        call('POST', 'work/' + work.Id + '/skills', new Map<String, Object>{ 'skills' => new List<Object>{ 'Billing' }, 'required' => null });

        SLK_RoutingAIService.aiTriage = true;
        SLK_AIService.mockResponses = new List<String>{
            '{"intent":"Send compliance documents","confidence":88,"skills":[{"name":"Security & Compliance","level":"required","confidence":93,"reason":"SOC 2 request"}]}'
        };
        Test.startTest();
        Map<String, Object> trace = asMap(call('POST', 'ai/work/' + work.Id + '/triage', null));
        Test.stopTest();

        List<Object> skills = (List<Object>) asMap(trace.get('analysis')).get('skills');
        System.assertEquals(2, skills.size(), 'Manual Billing tag survives re-analysis');
        System.assertEquals('Offered', asMap(trace.get('work')).get('status'));

        Map<String, Object> omni = asMap(call('POST', 'omni/sync', null));
        Map<String, Object> routing = asMap(asMap(((List<Object>) omni.get('offers'))[0]).get('routing'));
        System.assertEquals('Send compliance documents', routing.get('intent'));
        System.assert(((List<Object>) routing.get('matched')).contains('Security & Compliance'));
    }
}