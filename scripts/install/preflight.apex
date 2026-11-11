// Read-only check that the target org has everything the Service Console Remix compiles and tests against.
// Prints one line per check: SLK_PREFLIGHT::PASS|FAIL|WARN::check::detail (debug logs escape pipes, so :: is the delimiter).
Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();

void report(String outcome, String check, String detail) {
    System.debug(LoggingLevel.ERROR, 'SLK_PREFLIGHT::' + outcome + '::' + check + '::' + detail);
}

void requireFields(Map<String, Schema.SObjectType> describe, String objectName, List<String> fieldNames, String feature, Boolean hard) {
    Schema.SObjectType objectType = describe.get(objectName.toLowerCase());
    if (objectType == null) {
        report(hard ? 'FAIL' : 'WARN', objectName, objectName + ' is missing. Needs ' + feature + '.');
        return;
    }
    Map<String, Schema.SObjectField> fields = objectType.getDescribe().fields.getMap();
    List<String> missing = new List<String>();
    for (String fieldName : fieldNames) {
        if (!fields.containsKey(fieldName.toLowerCase())) {
            missing.add(fieldName);
        }
    }
    if (missing.isEmpty()) {
        report('PASS', objectName, feature);
    } else {
        report(hard ? 'FAIL' : 'WARN', objectName, 'Missing fields for ' + feature + ': ' + String.join(missing, ', '));
    }
}

requireFields(
    globalDescribe,
    'Knowledge__kav',
    new List<String>{
        'RecordTypeId', 'ArticleTotalViewCount', 'FAQ_Question__c', 'FAQ_Answer__c', 'FAQ_Internal_Comments__c',
        'KCSArticle_Issue__c', 'KCSArticle_Environment__c', 'KCSArticle_Cause__c', 'KCSArticle_Resolution__c',
        'Article_Confidence__c', 'Requires_Revision__c'
    },
    'Lightning Knowledge (with the SDO FAQ and KCS article record types)',
    true
);
requireFields(
    globalDescribe,
    'VoiceCall',
    new List<String>{ 'CallStartDateTime', 'CallEndDateTime', 'FromPhoneNumber', 'ToPhoneNumber', 'CallType', 'RelatedRecordId' },
    'Service Cloud Voice',
    true
);
requireFields(
    globalDescribe,
    'MessagingSession',
    new List<String>{ 'MessagingChannelId', 'MessagingEndUserId', 'Status', 'Origin', 'AgentType', 'StartTime', 'CaseId' },
    'Messaging for In-App and Web',
    true
);
requireFields(globalDescribe, 'AgentWork', new List<String>{ 'ServiceChannelId' }, 'Omni-Channel', true);
requireFields(
    globalDescribe,
    'VoiceCall',
    new List<String>{ 'Call_Sentiment__c', 'Sentiment_Rating__c', 'Call_Reason__c', 'Contact__c' },
    'the SDO voice sentiment fields (optional; sentiment write-back is skipped without them)',
    false
);

if (Type.forName('aiplatform', 'ModelsAPI') == null) {
    report('FAIL', 'Einstein Models API', 'aiplatform.ModelsAPI is unavailable. Turn on Einstein generative AI in Setup > Einstein Setup.');
} else {
    report('PASS', 'Einstein Models API', 'aiplatform.ModelsAPI is available');
}

User me = [SELECT UserPermissionsKnowledgeUser, Profile.Name FROM User WHERE Id = :UserInfo.getUserId()];
if (me.UserPermissionsKnowledgeUser) {
    report('PASS', 'Knowledge user', UserInfo.getUserName() + ' is a Knowledge user');
} else {
    report('FAIL', 'Knowledge user', UserInfo.getUserName() + ' must have Knowledge User checked on their user record (the Apex tests create articles).');
}
if (me.Profile.Name != 'System Administrator') {
    report('WARN', 'Profile', 'Deploying as ' + me.Profile.Name + '. A System Administrator is recommended.');
}

Integer agents = [
    SELECT COUNT()
    FROM User
    WHERE IsActive = TRUE AND UserType = 'Standard' AND Profile.UserLicense.Name = 'Salesforce' AND Id != :UserInfo.getUserId()
];
if (agents == 0) {
    report('WARN', 'Virtual agents', 'No other active Salesforce users. The demo floor will have no virtual agents.');
} else {
    report('PASS', 'Virtual agents', Math.min(agents, 6) + ' active users available as virtual agents');
}
