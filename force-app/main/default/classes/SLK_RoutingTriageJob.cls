/**
 * Runs AI triage for newly created work outside the transaction that created the case,
 * so case saves stay fast and the Models API callout never follows uncommitted DML.
 */
public with sharing class SLK_RoutingTriageJob implements Queueable, Database.AllowsCallouts {
    private static final Integer BATCH_SIZE = 5;
    private final List<Id> workIds;

    public SLK_RoutingTriageJob(List<Id> workIds) {
        this.workIds = workIds;
    }

    public void execute(QueueableContext context) {
        List<Id> now = new List<Id>();
        List<Id> later = new List<Id>();
        for (Id workId : workIds) {
            (now.size() < BATCH_SIZE ? now : later).add(workId);
        }
        SLK_RoutingAIService.triage(now);
        if (!later.isEmpty() && !Test.isRunningTest()) {
            System.enqueueJob(new SLK_RoutingTriageJob(later));
        }
    }
}