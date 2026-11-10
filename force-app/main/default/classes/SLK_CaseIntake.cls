/**
 * Puts every new open Case into the routing engine, wherever it was created (console, standard UI,
 * web-to-case, email-to-case, flows). Work starts in Analyzing; SLK_RoutingTriageJob tags skills
 * with AI and then routes it. Routing problems never block the case save.
 */
public without sharing class SLK_CaseIntake {
    public static final Integer MAX_PER_TRANSACTION = 25;
    @TestVisible
    private static Boolean enabled = !Test.isRunningTest();
    /** Set by console code that creates its own work item for the case it inserts. */
    public static Boolean suppress = false;

    public static void onInsert(List<Case> cases) {
        if (!enabled || suppress) {
            return;
        }
        List<Case> open = new List<Case>();
        Set<Id> contactIds = new Set<Id>();
        for (Case c : cases) {
            if (!c.IsClosed && c.Status != 'Closed' && open.size() < MAX_PER_TRANSACTION) {
                open.add(c);
                if (c.ContactId != null) {
                    contactIds.add(c.ContactId);
                }
            }
        }
        if (open.isEmpty()) {
            return;
        }
        try {
            route(open, contactIds);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'SLK routing intake skipped: ' + e.getMessage());
        }
    }

    private static void route(List<Case> cases, Set<Id> contactIds) {
        Map<Id, Contact> contacts = new Map<Id, Contact>([SELECT Id, Name FROM Contact WHERE Id IN :contactIds]);
        Datetime now = Datetime.now();
        List<SLK_Work_Item__c> rows = new List<SLK_Work_Item__c>();
        for (Case c : cases) {
            String priority = SLK_RoutingService.PRIORITIES.contains(c.Priority) ? c.Priority : 'Medium';
            SLK_Work_Item__c work = new SLK_Work_Item__c(
                Channel__c = 'Case',
                Status__c = 'Analyzing',
                Case__c = c.Id,
                Source_Record_Id__c = c.Id,
                Subject__c = SLK_AIService.truncate(c.Subject, 250),
                Customer_Name__c = contacts.containsKey(c.ContactId) ? contacts.get(c.ContactId).Name : c.SuppliedName,
                Queue__c = 'AI triage',
                Priority__c = priority,
                SLA_Due__c = now.addMinutes(SLK_SimulationService.slaMinutes(priority)),
                Sentiment__c = 'Neutral',
                Simulated__c = false
            );
            SLK_RoutingLog.add(
                work,
                SLK_RoutingLog.event('received', 'New case received', 'Case created via ' + (String.isBlank(c.Origin) ? 'Salesforce' : c.Origin))
            );
            rows.add(work);
        }
        Database.insert(rows, AccessLevel.SYSTEM_MODE);
        List<Id> ids = new List<Id>(new Map<Id, SLK_Work_Item__c>(rows).keySet());
        if (Limits.getQueueableJobs() < Limits.getLimitQueueableJobs()) {
            System.enqueueJob(new SLK_RoutingTriageJob(ids));
        }
    }
}