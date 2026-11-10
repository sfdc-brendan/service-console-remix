/**
 * Conversation intelligence for completed calls and chats: outcome, quality scores, coaching,
 * and keyword markers pinned to transcript turns so a reviewer can jump to what happened.
 * Results are cached on the work item and regenerated on request.
 */
public with sharing class SLK_CallAnalysisService {
    public static final Set<String> MARKER_KINDS = new Set<String>{
        'issue',
        'objection',
        'escalation',
        'commitment',
        'resolution',
        'compliance',
        'competitor',
        'pricing',
        'emotion'
    };
    private static final Set<String> KEYWORD_CATEGORIES = new Set<String>{ 'product', 'issue', 'competitor', 'emotion', 'commitment', 'pricing' };
    private static final Set<String> OUTCOMES = new Set<String>{ 'Resolved', 'Follow-up needed', 'Escalated', 'Unresolved' };
    private static final List<String> SCORE_KEYS = new List<String>{ 'empathy', 'clarity', 'resolution', 'compliance' };
    private static final Integer MAX_CACHE = 131072;

    public class AnalysisException extends Exception {
    }

    public static Map<String, Object> analyze(Id workId, Boolean refresh) {
        List<SLK_Work_Item__c> rows = [
            SELECT Id, Channel__c, Status__c, Subject__c, Customer_Name__c, Analysis__c, Case__r.CaseNumber, Case__r.Subject
            FROM SLK_Work_Item__c
            WHERE Id = :workId
        ];
        if (rows.isEmpty()) {
            throw new AnalysisException('Conversation not found.');
        }
        SLK_Work_Item__c work = rows[0];
        if (work.Status__c != 'Closed') {
            throw new AnalysisException('Analysis is available after the conversation ends.');
        }
        if (refresh != true && String.isNotBlank(work.Analysis__c)) {
            Object cached = JSON.deserializeUntyped(work.Analysis__c);
            if (cached instanceof Map<String, Object>) {
                return (Map<String, Object>) cached;
            }
        }

        List<SLK_Conversation_Message__c> turns = new List<SLK_Conversation_Message__c>();
        String block = '';
        for (SLK_Conversation_Message__c message : [
            SELECT Id, Sender__c, Body__c, Sent_At__c
            FROM SLK_Conversation_Message__c
            WHERE Work_Item__c = :workId
            ORDER BY Sent_At__c ASC, CreatedDate ASC
            LIMIT 200
        ]) {
            if (message.Sender__c != 'Customer' && message.Sender__c != 'Agent') {
                continue;
            }
            turns.add(message);
            block +=
                'T' + turns.size() + ' | ' + (message.Sender__c == 'Agent' ? 'AGENT' : 'CUSTOMER') + ' | ' +
                SLK_AIService.truncate(message.Body__c, 400) + '\n';
        }
        if (turns.isEmpty()) {
            throw new AnalysisException('There is no transcript to analyze.');
        }

        String kind = work.Channel__c == 'Voice' ? 'phone call' : 'chat conversation';
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are a conversation intelligence analyst for a customer service team. Analyze a completed ' + kind +
            ' between an agent and a customer. Ground every finding in the transcript and cite the turn it happened in. Never invent events.',
            'TOPIC: ' + (work.Case__r?.Subject != null ? work.Case__r.Subject : work.Subject__c) + '\nTRANSCRIPT (numbered turns):\n' + block +
            '\n\nJSON shape: {"headline":"max 12 words","summary":"2-3 sentences","customerIntent":"max 10 words",' +
            '"outcome":"Resolved|Follow-up needed|Escalated|Unresolved","outcomeReason":"max 16 words",' +
            '"scores":{"empathy":0-100,"clarity":0-100,"resolution":0-100,"compliance":0-100},' +
            '"markers":[{"turn":"T3","kind":"issue|objection|escalation|commitment|resolution|compliance|competitor|pricing|emotion",' +
            '"label":"max 4 words","detail":"max 18 words"}],' +
            '"keywords":[{"term":"word or short phrase exactly as spoken","category":"product|issue|competitor|emotion|commitment|pricing"}],' +
            '"strengths":["max 14 words"],"improvements":["max 14 words"]}' +
            ' — 4 to 10 markers in turn order, up to 8 keywords, up to 3 strengths and 3 improvements.'
        );
        Map<String, Object> result = normalize(ai, turns);
        String serialized = JSON.serialize(result);
        if (serialized.length() <= MAX_CACHE) {
            update new SLK_Work_Item__c(Id = workId, Analysis__c = serialized);
        }
        return result;
    }

    @TestVisible
    private static Map<String, Object> normalize(Map<String, Object> ai, List<SLK_Conversation_Message__c> turns) {
        Map<String, Object> rawScores = ai.get('scores') instanceof Map<String, Object> ? (Map<String, Object>) ai.get('scores') : new Map<String, Object>();
        Map<String, Object> scores = new Map<String, Object>();
        Integer total = 0;
        for (String key : SCORE_KEYS) {
            Integer score = Math.max(0, Math.min(100, SLK_AIService.getInt(rawScores, key, 70)));
            scores.put(key, score);
            total += score;
        }
        scores.put('overall', (Integer) Math.round(total / (Decimal) SCORE_KEYS.size()));

        List<Map<String, Object>> markers = new List<Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(ai, 'markers')) {
            if (!(raw instanceof Map<String, Object>) || markers.size() >= 12) {
                continue;
            }
            Map<String, Object> marker = (Map<String, Object>) raw;
            String digits = String.valueOf(marker.get('turn')).replaceAll('[^0-9]', '');
            if (String.isBlank(digits)) {
                continue;
            }
            Integer index = Integer.valueOf(digits) - 1;
            if (index < 0 || index >= turns.size()) {
                continue;
            }
            markers.add(
                new Map<String, Object>{
                    'messageId' => turns[index].Id,
                    'turn' => index + 1,
                    'kind' => SLK_AIService.pick(SLK_AIService.getStr(marker, 'kind'), MARKER_KINDS, 'issue'),
                    'label' => SLK_AIService.truncate(SLK_AIService.getStr(marker, 'label'), 40),
                    'detail' => SLK_AIService.truncate(SLK_AIService.getStr(marker, 'detail'), 180)
                }
            );
        }

        List<Map<String, Object>> keywords = new List<Map<String, Object>>();
        Set<String> seen = new Set<String>();
        for (Object raw : SLK_AIService.getList(ai, 'keywords')) {
            if (!(raw instanceof Map<String, Object>) || keywords.size() >= 8) {
                continue;
            }
            Map<String, Object> keyword = (Map<String, Object>) raw;
            String term = SLK_AIService.truncate(SLK_AIService.getStr(keyword, 'term'), 40);
            if (String.isBlank(term) || seen.contains(term.toLowerCase())) {
                continue;
            }
            seen.add(term.toLowerCase());
            keywords.add(
                new Map<String, Object>{ 'term' => term, 'category' => SLK_AIService.pick(SLK_AIService.getStr(keyword, 'category'), KEYWORD_CATEGORIES, 'issue') }
            );
        }

        return new Map<String, Object>{
            'headline' => SLK_AIService.getStr(ai, 'headline'),
            'summary' => SLK_AIService.getStr(ai, 'summary'),
            'customerIntent' => SLK_AIService.getStr(ai, 'customerIntent'),
            'outcome' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'outcome'), OUTCOMES, 'Follow-up needed'),
            'outcomeReason' => SLK_AIService.getStr(ai, 'outcomeReason'),
            'scores' => scores,
            'markers' => markers,
            'keywords' => keywords,
            'strengths' => limitStrings(SLK_AIService.getList(ai, 'strengths'), 3),
            'improvements' => limitStrings(SLK_AIService.getList(ai, 'improvements'), 3),
            'generatedAt' => Datetime.now()
        };
    }

    private static List<String> limitStrings(List<Object> values, Integer max) {
        List<String> result = new List<String>();
        for (Object value : values) {
            if (value != null && String.isNotBlank(String.valueOf(value)) && result.size() < max) {
                result.add(SLK_AIService.truncate(String.valueOf(value), 160));
            }
        }
        return result;
    }
}