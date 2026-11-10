/**
 * Apex REST facade for the Service Console React UI bundle.
 * Base path: /services/apexrest/slkconsole/...
 */
@RestResource(urlMapping='/slkconsole/*')
global with sharing class SLK_ConsoleRest {
    @HttpGet
    global static void doGet() {
        dispatch('GET');
    }

    @HttpPost
    global static void doPost() {
        dispatch('POST');
    }

    private static void dispatch(String method) {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');
        try {
            Object result = route(method, segments(req.requestURI), body(req));
            res.statusCode = 200;
            res.responseBody = Blob.valueOf(JSON.serialize(result));
        } catch (RouteException e) {
            res.statusCode = 404;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => e.getMessage() }));
        } catch (Exception e) {
            res.statusCode = 400;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => e.getMessage() }));
        }
    }

    @TestVisible
    private static Object route(String method, List<String> path, Map<String, Object> body) {
        Id userId = UserInfo.getUserId();
        String resource = segment(path, 0);
        String second = segment(path, 1);
        String third = segment(path, 2);
        String fourth = segment(path, 3);

        if (method == 'GET') {
            switch on resource {
                when 'me' {
                    return new Map<String, Object>{
                        'userId' => userId,
                        'name' => UserInfo.getName(),
                        'email' => UserInfo.getUserEmail(),
                        'presence' => SLK_RoutingService.presenceDto(SLK_RoutingService.ensurePresence(userId), 0, new List<SLK_Work_Item__c>())
                    };
                }
                when 'home' {
                    switch on second {
                        when 'sla' {
                            return SLK_InsightsService.slaWatch(userId);
                        }
                        when 'scorecard' {
                            return SLK_InsightsService.scorecard(userId);
                        }
                        when 'tasks' {
                            return SLK_InsightsService.tasks(userId);
                        }
                        when null {
                            return SLK_RoutingService.home(userId);
                        }
                    }
                }
                when 'layouts' {
                    return SLK_LayoutService.layouts();
                }
                when 'customer' {
                    if (second != null) {
                        return SLK_CustomerService.profile((Id) second);
                    }
                }
                when 'account' {
                    if (second != null) {
                        return SLK_AccountService.profile((Id) second);
                    }
                }
                when 'supervisor' {
                    return SLK_RoutingService.supervisor();
                }
                when 'work' {
                    if (second != null && third == 'routing') {
                        return SLK_RoutingAIService.routing((Id) second);
                    }
                    if (second != null) {
                        return SLK_SimulationService.conversation((Id) second);
                    }
                }
                when 'routing' {
                    if (second == 'feed') {
                        return SLK_RoutingAIService.feed();
                    }
                    if (second == 'skills') {
                        return SLK_RoutingSkills.catalog();
                    }
                }
                when 'case' {
                    if (second != null && third == 'emails') {
                        return SLK_RoutingService.caseEmails((Id) second);
                    }
                    if (second != null && third == 'sla') {
                        return SLK_InsightsService.caseSla((Id) second);
                    }
                    if (second != null && third == 'similar') {
                        return SLK_InsightsService.similar((Id) second);
                    }
                    if (second != null && third == 'routing') {
                        return SLK_RoutingAIService.caseRouting((Id) second);
                    }
                }
            }
        } else if (method == 'POST') {
            switch on resource {
                when 'omni' {
                    if (second == 'sync') {
                        return SLK_RoutingService.sync(userId);
                    }
                }
                when 'presence' {
                    return SLK_RoutingService.setStatus(userId, SLK_AIService.getStr(body, 'status'));
                }
                when 'layouts' {
                    if (second != null && third == 'reset') {
                        return SLK_LayoutService.reset(second);
                    }
                    if (second != null) {
                        return SLK_LayoutService.save(second, body.get('config'));
                    }
                }
                when 'tasks' {
                    if (second != null && third == 'complete') {
                        return SLK_InsightsService.completeTask((Id) second);
                    }
                }
                when 'simulate' {
                    String caseId = SLK_AIService.getStr(body, 'caseId');
                    return SLK_SimulationService.inject(
                        SLK_AIService.getStr(body, 'channel'),
                        String.isBlank(caseId) ? null : (Id) caseId,
                        SLK_AIService.getStr(body, 'brief'),
                        SLK_AIService.getStr(body, 'priority')
                    );
                }
                when 'work' {
                    Object result = routeWork(second == null ? null : (Id) second, third, body, userId);
                    if (result != null) {
                        return result;
                    }
                }
                when 'case' {
                    if (second != null && third == 'action') {
                        Object payload = body.get('payload');
                        return SLK_ServiceAIService.executeAction(
                            (Id) second,
                            SLK_AIService.getStr(body, 'type'),
                            payload instanceof Map<String, Object> ? (Map<String, Object>) payload : new Map<String, Object>()
                        );
                    }
                }
                when 'supervisor' {
                    if (second == 'insights') {
                        return SLK_ServiceAIService.supervisorInsights();
                    }
                    if (second == 'agents' && third != null) {
                        if (fourth == 'status') {
                            return SLK_RoutingService.setStatus((Id) third, SLK_AIService.getStr(body, 'status'));
                        }
                        if (fourth == 'whisper') {
                            return SLK_RoutingService.whisper((Id) third, SLK_AIService.getStr(body, 'text'));
                        }
                    }
                }
                when 'ai' {
                    Object result = routeAI(second, third, fourth, body, userId);
                    if (result != null) {
                        return result;
                    }
                }
            }
        }
        throw new RouteException('No route for ' + method + ' /' + String.join(path, '/'));
    }

    private static Object routeWork(Id workId, String action, Map<String, Object> body, Id userId) {
        if (workId == null) {
            return null;
        }
        switch on action {
            when 'accept' {
                return SLK_RoutingService.accept(workId, userId);
            }
            when 'decline' {
                return SLK_RoutingService.decline(workId, userId);
            }
            when 'hold' {
                return SLK_RoutingService.setHold(workId, body.get('onHold') == true);
            }
            when 'transfer' {
                return SLK_RoutingService.transfer(workId, userId, SLK_AIService.getStr(body, 'queue'), SLK_AIService.getStr(body, 'skill'));
            }
            when 'reassign' {
                return SLK_RoutingService.reassign(workId, (Id) SLK_AIService.getStr(body, 'userId'));
            }
            when 'close' {
                return SLK_RoutingService.close(
                    workId,
                    SLK_AIService.getStr(body, 'summary'),
                    SLK_AIService.getStr(body, 'caseStatus'),
                    SLK_AIService.getStr(body, 'sentiment')
                );
            }
            when 'send' {
                return SLK_SimulationService.agentSend(workId, SLK_AIService.getStr(body, 'body'));
            }
            when 'tick' {
                return SLK_SimulationService.tick(workId);
            }
            when 'skills' {
                return SLK_RoutingAIService.retag(workId, SLK_AIService.getList(body, 'skills'), SLK_AIService.getStr(body, 'required'), userId);
            }
            when else {
                return null;
            }
        }
    }

    private static Object routeAI(String scope, String recordId, String action, Map<String, Object> body, Id userId) {
        if (scope == 'rewrite') {
            return SLK_ServiceAIService.rewrite(SLK_AIService.getStr(body, 'text'), SLK_AIService.getStr(body, 'tone'));
        }
        if (scope == 'focus') {
            return SLK_ServiceAIService.focus(userId);
        }
        if (scope == 'trends') {
            return SLK_InsightsService.trends();
        }
        if (recordId == null) {
            return null;
        }
        if (scope == 'customer' && action == 'insight') {
            return SLK_CustomerService.insight((Id) recordId);
        }
        if (scope == 'account' && action == 'insight') {
            return SLK_AccountService.insight((Id) recordId);
        }
        if (scope == 'case') {
            switch on action {
                when 'summary' {
                    return SLK_ServiceAIService.summarize((Id) recordId);
                }
                when 'actions' {
                    return SLK_ServiceAIService.nextBestActions((Id) recordId);
                }
                when 'knowledge' {
                    return SLK_ServiceAIService.knowledge((Id) recordId);
                }
                when 'note' {
                    return SLK_ServiceAIService.draftNote((Id) recordId, SLK_AIService.getStr(body, 'style'), SLK_AIService.getStr(body, 'notes'));
                }
                when 'assist' {
                    String workId = SLK_AIService.getStr(body, 'workId');
                    return SLK_ServiceAIService.assist((Id) recordId, String.isBlank(workId) ? null : (Id) workId);
                }
            }
        } else if (scope == 'work') {
            switch on action {
                when 'replies' {
                    return SLK_ServiceAIService.replySuggestions((Id) recordId);
                }
                when 'coach' {
                    return SLK_ServiceAIService.coach((Id) recordId);
                }
                when 'wrapup' {
                    return SLK_ServiceAIService.wrapUp((Id) recordId);
                }
                when 'analysis' {
                    return SLK_CallAnalysisService.analyze((Id) recordId, body.get('refresh') == true);
                }
                when 'triage' {
                    return SLK_RoutingAIService.retriage((Id) recordId);
                }
            }
        }
        return null;
    }

    private static String segment(List<String> path, Integer index) {
        return path.size() > index ? path[index] : null;
    }

    @TestVisible
    private static List<String> segments(String uri) {
        String trimmed = uri == null ? '' : uri.substringAfter('/slkconsole/');
        List<String> parts = new List<String>();
        for (String part : trimmed.split('/')) {
            if (String.isNotBlank(part)) {
                parts.add(EncodingUtil.urlDecode(part, 'UTF-8'));
            }
        }
        return parts;
    }

    private static Map<String, Object> body(RestRequest req) {
        if (req.requestBody == null || req.requestBody.size() == 0) {
            return new Map<String, Object>();
        }
        Object parsed = JSON.deserializeUntyped(req.requestBody.toString());
        return parsed instanceof Map<String, Object> ? (Map<String, Object>) parsed : new Map<String, Object>();
    }

    public class RouteException extends Exception {
    }
}