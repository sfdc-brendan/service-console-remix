/**
 * Apex REST facade for the Knowledge Command Center React UI bundle.
 * Base path: /services/apexrest/slk/...
 */
@RestResource(urlMapping='/slk/*')
global with sharing class SLK_CommandCenterRest {
    @HttpGet
    @ReadOnly
    global static void doGet() {
        dispatch('GET');
    }

    @HttpPost
    global static void doPost() {
        dispatch('POST');
    }

    @HttpPatch
    global static void doPatch() {
        dispatch('PATCH');
    }

    @HttpDelete
    global static void doDelete() {
        dispatch('DELETE');
    }

    private static void dispatch(String method) {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');
        try {
            Object result = route(method, segments(req.requestURI), req.params, body(req));
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
    private static Object route(String method, List<String> path, Map<String, String> params, Map<String, Object> body) {
        String resource = path.isEmpty() ? '' : path[0];
        String recordId = path.size() > 1 ? path[1] : null;
        String action = path.size() > 2 ? path[2] : null;

        if (method == 'GET') {
            switch on resource {
                when 'dashboard' {
                    return SLK_CoverageService.getDashboard();
                }
                when 'health' {
                    return SLK_CoverageService.getHealth();
                }
                when 'drafts' {
                    return SLK_ArticleService.listDrafts(params.get('scope'));
                }
                when 'reviews' {
                    if (recordId != null) {
                        return SLK_ReviewService.getReview(recordId);
                    }
                    return SLK_ReviewService.queue(params.get('scope'));
                }
                when 'reviewers' {
                    return SLK_ReviewService.reviewers();
                }
                when 'cases' {
                    return SLK_CoverageService.getUncoveredCases(
                        params.get('type'),
                        params.get('q'),
                        params.get('scope'),
                        toInt(params.get('limit')),
                        toInt(params.get('offset'))
                    );
                }
                when 'gaps' {
                    if (recordId == null) {
                        return SLK_GapService.listGaps(params.get('status'));
                    }
                    if (action == 'cases') {
                        return SLK_GapService.getGapCases(recordId, toInt(params.get('limit')));
                    }
                }
                when 'articles' {
                    if (recordId == null) {
                        return SLK_ArticleService.listPublished(params.get('q'));
                    }
                    return SLK_ArticleService.getArticle(recordId);
                }
            }
        } else if (method == 'POST') {
            switch on resource {
                when 'gaps' {
                    if (recordId == 'analyze') {
                        return SLK_GapService.analyze();
                    }
                    switch on action {
                        when 'draft' {
                            return SLK_ArticleService.draftFromGap(recordId);
                        }
                        when 'link' {
                            return SLK_GapService.linkGap(recordId, (Id) SLK_AIService.getStr(body, 'knowledgeArticleId'));
                        }
                        when 'dismiss' {
                            return SLK_GapService.dismiss(recordId, SLK_AIService.getStr(body, 'reason'));
                        }
                    }
                }
                when 'cases' {
                    switch on action {
                        when 'suggest' {
                            return SLK_ArticleService.suggestForCase(recordId);
                        }
                        when 'link' {
                            return SLK_ArticleService.linkCase(
                                recordId,
                                (Id) SLK_AIService.getStr(body, 'knowledgeArticleId'),
                                body.get('includeSimilar') == true
                            );
                        }
                        when 'draft' {
                            return SLK_ArticleService.draftFromCase(recordId);
                        }
                    }
                }
                when 'articles' {
                    if (recordId == null) {
                        return SLK_ArticleService.createBlank(SLK_AIService.getStr(body, 'title'), SLK_AIService.getStr(body, 'type'));
                    }
                    if (recordId == 'generate') {
                        return SLK_ArticleService.draftFromTopic(SLK_AIService.getStr(body, 'topic'), SLK_AIService.getStr(body, 'type'));
                    }
                    switch on action {
                        when 'assist' {
                            return SLK_ArticleService.assist(recordId, body);
                        }
                        when 'quality' {
                            return SLK_ArticleService.qualityCheck(recordId);
                        }
                        when 'submit' {
                            return SLK_ReviewService.submit(
                                recordId,
                                (Id) SLK_AIService.getStr(body, 'reviewerId'),
                                SLK_AIService.getStr(body, 'notes'),
                                body.get('runAiCheck') != false
                            );
                        }
                        when 'publish' {
                            return SLK_ArticleService.publish(recordId, body.get('linkGapCases') != false);
                        }
                        when 'revise' {
                            return SLK_ArticleService.startRevision(recordId, SLK_AIService.getStr(body, 'reason'));
                        }
                        when 'archive' {
                            return SLK_ArticleService.archive(recordId);
                        }
                    }
                }
                when 'reviews' {
                    switch on action {
                        when 'decision' {
                            return SLK_ReviewService.decide(
                                recordId,
                                SLK_AIService.getStr(body, 'decision'),
                                SLK_AIService.getStr(body, 'comments')
                            );
                        }
                        when 'quality' {
                            return SLK_ReviewService.refreshQuality(recordId);
                        }
                    }
                }
                when 'health' {
                    if (recordId == 'duplicates') {
                        return SLK_ArticleService.findDuplicates();
                    }
                }
                when 'probe' {
                    return SLK_ArticleService.probe(SLK_AIService.getStr(body, 'question'));
                }
            }
        } else if (method == 'PATCH' && resource == 'articles' && recordId != null) {
            Object fields = body.get('fields');
            return SLK_ArticleService.saveArticle(
                recordId,
                fields instanceof Map<String, Object> ? (Map<String, Object>) fields : body
            );
        } else if (method == 'DELETE' && resource == 'articles' && recordId != null) {
            return SLK_ArticleService.deleteDraft(recordId);
        }
        throw new RouteException('No route for ' + method + ' /' + String.join(path, '/'));
    }

    @TestVisible
    private static List<String> segments(String uri) {
        String trimmed = uri == null ? '' : uri.substringAfter('/slk/');
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

    private static Integer toInt(String value) {
        return String.isBlank(value) ? null : Integer.valueOf(value);
    }

    public class RouteException extends Exception {
    }
}