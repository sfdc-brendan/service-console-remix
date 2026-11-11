// Makes the running user the target for every new case, regardless of skills (they still need to be Online).
SLK_Agent_Presence__c presence = SLK_RoutingService.ensurePresence(UserInfo.getUserId());
presence.Receives_All_Cases__c = true;
update presence;
System.debug(LoggingLevel.ERROR, 'SLK_INSTALL::All new cases now route to ' + UserInfo.getName());
