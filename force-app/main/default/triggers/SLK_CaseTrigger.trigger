trigger SLK_CaseTrigger on Case(after insert) {
    SLK_CaseIntake.onInsert(Trigger.new);
}