/**
 * Data behind the agent productivity panels: Entitlement milestone (SLA) watch, weekly scorecard,
 * follow-up tasks, AI trending issues, and similar resolved cases.
 */
public with sharing class SLK_InsightsService {
    private static final Integer DUE_SOON_MINUTES = 60;
    private static final Set<String> TRENDS = new Set<String>{ 'rising', 'steady', 'new' };
    private static final Set<String> STOP_WORDS = new Set<String>{
        'the', 'and', 'for', 'with', 'not', 'are', 'was', 'can', 'cannot', 'our', 'your', 'from', 'this', 'that', 'have',
        'has', 'after', 'when', 'into', 'about', 'issue', 'problem', 'help', 'need', 'please', 'customer', 'request', 'question',
        'new', 'how', 'what', 'why', 'does', 'get', 'got', 'use', 'using', 'will', 'would', 'should', 'some', 'any', 'all', 'one',
        'two', 'more', 'still', 'doesn', 'isn', 'won', 'cant', 'dont', 'add', 'set', 'there', 'their', 'they'
    };

    public class InsightsException extends Exception {
    }

    // ---------------------------------------------------------------- SLA

    public static Map<String, Object> slaWatch(Id userId) {
        Datetime now = Datetime.now();
        Integer breached = 0;
        Integer dueSoon = 0;
        Integer onTrack = 0;
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (CaseMilestone m : [
            SELECT Id, CaseId, Case.CaseNumber, Case.Subject, Case.Priority, Case.Contact.Name, MilestoneType.Name, StartDate, TargetDate,
                CompletionDate, IsCompleted, IsViolated, TargetResponseInMins
            FROM CaseMilestone
            WHERE Case.OwnerId = :userId AND IsCompleted = FALSE AND Case.IsClosed = FALSE
            ORDER BY TargetDate ASC
            LIMIT 200
        ]) {
            Map<String, Object> dto = milestoneDto(m, now);
            String state = (String) dto.get('state');
            if (state == 'breached') {
                breached++;
            } else if (state == 'due') {
                dueSoon++;
            } else {
                onTrack++;
            }
            if (items.size() < 8) {
                items.add(dto);
            }
        }
        return new Map<String, Object>{
            'breached' => breached,
            'dueSoon' => dueSoon,
            'onTrack' => onTrack,
            'items' => items,
            'serverTime' => now
        };
    }

    public static Map<String, Object> caseSla(Id caseId) {
        Datetime now = Datetime.now();
        List<Case> cases = [SELECT Id, Entitlement.Name, SlaStartDate, IsStopped FROM Case WHERE Id = :caseId];
        if (cases.isEmpty()) {
            throw new InsightsException('Case not found.');
        }
        List<Map<String, Object>> milestones = new List<Map<String, Object>>();
        for (CaseMilestone m : [
            SELECT Id, CaseId, Case.CaseNumber, Case.Subject, Case.Priority, Case.Contact.Name, MilestoneType.Name, StartDate, TargetDate,
                CompletionDate, IsCompleted, IsViolated, TargetResponseInMins
            FROM CaseMilestone
            WHERE CaseId = :caseId
            ORDER BY StartDate ASC, TargetDate ASC
            LIMIT 20
        ]) {
            milestones.add(milestoneDto(m, now));
        }
        return new Map<String, Object>{
            'entitlement' => cases[0].Entitlement?.Name,
            'slaStart' => cases[0].SlaStartDate,
            'stopped' => cases[0].IsStopped,
            'milestones' => milestones,
            'serverTime' => now
        };
    }

    private static Map<String, Object> milestoneDto(CaseMilestone m, Datetime now) {
        Long minutesLeft = m.TargetDate == null ? null : (m.TargetDate.getTime() - now.getTime()) / 60000;
        String state;
        if (m.IsCompleted) {
            state = m.IsViolated ? 'missed' : 'met';
        } else if (m.IsViolated || (minutesLeft != null && minutesLeft < 0)) {
            state = 'breached';
        } else if (minutesLeft != null && minutesLeft <= DUE_SOON_MINUTES) {
            state = 'due';
        } else {
            state = 'ok';
        }
        return new Map<String, Object>{
            'id' => m.Id,
            'caseId' => m.CaseId,
            'caseNumber' => m.Case?.CaseNumber,
            'subject' => m.Case?.Subject,
            'priority' => m.Case?.Priority,
            'contactName' => m.Case?.Contact?.Name,
            'name' => m.MilestoneType?.Name,
            'startDate' => m.StartDate,
            'targetDate' => m.TargetDate,
            'completedDate' => m.CompletionDate,
            'targetMinutes' => m.TargetResponseInMins,
            'state' => state
        };
    }

    // ---------------------------------------------------------------- scorecard

    public static Map<String, Object> scorecard(Id userId) {
        Date today = Date.today();
        Date weekStart = today.addDays(-6);
        Date priorStart = today.addDays(-13);
        Datetime since = Datetime.newInstance(priorStart, Time.newInstance(0, 0, 0, 0));

        Map<Date, Map<String, Integer>> byDay = new Map<Date, Map<String, Integer>>();
        for (Integer i = 0; i < 7; i++) {
            byDay.put(weekStart.addDays(i), new Map<String, Integer>{ 'cases' => 0, 'conversations' => 0 });
        }

        Integer casesWeek = 0;
        Integer casesPrior = 0;
        for (Case c : [SELECT ClosedDate FROM Case WHERE OwnerId = :userId AND IsClosed = TRUE AND ClosedDate >= :since LIMIT 2000]) {
            Date day = c.ClosedDate.date();
            if (day >= weekStart) {
                casesWeek++;
                if (byDay.containsKey(day)) {
                    byDay.get(day).put('cases', byDay.get(day).get('cases') + 1);
                }
            } else {
                casesPrior++;
            }
        }

        Integer conversations = 0;
        Integer conversationsPrior = 0;
        Long handleTotal = 0;
        Integer handled = 0;
        Integer positive = 0;
        Integer rated = 0;
        Map<String, Integer> channels = new Map<String, Integer>{ 'Voice' => 0, 'Messaging' => 0, 'Case' => 0 };
        for (SLK_Work_Item__c item : [
            SELECT Channel__c, Accepted_At__c, Closed_At__c, Sentiment__c
            FROM SLK_Work_Item__c
            WHERE Agent__c = :userId AND Status__c = 'Closed' AND Closed_At__c >= :since
            LIMIT 2000
        ]) {
            Date day = item.Closed_At__c.date();
            if (day < weekStart) {
                conversationsPrior++;
                continue;
            }
            conversations++;
            if (byDay.containsKey(day)) {
                byDay.get(day).put('conversations', byDay.get(day).get('conversations') + 1);
            }
            if (channels.containsKey(item.Channel__c)) {
                channels.put(item.Channel__c, channels.get(item.Channel__c) + 1);
            }
            if (item.Accepted_At__c != null) {
                handleTotal += (item.Closed_At__c.getTime() - item.Accepted_At__c.getTime()) / 1000;
                handled++;
            }
            if (item.Sentiment__c != null) {
                rated++;
                if (item.Sentiment__c == 'Positive') {
                    positive++;
                }
            }
        }

        Datetime weekSince = Datetime.newInstance(weekStart, Time.newInstance(0, 0, 0, 0));
        Integer milestonesDone = [
            SELECT COUNT()
            FROM CaseMilestone
            WHERE Case.OwnerId = :userId AND IsCompleted = TRUE AND CompletionDate >= :weekSince
        ];
        Integer milestonesMissed = [
            SELECT COUNT()
            FROM CaseMilestone
            WHERE Case.OwnerId = :userId AND IsCompleted = TRUE AND IsViolated = TRUE AND CompletionDate >= :weekSince
        ];

        List<Map<String, Object>> days = new List<Map<String, Object>>();
        for (Integer i = 0; i < 7; i++) {
            Date day = weekStart.addDays(i);
            Map<String, Integer> counts = byDay.get(day);
            days.add(new Map<String, Object>{ 'date' => day, 'cases' => counts.get('cases'), 'conversations' => counts.get('conversations') });
        }
        return new Map<String, Object>{
            'days' => days,
            'casesClosed' => casesWeek,
            'casesClosedPrior' => casesPrior,
            'conversations' => conversations,
            'conversationsPrior' => conversationsPrior,
            'avgHandleSeconds' => handled == 0 ? 0 : (Integer) (handleTotal / handled),
            'positivePct' => rated == 0 ? null : (Integer) Math.round(positive * 100.0 / rated),
            'slaMetPct' => milestonesDone == 0 ? null : (Integer) Math.round((milestonesDone - milestonesMissed) * 100.0 / milestonesDone),
            'channels' => channels
        };
    }

    // ---------------------------------------------------------------- follow-up tasks

    public static Map<String, Object> tasks(Id userId) {
        Date today = Date.today();
        Integer overdue = [SELECT COUNT() FROM Task WHERE OwnerId = :userId AND IsClosed = FALSE AND ActivityDate < :today];
        Integer dueToday = [SELECT COUNT() FROM Task WHERE OwnerId = :userId AND IsClosed = FALSE AND ActivityDate = :today];
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (Task t : [
            SELECT Id, Subject, ActivityDate, Priority, Status, WhatId, What.Name, What.Type, Who.Name
            FROM Task
            WHERE OwnerId = :userId AND IsClosed = FALSE
            ORDER BY ActivityDate ASC NULLS LAST, CreatedDate DESC
            LIMIT 12
        ]) {
            items.add(
                new Map<String, Object>{
                    'id' => t.Id,
                    'subject' => t.Subject,
                    'dueDate' => t.ActivityDate,
                    'priority' => t.Priority,
                    'status' => t.Status,
                    'whatId' => t.WhatId,
                    'whatName' => t.What?.Name,
                    'whatType' => t.What?.Type,
                    'whoName' => t.Who?.Name,
                    'overdue' => t.ActivityDate != null && t.ActivityDate < today
                }
            );
        }
        return new Map<String, Object>{ 'overdue' => overdue, 'dueToday' => dueToday, 'items' => items };
    }

    public static Map<String, Object> completeTask(Id taskId) {
        update new Task(Id = taskId, Status = 'Completed');
        return new Map<String, Object>{ 'ok' => true, 'id' => taskId };
    }

    // ---------------------------------------------------------------- trending issues

    public static Map<String, Object> trends() {
        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Priority, Status, CreatedDate
            FROM Case
            WHERE CreatedDate = LAST_N_DAYS:7 AND Subject != NULL
            ORDER BY CreatedDate DESC
            LIMIT 80
        ];
        if (cases.size() < 3) {
            return new Map<String, Object>{
                'headline' => 'Not enough new cases this week to spot a trend.',
                'clusters' => new List<Object>(),
                'sampled' => cases.size(),
                'generatedAt' => Datetime.now()
            };
        }
        String block = '';
        for (Integer i = 0; i < cases.size(); i++) {
            Case c = cases[i];
            block += 'S' + (i + 1) + ' | ' + SLK_AIService.truncate(c.Subject, 120) + ' | ' + c.Priority + ' | ' + c.CreatedDate.format('EEE') + '\n';
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You spot emerging issues for a customer service floor. Group similar cases into themes. Only use the cases provided.',
            'CASES CREATED IN THE LAST 7 DAYS (newest first):\n' + block +
            '\n\nJSON shape: {"headline":"one sentence on what is driving volume","clusters":[{"label":"max 5 words","refs":["S1","S4"],' +
            '"trend":"rising|steady|new","insight":"max 16 words","action":"max 10 words, what an agent should do"}]} — up to 5 clusters, largest first.'
        );
        List<Map<String, Object>> clusters = new List<Map<String, Object>>();
        for (Object raw : SLK_AIService.getList(ai, 'clusters')) {
            if (!(raw instanceof Map<String, Object>) || clusters.size() >= 5) {
                continue;
            }
            Map<String, Object> cluster = (Map<String, Object>) raw;
            List<Map<String, Object>> sample = new List<Map<String, Object>>();
            Integer count = 0;
            Integer urgent = 0;
            for (Object ref : SLK_AIService.getList(cluster, 'refs')) {
                String digits = String.valueOf(ref).replaceAll('[^0-9]', '');
                if (String.isBlank(digits)) {
                    continue;
                }
                Integer index = Integer.valueOf(digits) - 1;
                if (index < 0 || index >= cases.size()) {
                    continue;
                }
                Case c = cases[index];
                count++;
                if (c.Priority == 'Critical' || c.Priority == 'High') {
                    urgent++;
                }
                if (sample.size() < 3) {
                    sample.add(new Map<String, Object>{ 'id' => c.Id, 'caseNumber' => c.CaseNumber, 'subject' => c.Subject });
                }
            }
            if (count == 0) {
                continue;
            }
            clusters.add(
                new Map<String, Object>{
                    'label' => SLK_AIService.truncate(SLK_AIService.getStr(cluster, 'label'), 50),
                    'count' => count,
                    'urgent' => urgent,
                    'trend' => SLK_AIService.pick(SLK_AIService.getStr(cluster, 'trend'), TRENDS, 'steady'),
                    'insight' => SLK_AIService.getStr(cluster, 'insight'),
                    'action' => SLK_AIService.getStr(cluster, 'action'),
                    'cases' => sample
                }
            );
        }
        return new Map<String, Object>{
            'headline' => SLK_AIService.getStr(ai, 'headline'),
            'clusters' => clusters,
            'sampled' => cases.size(),
            'generatedAt' => Datetime.now()
        };
    }

    // ---------------------------------------------------------------- similar resolved cases

    public static Map<String, Object> similar(Id caseId) {
        List<Case> source = [SELECT Id, Subject FROM Case WHERE Id = :caseId];
        if (source.isEmpty()) {
            throw new InsightsException('Case not found.');
        }
        List<String> terms = keyTerms(source[0].Subject);
        if (terms.isEmpty()) {
            return new Map<String, Object>{ 'terms' => terms, 'items' => new List<Object>() };
        }
        String sosl =
            'FIND {' + String.join(terms, ' OR ') + '} IN NAME FIELDS RETURNING Case(Id, CaseNumber, Subject, Priority, Description, ' +
            'CreatedDate, ClosedDate, Contact.Name WHERE IsClosed = TRUE AND Id != \'' + String.escapeSingleQuotes(caseId) +
            '\' ORDER BY ClosedDate DESC LIMIT 25)';
        List<Case> matches = (List<Case>) Search.query(sosl)[0];
        Set<Id> ids = new Map<Id, Case>(matches).keySet();

        Map<Id, String> resolution = new Map<Id, String>();
        for (CaseComment comment : [
            SELECT ParentId, CommentBody FROM CaseComment WHERE ParentId IN :ids ORDER BY CreatedDate DESC LIMIT 60
        ]) {
            if (!resolution.containsKey(comment.ParentId) && String.isNotBlank(comment.CommentBody)) {
                resolution.put(comment.ParentId, comment.CommentBody);
            }
        }
        for (EmailMessage email : [
            SELECT ParentId, TextBody FROM EmailMessage WHERE ParentId IN :ids AND Incoming = FALSE ORDER BY MessageDate DESC LIMIT 60
        ]) {
            if (!resolution.containsKey(email.ParentId) && String.isNotBlank(email.TextBody)) {
                resolution.put(email.ParentId, email.TextBody);
            }
        }

        Integer needed = Math.min(2, terms.size());
        List<List<Map<String, Object>>> byStrength = new List<List<Map<String, Object>>>();
        for (Integer i = 0; i <= terms.size(); i++) {
            byStrength.add(new List<Map<String, Object>>());
        }
        for (Case c : matches) {
            String subject = c.Subject == null ? '' : c.Subject.toLowerCase();
            List<String> matched = new List<String>();
            for (String term : terms) {
                if (subject.contains(term)) {
                    matched.add(term);
                }
            }
            if (matched.size() < needed) {
                continue;
            }
            String text = resolution.containsKey(c.Id) ? resolution.get(c.Id) : c.Description;
            byStrength[matched.size()].add(
                new Map<String, Object>{
                    'id' => c.Id,
                    'caseNumber' => c.CaseNumber,
                    'subject' => c.Subject,
                    'priority' => c.Priority,
                    'contactName' => c.Contact?.Name,
                    'closedDate' => c.ClosedDate,
                    'resolutionMinutes' => c.ClosedDate == null ? null : (c.ClosedDate.getTime() - c.CreatedDate.getTime()) / 60000,
                    'resolution' => String.isBlank(text) ? null : SLK_AIService.truncate(SLK_AIService.stripHtml(text).normalizeSpace(), 220),
                    'matched' => matched
                }
            );
        }
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (Integer i = byStrength.size() - 1; i >= 0 && items.size() < 5; i--) {
            for (Map<String, Object> item : byStrength[i]) {
                if (items.size() < 5) {
                    items.add(item);
                }
            }
        }
        return new Map<String, Object>{ 'terms' => terms, 'items' => items };
    }

    @TestVisible
    private static List<String> keyTerms(String subject) {
        List<String> words = new List<String>();
        if (String.isBlank(subject)) {
            return words;
        }
        for (String raw : subject.toLowerCase().split('[^a-z0-9]+')) {
            if (raw.length() >= 3 && !STOP_WORDS.contains(raw) && !words.contains(raw)) {
                words.add(raw);
            }
        }
        return words.size() > 4 ? new List<String>{ words[0], words[1], words[2], words[3] } : words;
    }
}