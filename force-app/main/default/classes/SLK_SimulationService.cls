/**
 * Plays the customer side of the Service Console for demos: injects inbound Case, Voice, and
 * Messaging work grounded on real contacts, and generates customer replies with the Models API.
 * AI calls always happen before DML so the Models API callout never follows uncommitted work.
 */
public with sharing class SLK_SimulationService {
    public static final Integer MAX_CUSTOMER_TURNS = 12;
    private static final String SUPPORT_LINE = '+18005550199';

    public class SimulationException extends Exception {
    }

    // ---------------------------------------------------------------- inbound work

    public static Map<String, Object> inject(String channel, Id caseId, String brief, String priority) {
        if (!SLK_RoutingService.CHANNELS.contains(channel)) {
            throw new SimulationException('Unknown channel: ' + channel);
        }
        Case existing = caseId == null ? null : loadCase(caseId);
        Contact customer = existing?.Contact != null ? existing.Contact : pickContact();
        Map<String, Object> scenario = buildScenario(channel, customer, existing, brief);
        return injectScenario(channel, existing, customer, scenario, priority, true);
    }

    /** Inserts inbound work from a ready-made scenario without calling the Models API. */
    public static Map<String, Object> injectScenario(String channel, Map<String, Object> scenario) {
        if (!SLK_RoutingService.CHANNELS.contains(channel)) {
            throw new SimulationException('Unknown channel: ' + channel);
        }
        return injectScenario(channel, null, pickContact(), scenario, null, false);
    }

    private static Map<String, Object> injectScenario(
        String channel,
        Case existing,
        Contact customer,
        Map<String, Object> scenario,
        String priority,
        Boolean useAi
    ) {
        String resolvedPriority = SLK_AIService.pick(
            priority != null ? priority : SLK_AIService.getStr(scenario, 'priority'),
            SLK_RoutingService.PRIORITIES,
            'Medium'
        );

        SLK_RoutingAIService.TriageInput triage = new SLK_RoutingAIService.TriageInput();
        triage.channel = channel;
        triage.priority = resolvedPriority;
        triage.subject = existing != null ? existing.Subject : SLK_AIService.getStr(scenario, 'subject');
        String description = existing != null ? existing.Description : SLK_AIService.getStr(scenario, 'description');
        triage.description =
            (description == null ? '' : description) +
            (String.isBlank(SLK_AIService.getStr(scenario, 'openingMessage')) ? '' : '\nCustomer said: ' + SLK_AIService.getStr(scenario, 'openingMessage'));
        triage.contactName = customer?.Name;
        triage.accountName = existing?.Contact?.Account?.Name;
        Map<String, Object> analysis = SLK_RoutingAIService.analyze(triage, useAi);

        Case target = existing;
        if (target == null) {
            target = new Case(
                Subject = SLK_AIService.truncate(SLK_AIService.getStr(scenario, 'subject'), 250),
                Description = SLK_AIService.truncate(SLK_AIService.getStr(scenario, 'description'), 30000),
                Origin = channel == 'Voice' ? 'Phone' : channel == 'Messaging' ? 'Chat' : 'Email',
                Priority = resolvedPriority,
                Status = 'New',
                ContactId = customer?.Id,
                AccountId = customer?.AccountId
            );
            SLK_CaseIntake.suppress = true;
            try {
                insert target;
            } finally {
                SLK_CaseIntake.suppress = false;
            }
            target = loadCase(target.Id);
        }

        Id sourceId = target.Id;
        if (channel == 'Voice') {
            sourceId = createVoiceCall(target, customer);
        } else if (channel == 'Messaging') {
            sourceId = createMessagingSession(target);
        }

        SLK_Work_Item__c work = new SLK_Work_Item__c(
            Channel__c = channel,
            Status__c = 'Queued',
            Case__c = target.Id,
            Source_Record_Id__c = sourceId,
            Subject__c = SLK_AIService.truncate(target.Subject, 250),
            Customer_Name__c = customer == null ? 'Guest customer' : customer.Name,
            Queue__c = SLK_AIService.truncate(
                String.isBlank(SLK_AIService.getStr(scenario, 'queue')) ? 'General Support' : SLK_AIService.getStr(scenario, 'queue'),
                80
            ),
            Required_Skill__c = null,
            Priority__c = resolvedPriority,
            SLA_Due__c = Datetime.now().addMinutes(slaMinutes(resolvedPriority)),
            Sentiment__c = SLK_AIService.pick(SLK_AIService.getStr(scenario, 'sentiment'), new Set<String>{ 'Positive', 'Neutral', 'Negative' }, 'Neutral'),
            Simulated__c = channel != 'Case',
            Scenario__c = JSON.serialize(scenario).left(4000)
        );
        SLK_RoutingLog.add(
            work,
            SLK_RoutingLog.event(
                'received',
                channel == 'Voice' ? 'Inbound call' : channel == 'Messaging' ? 'New chat started' : 'New case received',
                'From ' + work.Customer_Name__c + (existing == null ? '' : ' on case ' + existing.CaseNumber)
            )
        );
        SLK_RoutingAIService.apply(work, analysis);
        insert work;

        String opening = SLK_AIService.getStr(scenario, 'openingMessage');
        if (channel != 'Case' && String.isNotBlank(opening)) {
            SLK_RoutingService.addMessage(work.Id, 'Customer', opening, work.Sentiment__c);
        }
        SLK_RoutingService.routeTick();
        return SLK_RoutingService.workDto(SLK_RoutingService.loadWork(work.Id));
    }

    public static Integer slaMinutes(String priority) {
        switch on priority {
            when 'Critical' {
                return 30;
            }
            when 'High' {
                return 60;
            }
            when 'Low' {
                return 480;
            }
            when else {
                return 240;
            }
        }
    }

    private static Map<String, Object> buildScenario(String channel, Contact customer, Case existing, String brief) {
        String grounding = '';
        if (customer?.AccountId != null) {
            for (Case prior : [
                SELECT Subject
                FROM Case
                WHERE AccountId = :customer.AccountId AND Subject != NULL
                ORDER BY CreatedDate DESC
                LIMIT 5
            ]) {
                grounding += '- ' + prior.Subject + '\n';
            }
        }
        String prompt =
            'Channel: ' + channel +
            '\nCustomer: ' + (customer == null ? 'Guest' : customer.Name) +
            (customer?.Account?.Name == null ? '' : '\nCompany: ' + customer.Account.Name) +
            (existing == null ? '' : '\nExisting case subject: ' + existing.Subject + '\nExisting case description: ' + SLK_AIService.truncate(existing.Description, 800)) +
            (String.isBlank(grounding) ? '' : '\nRecent cases for this company:\n' + grounding) +
            (String.isBlank(brief) ? '' : '\nScenario request from the demo presenter: ' + SLK_AIService.truncate(brief, 500)) +
            '\n\nCreate one realistic inbound support contact for this customer. JSON shape: {"subject":"short case subject",' +
            '"description":"2-3 sentence problem statement","persona":"how this customer talks and feels","goal":"what would resolve it",' +
            '"openingMessage":"the first thing the customer says or types","priority":"Critical|High|Medium|Low",' +
            '"queue":"Tier 1 Support|Billing|Technical Support|Premier Support","sentiment":"Positive|Neutral|Negative"}';
        try {
            return SLK_AIService.generateJson(
                'You design believable customer service scenarios for a live contact center demo. Keep them specific and grounded in the customer context.',
                prompt
            );
        } catch (Exception e) {
            return fallbackScenario(existing);
        }
    }

    private static Map<String, Object> fallbackScenario(Case existing) {
        String subject = existing == null ? 'Unable to sign in after password reset' : existing.Subject;
        return new Map<String, Object>{
            'subject' => subject,
            'description' => existing == null ? 'Customer reset their password and is now locked out of the portal.' : existing.Description,
            'persona' => 'Busy, slightly frustrated, wants a quick fix.',
            'goal' => 'Regain access today.',
            'openingMessage' => 'Hi, I need help with: ' + subject,
            'priority' => 'Medium',
            'queue' => 'Tier 1 Support',
            'sentiment' => 'Neutral'
        };
    }

    private static Case loadCase(Id caseId) {
        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Description, Status, Priority, ContactId, AccountId,
                Contact.Id, Contact.Name, Contact.Phone, Contact.AccountId, Contact.Account.Name
            FROM Case
            WHERE Id = :caseId
        ];
        if (cases.isEmpty()) {
            throw new SimulationException('Case not found.');
        }
        return cases[0];
    }

    private static Contact pickContact() {
        List<Contact> contacts = [
            SELECT Id, Name, Phone, AccountId, Account.Name
            FROM Contact
            WHERE AccountId != NULL AND Email != NULL
            ORDER BY LastModifiedDate DESC
            LIMIT 50
        ];
        if (contacts.isEmpty()) {
            return null;
        }
        return contacts[Math.mod(Math.abs(Crypto.getRandomInteger()), contacts.size())];
    }

    private static Id createVoiceCall(Case target, Contact customer) {
        Datetime now = Datetime.now();
        VoiceCall call = new VoiceCall(
            CallStartDateTime = now,
            CallEndDateTime = now,
            FromPhoneNumber = String.isBlank(customer?.Phone) ? '+14155550123' : customer.Phone,
            ToPhoneNumber = SUPPORT_LINE,
            CallType = 'Inbound',
            RelatedRecordId = target.Id
        );
        Map<String, Schema.SObjectField> fields = Schema.SObjectType.VoiceCall.fields.getMap();
        if (fields.containsKey('case__c')) {
            call.put('Case__c', target.Id);
        }
        if (fields.containsKey('contact__c') && customer != null) {
            call.put('Contact__c', customer.Id);
        }
        if (fields.containsKey('call_reason__c')) {
            call.put('Call_Reason__c', SLK_AIService.truncate(target.Subject, 250));
        }
        Database.SaveResult result = Database.insert(call, false);
        if (result.isSuccess()) {
            return call.Id;
        }
        List<VoiceCall> recent = [SELECT Id FROM VoiceCall ORDER BY CreatedDate DESC LIMIT 1];
        return recent.isEmpty() ? target.Id : recent[0].Id;
    }

    private static Id createMessagingSession(Case target) {
        List<MessagingSession> templates = [
            SELECT MessagingChannelId, MessagingEndUserId
            FROM MessagingSession
            WHERE MessagingChannelId != NULL AND MessagingEndUserId != NULL
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
        if (templates.isEmpty()) {
            return target.Id;
        }
        MessagingSession session = new MessagingSession(
            MessagingChannelId = templates[0].MessagingChannelId,
            MessagingEndUserId = templates[0].MessagingEndUserId,
            Status = 'Active',
            Origin = 'InboundInitiated',
            AgentType = 'Agent',
            StartTime = Datetime.now(),
            CaseId = target.Id
        );
        Database.SaveResult result = Database.insert(session, false);
        if (result.isSuccess()) {
            return session.Id;
        }
        List<MessagingSession> recent = [SELECT Id FROM MessagingSession ORDER BY CreatedDate DESC LIMIT 1];
        return recent.isEmpty() ? target.Id : recent[0].Id;
    }

    // ---------------------------------------------------------------- live conversation

    public static Map<String, Object> conversation(Id workId) {
        return new Map<String, Object>{
            'work' => SLK_RoutingService.workDto(SLK_RoutingService.loadWork(workId)),
            'messages' => SLK_RoutingService.messages(workId)
        };
    }

    public static Map<String, Object> agentSend(Id workId, String body) {
        if (String.isBlank(body)) {
            throw new SimulationException('Write a message before sending.');
        }
        SLK_Work_Item__c work = SLK_RoutingService.loadWork(workId);
        if (work.Status__c != 'Accepted') {
            throw new SimulationException('Accept the work before replying.');
        }
        SLK_RoutingService.addMessage(workId, 'Agent', body, null);
        return conversation(workId);
    }

    public static Map<String, Object> tick(Id workId) {
        List<SLK_Work_Item__c> locked = [
            SELECT Id, Channel__c, Status__c, Simulated__c, On_Hold__c, Scenario__c, Subject__c, Customer_Name__c
            FROM SLK_Work_Item__c
            WHERE Id = :workId
            FOR UPDATE
        ];
        if (locked.isEmpty()) {
            throw new SimulationException('Work item not found.');
        }
        SLK_Work_Item__c work = locked[0];
        if (!work.Simulated__c || work.Status__c != 'Accepted' || work.On_Hold__c) {
            return conversation(workId);
        }
        List<SLK_Conversation_Message__c> history = [
            SELECT Sender__c, Body__c
            FROM SLK_Conversation_Message__c
            WHERE Work_Item__c = :workId AND Sender__c IN ('Customer', 'Agent')
            ORDER BY Sent_At__c ASC, Name ASC
            LIMIT 60
        ];
        if (history.isEmpty() || history[history.size() - 1].Sender__c != 'Agent' || customerTurns(history) >= MAX_CUSTOMER_TURNS) {
            return conversation(workId);
        }

        Map<String, Object> reply;
        try {
            reply = SLK_AIService.generateJson(
                'You are role-playing the CUSTOMER in a ' + (work.Channel__c == 'Voice' ? 'phone call' : 'chat') + ' with a support agent. ' +
                'Stay in character, react naturally to what the agent just said, and never act as the agent. ' +
                (work.Channel__c == 'Voice'
                    ? 'Speak in short, natural spoken sentences.'
                    : 'Type like a real person in a chat window: one or two short sentences.') +
                ' If the agent has clearly solved your problem, thank them and say goodbye.',
                'SCENARIO: ' + work.Scenario__c + '\n\nTRANSCRIPT SO FAR:\n' + transcriptText(history) +
                '\n\nJSON shape: {"reply":"what you say next","sentiment":"Positive|Neutral|Negative","resolved":true|false}'
            );
        } catch (Exception e) {
            return conversation(workId);
        }
        String text = SLK_AIService.getStr(reply, 'reply');
        if (String.isBlank(text)) {
            return conversation(workId);
        }
        String sentiment = SLK_AIService.pick(SLK_AIService.getStr(reply, 'sentiment'), new Set<String>{ 'Positive', 'Neutral', 'Negative' }, 'Neutral');
        SLK_RoutingService.addMessage(workId, 'Customer', text, sentiment);
        update new SLK_Work_Item__c(Id = workId, Sentiment__c = sentiment);
        return conversation(workId);
    }

    private static Integer customerTurns(List<SLK_Conversation_Message__c> history) {
        Integer turns = 0;
        for (SLK_Conversation_Message__c message : history) {
            if (message.Sender__c == 'Customer') {
                turns++;
            }
        }
        return turns;
    }

    public static String transcriptText(List<SLK_Conversation_Message__c> history) {
        String text = '';
        for (SLK_Conversation_Message__c message : history) {
            text += message.Sender__c.toUpperCase() + ': ' + SLK_AIService.truncate(message.Body__c, 600) + '\n';
        }
        return text;
    }
}