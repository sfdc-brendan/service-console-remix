/**
 * Seeds the Service Console demo floor: virtual agents with presence, today's handled work so
 * dashboards have history, and a fresh set of inbound Voice, Messaging, and Case work.
 * Uses canned scenarios so it can run from anonymous Apex without Models API callouts. Each inbound
 * item is injected in its own Queueable so org automation on Case stays inside per-transaction limits.
 */
public with sharing class SLK_ConsoleSeed implements Queueable {
    private static final Integer MAX_VIRTUAL_AGENTS = 6;
    private static final Integer HISTORY_THRESHOLD = 5;

    private static final List<List<Object>> AGENT_PROFILES = new List<List<Object>>{
        new List<Object>{ 'Online', 4, 'Case;Voice;Messaging;Billing:8;Customer Service:7;French:6' },
        new List<Object>{ 'Busy', 5, 'Messaging;Case;Billing:9;Customer Service:6' },
        new List<Object>{ 'Online', 3, 'Voice;Case;Hardware:8;Technical Support:6' },
        new List<Object>{ 'Break', 4, 'Case;Voice;Messaging;Networking:9;Technical Support:8' },
        new List<Object>{ 'Busy', 4, 'Messaging;Case;Account Management:8;Onboarding:7' },
        new List<Object>{ 'Offline', 4, 'Case;Voice;Security & Compliance:9;Escalation Handling:7' }
    };

    private static final List<Map<String, Object>> SCENARIOS = new List<Map<String, Object>>{
        scenario(
            'Voice',
            'GPU nodes dropping out of the training cluster',
            'Four nodes in the customer\'s training cluster lose GPU visibility every few hours, killing multi-day jobs.',
            'Senior ML engineer, technical, under deadline pressure.',
            'A root cause and a workaround to keep jobs alive tonight.',
            'Hi, our training cluster keeps losing GPUs mid-run and we have lost two days of compute. I need someone technical, fast.',
            'Critical',
            'Technical Support',
            'Negative'
        ),
        scenario(
            'Messaging',
            'Charged twice for annual subscription renewal',
            'Customer sees two identical renewal charges on their corporate card this morning.',
            'Finance manager, polite but firm, wants it fixed today.',
            'Confirmation that the duplicate charge will be refunded.',
            'Hello — we were billed twice for our annual renewal this morning. Can you reverse one of these charges?',
            'High',
            'Billing',
            'Negative'
        ),
        scenario(
            'Messaging',
            'How do I add seats for new team members?',
            'Customer is onboarding three new engineers and wants to add licensed seats.',
            'Friendly team lead, upbeat, not technical about billing.',
            'Steps to add seats and the prorated cost.',
            'Hey there! We just hired three engineers. How do I add seats to our plan?',
            'Low',
            'Tier 1 Support',
            'Positive'
        ),
        scenario(
            'Voice',
            'Driver update broke inference container startup',
            'After upgrading the host driver, the inference container fails to start with a CUDA version mismatch.',
            'DevOps lead, calm but blocked on a production rollout.',
            'The compatible driver and container versions, or a rollback plan.',
            'We upgraded our drivers last night and now none of our inference containers will start. Production rollout is blocked.',
            'High',
            'Technical Support',
            'Neutral'
        ),
        scenario(
            'Case',
            'Request for SOC 2 report and security questionnaire',
            'Procurement needs the latest SOC 2 Type II report and a completed security questionnaire before renewal.',
            'Procurement analyst, process-driven.',
            'The report and questionnaire within the week.',
            '',
            'Medium',
            'Premier Support',
            'Neutral'
        ),
        scenario(
            'Messaging',
            'Portal login loops after password reset',
            'Customer reset their password and the portal keeps redirecting them back to the sign-in page.',
            'Busy admin, mildly frustrated.',
            'Working access to the portal today.',
            'I reset my password and now the portal just keeps sending me back to the login page. Help?',
            'Medium',
            'Tier 1 Support',
            'Neutral'
        ),
        scenario(
            'Voice',
            'Threatening to cancel after repeated outages',
            'Third outage this month affected the customer\'s API workloads; they are evaluating competitors.',
            'VP of Engineering, angry, decisive, values accountability.',
            'An explanation, a credit, and a plan that prevents a repeat.',
            'This is the third outage this month. I am honestly about ready to move our workloads elsewhere. Who can fix this?',
            'Critical',
            'Premier Support',
            'Negative'
        ),
        scenario(
            'Case',
            'Invoice missing PO number',
            'Accounts payable rejected last month\'s invoice because the purchase order number is missing.',
            'AP specialist, brief and transactional.',
            'A reissued invoice with the PO number.',
            '',
            'Low',
            'Billing',
            'Neutral'
        )
    };

    private final Integer scenarioIndex;

    private SLK_ConsoleSeed(Integer scenarioIndex) {
        this.scenarioIndex = scenarioIndex;
    }

    public static Map<String, Object> run(Boolean reset) {
        Integer cleared = reset == true ? clearOpenWork() : 0;
        List<SLK_Agent_Presence__c> agents = seedAgents(UserInfo.getUserId());
        Integer history = seedHistory(agents, UserInfo.getUserId());
        List<Object> inbound = new List<Object>();
        for (Integer i = 0; i < SCENARIOS.size(); i++) {
            System.enqueueJob(new SLK_ConsoleSeed(i));
            inbound.add(SCENARIOS[i].get('channel') + ' · ' + SCENARIOS[i].get('subject'));
        }
        return new Map<String, Object>{
            'clearedOpenWork' => cleared,
            'virtualAgents' => agents.size(),
            'historyItems' => history,
            'inboundQueued' => inbound
        };
    }

    public void execute(QueueableContext context) {
        Map<String, Object> item = SCENARIOS[scenarioIndex];
        SLK_SimulationService.injectScenario((String) item.get('channel'), item);
    }

    private static Map<String, Object> scenario(
        String channel,
        String subject,
        String description,
        String persona,
        String goal,
        String openingMessage,
        String priority,
        String queue,
        String sentiment
    ) {
        return new Map<String, Object>{
            'channel' => channel,
            'subject' => subject,
            'description' => description,
            'persona' => persona,
            'goal' => goal,
            'openingMessage' => openingMessage,
            'priority' => priority,
            'queue' => queue,
            'sentiment' => sentiment
        };
    }

    private static Integer clearOpenWork() {
        List<SLK_Work_Item__c> open = [
            SELECT Id
            FROM SLK_Work_Item__c
            WHERE Status__c IN ('Queued', 'Offered', 'Accepted')
            LIMIT 500
        ];
        delete open;
        return open.size();
    }

    private static List<SLK_Agent_Presence__c> seedAgents(Id currentUserId) {
        List<User> users = [
            SELECT Id, Name
            FROM User
            WHERE
                IsActive = TRUE
                AND UserType = 'Standard'
                AND Id != :currentUserId
                AND Profile.UserLicense.Name = 'Salesforce'
                AND (NOT Name LIKE '%Integration%')
                AND (NOT Name LIKE '%Automated%')
                AND (NOT Name LIKE '%Security%')
                AND (NOT Name LIKE '%Platform%')
            ORDER BY Name
            LIMIT :MAX_VIRTUAL_AGENTS
        ];
        Map<Id, SLK_Agent_Presence__c> existing = new Map<Id, SLK_Agent_Presence__c>();
        for (SLK_Agent_Presence__c presence : [SELECT Id, Agent__c FROM SLK_Agent_Presence__c WHERE Agent__c IN :users]) {
            existing.put(presence.Agent__c, presence);
        }
        Datetime now = Datetime.now();
        List<SLK_Agent_Presence__c> rows = new List<SLK_Agent_Presence__c>();
        for (Integer i = 0; i < users.size(); i++) {
            List<Object> profile = AGENT_PROFILES[Math.mod(i, AGENT_PROFILES.size())];
            SLK_Agent_Presence__c presence = existing.containsKey(users[i].Id)
                ? existing.get(users[i].Id)
                : new SLK_Agent_Presence__c(Agent__c = users[i].Id);
            presence.Name = users[i].Name.left(80);
            presence.Virtual_Agent__c = true;
            presence.Status__c = (String) profile[0];
            presence.Capacity__c = (Integer) profile[1];
            presence.Skills__c = (String) profile[2];
            presence.Status_Changed_At__c = now.addMinutes(-(i * 7 + 3));
            rows.add(presence);
        }
        upsert rows;

        List<SLK_Work_Item__c> busyWork = new List<SLK_Work_Item__c>();
        for (Integer i = 0; i < rows.size(); i++) {
            if (rows[i].Status__c != 'Busy') {
                continue;
            }
            Map<String, Object> source = SCENARIOS[Math.mod(i, SCENARIOS.size())];
            busyWork.add(
                new SLK_Work_Item__c(
                    Channel__c = 'Messaging',
                    Status__c = 'Accepted',
                    Agent__c = rows[i].Agent__c,
                    Subject__c = (String) source.get('subject'),
                    Customer_Name__c = 'Walk-in customer',
                    Queue__c = (String) source.get('queue'),
                    Priority__c = 'Medium',
                    Sentiment__c = 'Neutral',
                    Offered_At__c = now.addMinutes(-3),
                    Accepted_At__c = now.addMinutes(-2),
                    SLA_Due__c = now.addHours(4)
                )
            );
        }
        insert busyWork;
        return rows;
    }

    private static Integer seedHistory(List<SLK_Agent_Presence__c> agents, Id currentUserId) {
        Datetime startOfDay = Datetime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        Integer closedToday = [SELECT COUNT() FROM SLK_Work_Item__c WHERE Status__c = 'Closed' AND Closed_At__c >= :startOfDay];
        if (closedToday >= HISTORY_THRESHOLD) {
            return 0;
        }
        List<Id> handlers = new List<Id>{ currentUserId, currentUserId, currentUserId };
        for (SLK_Agent_Presence__c agent : agents) {
            handlers.add(agent.Agent__c);
            handlers.add(agent.Agent__c);
        }
        List<String> channels = new List<String>{ 'Voice', 'Messaging', 'Messaging', 'Case' };
        List<String> sentiments = new List<String>{ 'Positive', 'Positive', 'Neutral', 'Negative' };
        Datetime now = Datetime.now();
        Long dayMinutes = Math.max(30, (now.getTime() - startOfDay.getTime()) / 60000);
        List<SLK_Work_Item__c> rows = new List<SLK_Work_Item__c>();
        for (Integer i = 0; i < handlers.size(); i++) {
            Map<String, Object> source = SCENARIOS[Math.mod(i, SCENARIOS.size())];
            Integer handleMinutes = 4 + Math.mod(i * 5, 11);
            Integer minutesAgo = (Integer) Math.min(dayMinutes - handleMinutes - 1, 15 + i * 17);
            Datetime closedAt = now.addMinutes(-Math.max(1, minutesAgo));
            rows.add(
                new SLK_Work_Item__c(
                    Channel__c = channels[Math.mod(i, channels.size())],
                    Status__c = 'Closed',
                    Agent__c = handlers[i],
                    Subject__c = (String) source.get('subject'),
                    Customer_Name__c = 'Returning customer',
                    Queue__c = (String) source.get('queue'),
                    Priority__c = (String) source.get('priority'),
                    Sentiment__c = sentiments[Math.mod(i, sentiments.size())],
                    Offered_At__c = closedAt.addMinutes(-handleMinutes - 1),
                    Accepted_At__c = closedAt.addMinutes(-handleMinutes),
                    Closed_At__c = closedAt,
                    Summary__c = 'Resolved during the demo shift.'
                )
            );
        }
        insert rows;
        return rows.size();
    }
}