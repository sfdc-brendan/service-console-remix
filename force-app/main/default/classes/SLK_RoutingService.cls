/**
 * Omni-channel style routing engine for the Service Console: agent presence, capacity-aware
 * offers, accept / decline / transfer / close, and the read models behind the Omni dock,
 * Console Home, and the Supervisor Command Center.
 */
public with sharing class SLK_RoutingService {
    public static final Integer OFFER_TIMEOUT_SECONDS = 30;
    public static final Integer DECLINE_MEMORY_SECONDS = 120;
    public static final Integer SLA_RISK_MINUTES = 15;
    public static final Set<String> STATUSES = new Set<String>{ 'Online', 'Busy', 'Break', 'Offline' };
    public static final Set<String> CHANNELS = new Set<String>{ 'Case', 'Voice', 'Messaging' };
    public static final Set<String> PRIORITIES = new Set<String>{ 'Critical', 'High', 'Medium', 'Low' };
    private static final List<String> PRIORITY_ORDER = new List<String>{ 'Critical', 'High', 'Medium', 'Low' };
    public static final Set<String> OPEN_WORK = new Set<String>{ 'Offered', 'Accepted' };
    public static final Set<String> CASE_STATUSES = new Set<String>{ 'New', 'Working', 'Waiting on Customer', 'Escalated', 'Closed' };
    public static final String DEFAULT_SKILLS = 'Case;Voice;Messaging';
    public static final Integer RELAX_SECONDS = 120;
    private static final Integer CANDIDATE_SNAPSHOT = 4;

    private static final String WORK_FIELDS =
        'Id, Name, Channel__c, Status__c, Subject__c, Customer_Name__c, Queue__c, Priority__c, Agent__c, Agent__r.Name, ' +
        'Case__c, Case__r.CaseNumber, Case__r.Status, Source_Record_Id__c, Offered_At__c, Accepted_At__c, Closed_At__c, ' +
        'Declined_By__c, Sentiment__c, SLA_Due__c, Summary__c, Simulated__c, Scenario__c, Required_Skill__c, Skills__c, On_Hold__c, CreatedDate';
    private static final String WORK_SELECT = 'SELECT ' + WORK_FIELDS + ' FROM SLK_Work_Item__c ';
    private static final String ROUTING_SELECT = 'SELECT ' + WORK_FIELDS + ', Routing_Analysis__c, Routing_Log__c FROM SLK_Work_Item__c ';
    private static final String PRESENCE_SELECT =
        'SELECT Id, Name, Agent__c, Agent__r.Name, Agent__r.SmallPhotoUrl, Status__c, Capacity__c, Skills__c, Status_Changed_At__c, ' +
        'Whisper__c, Whisper_At__c, Virtual_Agent__c, Receives_All_Cases__c FROM SLK_Agent_Presence__c ';

    public class RoutingException extends Exception {
    }

    // ---------------------------------------------------------------- queries

    public static List<SLK_Work_Item__c> queryWork(String whereClause, Map<String, Object> binds) {
        return (List<SLK_Work_Item__c>) Database.queryWithBinds(WORK_SELECT + whereClause, binds, AccessLevel.SYSTEM_MODE);
    }

    /** Same as queryWork plus the AI analysis and routing trail; use for small result sets. */
    public static List<SLK_Work_Item__c> queryRouting(String whereClause, Map<String, Object> binds) {
        return (List<SLK_Work_Item__c>) Database.queryWithBinds(ROUTING_SELECT + whereClause, binds, AccessLevel.SYSTEM_MODE);
    }

    public static List<SLK_Agent_Presence__c> queryPresence(String whereClause, Map<String, Object> binds) {
        return (List<SLK_Agent_Presence__c>) Database.queryWithBinds(PRESENCE_SELECT + whereClause, binds, AccessLevel.SYSTEM_MODE);
    }

    public static SLK_Work_Item__c loadWork(Id workId) {
        List<SLK_Work_Item__c> rows = queryRouting('WHERE Id = :workId', new Map<String, Object>{ 'workId' => workId });
        if (rows.isEmpty()) {
            throw new RoutingException('Work item not found.');
        }
        return rows[0];
    }

    // ---------------------------------------------------------------- presence

    public static SLK_Agent_Presence__c ensurePresence(Id userId) {
        List<SLK_Agent_Presence__c> rows = queryPresence(
            'WHERE Agent__c = :userId ORDER BY CreatedDate LIMIT 1',
            new Map<String, Object>{ 'userId' => userId }
        );
        if (!rows.isEmpty()) {
            return rows[0];
        }
        User agent = [SELECT Name FROM User WHERE Id = :userId];
        SLK_Agent_Presence__c created = new SLK_Agent_Presence__c(
            Name = agent.Name,
            Agent__c = userId,
            Status__c = 'Offline',
            Capacity__c = 4,
            Skills__c = DEFAULT_SKILLS,
            Status_Changed_At__c = Datetime.now()
        );
        insert created;
        return queryPresence('WHERE Id = :id', new Map<String, Object>{ 'id' => created.Id })[0];
    }

    public static Map<String, Object> setStatus(Id userId, String status) {
        if (!STATUSES.contains(status)) {
            throw new RoutingException('Unknown presence status: ' + status);
        }
        SLK_Agent_Presence__c presence = ensurePresence(userId);
        if (presence.Status__c != status) {
            presence.Status__c = status;
            presence.Status_Changed_At__c = Datetime.now();
            update presence;
        }
        if (status != 'Online') {
            List<SLK_Work_Item__c> offers = queryRouting(
                'WHERE Status__c = \'Offered\' AND Agent__c = :userId',
                new Map<String, Object>{ 'userId' => userId }
            );
            for (SLK_Work_Item__c work : offers) {
                logAgent(work, 'requeued', 'Returned to the queue', work.Agent__r?.Name + ' went ' + status + ' before answering');
                requeue(work, userId);
            }
            update offers;
        }
        routeTick();
        return omniState(userId);
    }

    public static Map<String, Object> whisper(Id userId, String text) {
        if (String.isBlank(text)) {
            throw new RoutingException('Write a note before sending a whisper.');
        }
        SLK_Agent_Presence__c presence = ensurePresence(userId);
        presence.Whisper__c = SLK_AIService.truncate(text, 2000);
        presence.Whisper_At__c = Datetime.now();
        update presence;
        return presenceDto(presence, 0, new List<SLK_Work_Item__c>());
    }

    // ---------------------------------------------------------------- routing engine

    public static Map<String, Object> sync(Id userId) {
        SLK_RoutingAIService.triagePending();
        ensurePresence(userId);
        routeTick();
        return omniState(userId);
    }

    public static void routeTick() {
        Datetime now = Datetime.now();
        expireOffers(now);
        releaseClosedCases(now);
        advanceVirtualAgents(now);
        assignQueuedWork(now);
    }

    private static void expireOffers(Datetime now) {
        Datetime cutoff = now.addSeconds(-OFFER_TIMEOUT_SECONDS);
        List<SLK_Work_Item__c> stale = queryRouting(
            'WHERE Status__c = \'Offered\' AND Offered_At__c < :cutoff AND Agent__r.Name != null LIMIT 100',
            new Map<String, Object>{ 'cutoff' => cutoff }
        );
        List<SLK_Work_Item__c> expired = new List<SLK_Work_Item__c>();
        Set<Id> virtualIds = virtualAgentIds();
        for (SLK_Work_Item__c work : stale) {
            if (!virtualIds.contains(work.Agent__c)) {
                logAgent(work, 'timeout', 'Offer timed out', work.Agent__r.Name + ' did not answer within ' + OFFER_TIMEOUT_SECONDS + ' seconds');
                requeue(work, work.Agent__c);
                expired.add(work);
            }
        }
        update expired;
    }

    /** Case work closed outside the console (standard UI, flows, email) frees the agent's capacity. */
    private static void releaseClosedCases(Datetime now) {
        List<SLK_Work_Item__c> finished = queryRouting(
            'WHERE Channel__c = \'Case\' AND Status__c IN :open AND Case__r.IsClosed = TRUE LIMIT 50',
            new Map<String, Object>{ 'open' => OPEN_WORK }
        );
        for (SLK_Work_Item__c item : finished) {
            logAgent(item, 'closed', 'Case closed in Salesforce', 'Released ' + (item.Agent__r?.Name == null ? 'the agent' : item.Agent__r.Name + '\'s') + ' capacity');
            item.Status__c = 'Closed';
            item.Closed_At__c = now;
        }
        update finished;
    }

    private static void advanceVirtualAgents(Datetime now) {
        Set<Id> virtualIds = virtualAgentIds();
        if (virtualIds.isEmpty()) {
            return;
        }
        List<SLK_Work_Item__c> work = queryRouting(
            'WHERE Status__c IN :open AND Agent__c IN :agents LIMIT 200',
            new Map<String, Object>{ 'open' => OPEN_WORK, 'agents' => virtualIds }
        );
        List<SLK_Work_Item__c> changed = new List<SLK_Work_Item__c>();
        for (SLK_Work_Item__c item : work) {
            if (item.Status__c == 'Offered') {
                item.Status__c = 'Accepted';
                item.Accepted_At__c = now;
                logAgent(item, 'accepted', 'Accepted by ' + item.Agent__r.Name, 'Virtual agent picked it up automatically');
                changed.add(item);
            } else if (item.Accepted_At__c != null && item.Accepted_At__c.addSeconds(virtualHandleSeconds(item)) < now) {
                item.Status__c = 'Closed';
                item.Closed_At__c = now;
                item.Summary__c = 'Resolved by ' + item.Agent__r.Name + '.';
                logAgent(item, 'closed', 'Closed by ' + item.Agent__r.Name, null);
                changed.add(item);
            }
        }
        update changed;
    }

    private static Integer virtualHandleSeconds(SLK_Work_Item__c item) {
        Integer spread = Math.mod(Math.abs(String.valueOf(item.Id).hashCode()), 240);
        return (item.Channel__c == 'Voice' ? 240 : 150) + spread;
    }

    private static void assignQueuedWork(Datetime now) {
        List<SLK_Work_Item__c> queued = byPriority(
            queryRouting('WHERE Status__c = \'Queued\' ORDER BY CreatedDate ASC LIMIT 50', new Map<String, Object>())
        );
        if (queued.isEmpty()) {
            return;
        }
        List<SLK_Agent_Presence__c> online = queryPresence(
            'WHERE Status__c = \'Online\' AND Agent__c != null',
            new Map<String, Object>()
        );
        Set<Id> agentIds = new Set<Id>();
        for (SLK_Agent_Presence__c presence : online) {
            agentIds.add(presence.Agent__c);
        }
        Map<Id, Integer> used = new Map<Id, Integer>();
        Set<Id> hasOffer = new Set<Id>();
        for (SLK_Work_Item__c item : queryWork(
            'WHERE Status__c IN :open AND Agent__c IN :agents',
            new Map<String, Object>{ 'open' => OPEN_WORK, 'agents' => agentIds }
        )) {
            used.put(item.Agent__c, usedOf(used, item.Agent__c) + weight(item.Channel__c));
            if (item.Status__c == 'Offered') {
                hasOffer.add(item.Agent__c);
            }
        }
        Set<String> staffed = staffedSkills();
        List<SLK_Agent_Presence__c> caseAgents = allCasesAgents();

        List<SLK_Work_Item__c> changed = new List<SLK_Work_Item__c>();
        for (SLK_Work_Item__c item : queued) {
            Boolean ignoreDeclines = item.CreatedDate < now.addSeconds(-DECLINE_MEMORY_SECONDS);
            Boolean pinned = item.Channel__c == 'Case' && !caseAgents.isEmpty();
            String relaxReason = pinned ? null : relaxReason(item, staffed, now);
            List<Candidate> candidates = new List<Candidate>();
            Candidate best = null;
            for (SLK_Agent_Presence__c presence : online) {
                if (pinned && presence.Receives_All_Cases__c != true) {
                    continue;
                }
                Candidate candidate = evaluate(presence, item, used, hasOffer, ignoreDeclines, relaxReason == null, pinned);
                candidates.add(candidate);
                if (candidate.eligible && (best == null || candidate.beats(best))) {
                    best = candidate;
                }
            }
            candidates.sort(new BestFirst());
            if (best == null) {
                if (SLK_RoutingLog.lastType(item) != 'waiting') {
                    Map<String, Object> waiting = pinned
                        ? SLK_RoutingLog.event('waiting', 'Waiting for ' + agentNames(caseAgents), pinnedWaitingDetail(caseAgents, candidates))
                        : SLK_RoutingLog.event(
                              'waiting',
                              online.isEmpty() ? 'Waiting for an agent to come online' : 'Waiting for a matching agent',
                              waitingDetail(candidates, item)
                          );
                    waiting.put('candidates', snapshot(candidates));
                    SLK_RoutingLog.add(item, waiting);
                    changed.add(item);
                }
                continue;
            }
            Boolean relaxed = relaxReason != null && best.missing.contains(item.Required_Skill__c.trim());
            if (relaxed) {
                SLK_RoutingLog.add(item, SLK_RoutingLog.event('relaxed', 'Widened the search', relaxReason));
            }
            Map<String, Object> offer = SLK_RoutingLog.event(
                'offered',
                'Offered to ' + best.name,
                (pinned ? 'All cases go to ' + agentNames(caseAgents) + ' · ' : '') + offerDetail(best)
            );
            offer.put('pinned', pinned);
            offer.put('agentId', best.presence.Agent__c);
            offer.put('agentName', best.name);
            offer.put('score', best.score);
            offer.put('matched', best.matched);
            offer.put('missing', best.missing);
            offer.put('levels', best.levels);
            offer.put('relaxed', relaxed);
            offer.put('candidates', snapshot(candidates));
            SLK_RoutingLog.add(item, offer);
            item.Status__c = 'Offered';
            item.Agent__c = best.presence.Agent__c;
            item.Offered_At__c = now;
            changed.add(item);
            hasOffer.add(best.presence.Agent__c);
            used.put(best.presence.Agent__c, usedOf(used, best.presence.Agent__c) + weight(item.Channel__c));
        }
        update changed;
    }

    /** Stable priority ordering (Critical, High, Medium, Low) that keeps FIFO within each band. */
    private static List<SLK_Work_Item__c> byPriority(List<SLK_Work_Item__c> items) {
        Map<String, List<SLK_Work_Item__c>> bands = new Map<String, List<SLK_Work_Item__c>>();
        for (String priority : PRIORITY_ORDER) {
            bands.put(priority, new List<SLK_Work_Item__c>());
        }
        for (SLK_Work_Item__c item : items) {
            String key = bands.containsKey(item.Priority__c) ? item.Priority__c : 'Medium';
            bands.get(key).add(item);
        }
        List<SLK_Work_Item__c> ordered = new List<SLK_Work_Item__c>();
        for (String priority : PRIORITY_ORDER) {
            ordered.addAll(bands.get(priority));
        }
        return ordered;
    }

    /** Agents flagged to receive every case; while any exist, Case work routes only to them. */
    private static List<SLK_Agent_Presence__c> allCasesAgents() {
        return queryPresence('WHERE Receives_All_Cases__c = TRUE AND Agent__c != null', new Map<String, Object>());
    }

    private static String agentNames(List<SLK_Agent_Presence__c> agents) {
        List<String> names = new List<String>();
        for (SLK_Agent_Presence__c presence : agents) {
            names.add(presence.Agent__r?.Name == null ? presence.Name : presence.Agent__r.Name);
        }
        return String.join(names, ', ');
    }

    private static String pinnedWaitingDetail(List<SLK_Agent_Presence__c> agents, List<Candidate> candidates) {
        Map<Id, String> reasons = new Map<Id, String>();
        for (Candidate candidate : candidates) {
            reasons.put(candidate.presence.Agent__c, candidate.reason);
        }
        List<String> parts = new List<String>{ 'All cases are reserved for ' + agentNames(agents) };
        for (SLK_Agent_Presence__c presence : agents) {
            String name = presence.Agent__r?.Name == null ? presence.Name : presence.Agent__r.Name;
            parts.add(name + ': ' + (reasons.containsKey(presence.Agent__c) ? reasons.get(presence.Agent__c) : presence.Status__c));
        }
        return String.join(parts, ' · ');
    }

    /**
     * Scores an online agent for a piece of work. Required skill proficiency counts most, preferred
     * skills add up to 20 points, current load subtracts up to 20, and virtual agents rank just below people.
     * With anySkills, channel staffing and the required skill are not checked (the all-cases rule).
     */
    private static Candidate evaluate(
        SLK_Agent_Presence__c presence,
        SLK_Work_Item__c item,
        Map<Id, Integer> used,
        Set<Id> hasOffer,
        Boolean ignoreDeclines,
        Boolean enforceRequired,
        Boolean anySkills
    ) {
        Candidate candidate = new Candidate();
        candidate.presence = presence;
        candidate.name = presence.Agent__r?.Name == null ? presence.Name : presence.Agent__r.Name;
        candidate.load = usedOf(used, presence.Agent__c);
        candidate.capacity = presence.Capacity__c == null ? 4 : presence.Capacity__c.intValue();
        candidate.since = presence.Status_Changed_At__c == null ? Datetime.now() : presence.Status_Changed_At__c;
        Map<String, Integer> levels = SLK_RoutingSkills.parse(presence.Skills__c);
        String required = String.isBlank(item.Required_Skill__c) ? null : item.Required_Skill__c.trim();

        Integer points = 40;
        Integer preferredPoints = 0;
        for (String skill : workSkills(item)) {
            Integer level = levels.get(skill.toLowerCase());
            if (level == null) {
                candidate.missing.add(skill);
                continue;
            }
            candidate.matched.add(skill);
            candidate.levels.put(skill, level);
            if (skill.equalsIgnoreCase(required)) {
                points += level * 4;
            } else {
                preferredPoints += level * 2;
            }
        }
        points += Math.min(20, preferredPoints);
        points -= candidate.capacity == 0 ? 20 : (Integer) Math.round(20.0 * candidate.load / candidate.capacity);
        if (presence.Virtual_Agent__c == true) {
            points -= 4;
        }
        candidate.score = Math.max(0, Math.min(100, points));

        if (!anySkills && !levels.containsKey(item.Channel__c.toLowerCase())) {
            candidate.reason = 'Not staffed on ' + item.Channel__c;
        } else if (hasOffer.contains(presence.Agent__c)) {
            candidate.reason = 'Reviewing another offer';
        } else if (candidate.load + weight(item.Channel__c) > candidate.capacity) {
            candidate.reason = 'At capacity (' + candidate.load + '/' + candidate.capacity + ')';
        } else if (!anySkills && enforceRequired && required != null && !levels.containsKey(required.toLowerCase())) {
            candidate.reason = 'Missing ' + required;
        } else if (!ignoreDeclines && declined(item, presence.Agent__c)) {
            candidate.reason = 'Declined it earlier';
        } else {
            candidate.eligible = true;
        }
        return candidate;
    }

    /** Null while the required skill should be enforced; otherwise why the engine is opening it up. */
    private static String relaxReason(SLK_Work_Item__c item, Set<String> staffed, Datetime now) {
        if (String.isBlank(item.Required_Skill__c)) {
            return null;
        }
        String required = item.Required_Skill__c.trim();
        if (!staffed.contains(required.toLowerCase())) {
            return 'No agent on shift has ' + required + ', so any ' + item.Channel__c + ' agent can take it';
        }
        if (item.CreatedDate < now.addSeconds(-RELAX_SECONDS)) {
            return 'Waited over ' + (RELAX_SECONDS / 60) + ' minutes for ' + required + '; opened to every ' + item.Channel__c + ' agent';
        }
        return null;
    }

    private static Set<String> staffedSkills() {
        Set<String> skills = new Set<String>();
        for (SLK_Agent_Presence__c presence : [
            SELECT Skills__c
            FROM SLK_Agent_Presence__c
            WHERE Agent__c != NULL AND Status__c != 'Offline'
        ]) {
            skills.addAll(SLK_RoutingSkills.parse(presence.Skills__c).keySet());
        }
        return skills;
    }

    private static List<String> workSkills(SLK_Work_Item__c item) {
        List<String> skills = SLK_RoutingSkills.names(item.Skills__c);
        if (String.isNotBlank(item.Required_Skill__c)) {
            Boolean listed = false;
            for (String skill : skills) {
                listed = listed || skill.equalsIgnoreCase(item.Required_Skill__c.trim());
            }
            if (!listed) {
                skills.add(0, item.Required_Skill__c.trim());
            }
        }
        return skills;
    }

    private static List<Map<String, Object>> snapshot(List<Candidate> candidates) {
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (Candidate candidate : candidates) {
            if (rows.size() >= CANDIDATE_SNAPSHOT) {
                break;
            }
            rows.add(new Map<String, Object>{
                'agentId' => candidate.presence.Agent__c,
                'name' => candidate.name,
                'score' => candidate.score,
                'matched' => candidate.matched,
                'missing' => candidate.missing,
                'levels' => candidate.levels,
                'eligible' => candidate.eligible,
                'reason' => candidate.reason,
                'load' => candidate.load,
                'capacity' => candidate.capacity,
                'virtual' => candidate.presence.Virtual_Agent__c == true
            });
        }
        return rows;
    }

    private static String waitingDetail(List<Candidate> candidates, SLK_Work_Item__c item) {
        List<String> parts = new List<String>();
        if (String.isNotBlank(item.Required_Skill__c)) {
            parts.add('Needs ' + item.Required_Skill__c);
        }
        if (candidates.isEmpty()) {
            parts.add('nobody is Online');
        }
        for (Candidate candidate : candidates) {
            if (parts.size() >= 4) {
                break;
            }
            parts.add(candidate.name + ': ' + candidate.reason);
        }
        return String.join(parts, ' · ');
    }

    private static String offerDetail(Candidate best) {
        List<String> parts = new List<String>{ 'Match score ' + best.score };
        if (!best.matched.isEmpty()) {
            parts.add('has ' + String.join(best.matched, ', '));
        }
        if (!best.missing.isEmpty()) {
            parts.add('missing ' + String.join(best.missing, ', '));
        }
        parts.add('load ' + best.load + '/' + best.capacity);
        return String.join(parts, ' · ');
    }

    private static void logAgent(SLK_Work_Item__c item, String type, String title, String detail) {
        Map<String, Object> entry = SLK_RoutingLog.event(type, title, detail);
        entry.put('agentId', item.Agent__c);
        entry.put('agentName', item.Agent__r?.Name);
        SLK_RoutingLog.add(item, entry);
    }

    private class Candidate {
        SLK_Agent_Presence__c presence;
        String name;
        Integer score = 0;
        Integer load = 0;
        Integer capacity = 0;
        Datetime since;
        Boolean eligible = false;
        String reason;
        List<String> matched = new List<String>();
        List<String> missing = new List<String>();
        Map<String, Integer> levels = new Map<String, Integer>();

        Boolean beats(Candidate other) {
            if (score != other.score) {
                return score > other.score;
            }
            return since < other.since;
        }
    }

    private class BestFirst implements System.Comparator<Candidate> {
        public Integer compare(Candidate a, Candidate b) {
            if (a.eligible != b.eligible) {
                return a.eligible ? -1 : 1;
            }
            return b.score - a.score;
        }
    }

    public static Boolean hasSkills(SLK_Agent_Presence__c presence, SLK_Work_Item__c item) {
        Map<String, Integer> levels = SLK_RoutingSkills.parse(presence.Skills__c);
        if (!levels.containsKey(item.Channel__c.toLowerCase())) {
            return false;
        }
        return String.isBlank(item.Required_Skill__c) || levels.containsKey(item.Required_Skill__c.trim().toLowerCase());
    }

    private static Boolean declined(SLK_Work_Item__c item, Id agentId) {
        return String.isNotBlank(item.Declined_By__c) && item.Declined_By__c.contains(String.valueOf(agentId).left(15));
    }

    private static void requeue(SLK_Work_Item__c item, Id agentId) {
        if (agentId != null) {
            String marker = String.valueOf(agentId).left(15);
            String current = item.Declined_By__c == null ? '' : item.Declined_By__c;
            if (!current.contains(marker)) {
                current = (current + ';' + marker).removeStart(';');
            }
            item.Declined_By__c = current.length() > 255 ? current.right(255) : current;
        }
        item.Status__c = 'Queued';
        item.Agent__c = null;
        item.Offered_At__c = null;
    }

    public static Integer weight(String channel) {
        return channel == 'Voice' ? 3 : 1;
    }

    private static Integer usedOf(Map<Id, Integer> used, Id agentId) {
        return used.containsKey(agentId) ? used.get(agentId) : 0;
    }

    private static Set<Id> virtualAgentIds() {
        Set<Id> ids = new Set<Id>();
        for (SLK_Agent_Presence__c presence : [
            SELECT Agent__c
            FROM SLK_Agent_Presence__c
            WHERE Virtual_Agent__c = TRUE AND Agent__c != NULL
        ]) {
            ids.add(presence.Agent__c);
        }
        return ids;
    }

    // ---------------------------------------------------------------- work lifecycle

    public static Map<String, Object> accept(Id workId, Id userId) {
        SLK_Work_Item__c work = loadWork(workId);
        if (work.Status__c != 'Offered' || work.Agent__c != userId) {
            throw new RoutingException('This offer is no longer available.');
        }
        work.Status__c = 'Accepted';
        work.Accepted_At__c = Datetime.now();
        Map<String, Object> offer = SLK_RoutingLog.lastOfType(work, 'offered');
        Datetime offeredAt = work.Offered_At__c;
        logAgent(
            work,
            'accepted',
            'Accepted by ' + work.Agent__r?.Name,
            offeredAt == null ? null : 'Answered in ' + Math.max(1, (Datetime.now().getTime() - offeredAt.getTime()) / 1000) + 's' +
                (offer?.get('score') == null ? '' : ' · match score ' + offer.get('score'))
        );
        update work;

        List<SObject> updates = new List<SObject>();
        if (work.Case__c != null) {
            Case target = new Case(Id = work.Case__c, OwnerId = userId);
            if (work.Case__r.Status == 'New') {
                target.Status = 'Working';
            }
            updates.add(target);
        }
        if (String.isNotBlank(work.Source_Record_Id__c) && work.Source_Record_Id__c != work.Case__c) {
            SObject source = ((Id) work.Source_Record_Id__c).getSObjectType().newSObject((Id) work.Source_Record_Id__c);
            source.put('OwnerId', userId);
            updates.add(source);
        }
        Database.update(updates, false);

        if (work.Channel__c != 'Case') {
            String connected = work.Channel__c == 'Voice' ? 'Call connected.' : 'Agent joined the conversation.';
            addMessage(work.Id, 'System', connected, null);
        }
        return workDto(loadWork(workId));
    }

    public static Map<String, Object> decline(Id workId, Id userId) {
        SLK_Work_Item__c work = loadWork(workId);
        if (work.Status__c != 'Offered' || work.Agent__c != userId) {
            throw new RoutingException('This offer is no longer available.');
        }
        logAgent(work, 'declined', 'Declined by ' + work.Agent__r?.Name, 'Back to the queue for the next best match');
        requeue(work, userId);
        update work;
        routeTick();
        return workDto(loadWork(workId));
    }

    public static Map<String, Object> setHold(Id workId, Boolean onHold) {
        SLK_Work_Item__c work = loadWork(workId);
        work.On_Hold__c = onHold == true;
        update work;
        addMessage(work.Id, 'System', onHold == true ? 'Customer placed on hold.' : 'Customer resumed from hold.', null);
        return workDto(loadWork(workId));
    }

    public static Map<String, Object> transfer(Id workId, Id userId, String queue, String skill) {
        if (String.isBlank(queue)) {
            throw new RoutingException('Choose a queue to transfer to.');
        }
        SLK_Work_Item__c work = loadWork(workId);
        String previousAgent = work.Agent__r?.Name;
        requeue(work, userId);
        work.Queue__c = queue.left(80);
        work.On_Hold__c = false;
        SLK_RoutingAIService.tagTransfer(work, skill, work.Queue__c);
        Map<String, Object> entry = SLK_RoutingLog.event(
            'transferred',
            'Transferred to ' + work.Queue__c,
            (previousAgent == null ? '' : 'By ' + previousAgent) + (String.isBlank(skill) ? '' : (previousAgent == null ? '' : ' · ') + 'requires ' + skill)
        );
        entry.put('actor', previousAgent);
        SLK_RoutingLog.add(work, entry);
        update work;
        addMessage(work.Id, 'System', 'Transferred to ' + work.Queue__c + '.', null);
        routeTick();
        return workDto(loadWork(workId));
    }

    public static Map<String, Object> reassign(Id workId, Id targetUserId) {
        SLK_Work_Item__c work = loadWork(workId);
        if (work.Status__c == 'Closed') {
            throw new RoutingException('Closed work cannot be reassigned.');
        }
        SLK_Agent_Presence__c target = ensurePresence(targetUserId);
        Map<String, Object> entry = SLK_RoutingLog.event(
            'reassigned',
            'Reassigned to ' + (target.Agent__r?.Name == null ? target.Name : target.Agent__r.Name),
            'A supervisor sent it directly' + (work.Agent__r?.Name == null ? '' : ' from ' + work.Agent__r.Name)
        );
        entry.put('agentId', targetUserId);
        entry.put('agentName', target.Agent__r?.Name == null ? target.Name : target.Agent__r.Name);
        SLK_RoutingLog.add(work, entry);
        work.Status__c = 'Offered';
        work.Agent__c = targetUserId;
        work.Offered_At__c = Datetime.now();
        work.Accepted_At__c = null;
        update work;
        return workDto(loadWork(workId));
    }

    public static Map<String, Object> close(Id workId, String summary, String caseStatus, String sentiment) {
        SLK_Work_Item__c work = loadWork(workId);
        work.Status__c = 'Closed';
        work.Closed_At__c = Datetime.now();
        work.On_Hold__c = false;
        if (String.isNotBlank(summary)) {
            work.Summary__c = summary.left(32000);
        }
        if (sentiment != null && new Set<String>{ 'Positive', 'Neutral', 'Negative' }.contains(sentiment)) {
            work.Sentiment__c = sentiment;
        }
        logAgent(work, 'closed', 'Closed by ' + work.Agent__r?.Name, caseStatus == null ? null : 'Case set to ' + caseStatus);
        update work;

        if (work.Case__c != null) {
            if (String.isNotBlank(summary)) {
                insert new CaseComment(
                    ParentId = work.Case__c,
                    CommentBody = (work.Channel__c + ' wrap-up (' + work.Name + ')\n' + summary).left(3900),
                    IsPublished = false
                );
            }
            if (caseStatus != null && CASE_STATUSES.contains(caseStatus)) {
                update new Case(Id = work.Case__c, Status = caseStatus);
            }
        }
        if (work.Channel__c != 'Case') {
            addMessage(work.Id, 'System', work.Channel__c == 'Voice' ? 'Call ended.' : 'Conversation ended.', null);
        }
        writeBackSource(work, summary);
        return workDto(loadWork(workId));
    }

    private static void writeBackSource(SLK_Work_Item__c work, String summary) {
        if (String.isBlank(work.Source_Record_Id__c) || work.Source_Record_Id__c == work.Case__c) {
            return;
        }
        Id sourceId = (Id) work.Source_Record_Id__c;
        SObject source = sourceId.getSObjectType().newSObject(sourceId);
        Map<String, Schema.SObjectField> fields = sourceId.getSObjectType().getDescribe().fields.getMap();
        String rating = work.Sentiment__c == null ? 'Neutral' : work.Sentiment__c;
        putIfUpdateable(source, fields, 'Sentiment_Rating__c', rating);
        putIfUpdateable(source, fields, 'SentimentRating__c', rating);
        if (String.isNotBlank(summary)) {
            putIfUpdateable(source, fields, 'Description', summary.left(32000));
            putIfUpdateable(source, fields, 'ChatSentiment__c', summary.left(32000));
            putIfUpdateable(source, fields, 'Call_Sentiment__c', summary.left(32000));
        }
        putIfUpdateable(source, fields, 'CallResolution', 'Resolved');
        Database.update(source, false);
    }

    private static void putIfUpdateable(SObject record, Map<String, Schema.SObjectField> fields, String name, Object value) {
        Schema.SObjectField field = fields.get(name.toLowerCase());
        if (field != null && field.getDescribe().isUpdateable()) {
            record.put(name, value);
        }
    }

    public static SLK_Conversation_Message__c addMessage(Id workId, String sender, String body, String sentiment) {
        SLK_Conversation_Message__c message = new SLK_Conversation_Message__c(
            Work_Item__c = workId,
            Sender__c = sender,
            Body__c = body == null ? '' : body.left(32000),
            Sent_At__c = Datetime.now(),
            Sentiment__c = sentiment
        );
        insert message;
        return message;
    }

    public static List<Map<String, Object>> messages(Id workId) {
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (SLK_Conversation_Message__c message : [
            SELECT Id, Sender__c, Body__c, Sent_At__c, Sentiment__c
            FROM SLK_Conversation_Message__c
            WHERE Work_Item__c = :workId
            ORDER BY Sent_At__c ASC, Name ASC
            LIMIT 500
        ]) {
            rows.add(
                new Map<String, Object>{
                    'id' => message.Id,
                    'sender' => message.Sender__c,
                    'body' => message.Body__c,
                    'sentAt' => message.Sent_At__c,
                    'sentiment' => message.Sentiment__c
                }
            );
        }
        return rows;
    }

    // ---------------------------------------------------------------- read models

    public static Map<String, Object> omniState(Id userId) {
        SLK_Agent_Presence__c presence = ensurePresence(userId);
        List<SLK_Work_Item__c> mine = queryRouting(
            'WHERE Agent__c = :userId AND Status__c IN :open ORDER BY CreatedDate ASC',
            new Map<String, Object>{ 'userId' => userId, 'open' => OPEN_WORK }
        );
        List<Map<String, Object>> offers = new List<Map<String, Object>>();
        List<Map<String, Object>> active = new List<Map<String, Object>>();
        Integer used = 0;
        for (SLK_Work_Item__c item : mine) {
            used += weight(item.Channel__c);
            if (item.Status__c == 'Offered') {
                Map<String, Object> offer = workDto(item);
                offer.put('routing', SLK_RoutingAIService.offerContext(item));
                offers.add(offer);
            } else {
                active.add(workDto(item));
            }
        }
        return new Map<String, Object>{
            'presence' => presenceDto(presence, used, new List<SLK_Work_Item__c>()),
            'offers' => offers,
            'active' => active,
            'offerTimeoutSeconds' => OFFER_TIMEOUT_SECONDS,
            'queued' => [SELECT COUNT() FROM SLK_Work_Item__c WHERE Status__c = 'Queued'],
            'analyzing' => [SELECT COUNT() FROM SLK_Work_Item__c WHERE Status__c = 'Analyzing'],
            'serverTime' => Datetime.now()
        };
    }

    public static Map<String, Object> home(Id userId) {
        Datetime startOfDay = Datetime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        List<SLK_Work_Item__c> closedToday = queryWork(
            'WHERE Agent__c = :userId AND Status__c = \'Closed\' AND Closed_At__c >= :since ORDER BY Closed_At__c DESC LIMIT 200',
            new Map<String, Object>{ 'userId' => userId, 'since' => startOfDay }
        );
        Long handleTotal = 0;
        Integer handled = 0;
        Map<String, Integer> sentiment = new Map<String, Integer>{ 'Positive' => 0, 'Neutral' => 0, 'Negative' => 0 };
        for (SLK_Work_Item__c item : closedToday) {
            if (item.Accepted_At__c != null && item.Closed_At__c != null) {
                handleTotal += (item.Closed_At__c.getTime() - item.Accepted_At__c.getTime()) / 1000;
                handled++;
            }
            String key = item.Sentiment__c == null ? 'Neutral' : item.Sentiment__c;
            sentiment.put(key, sentiment.get(key) + 1);
        }
        List<Map<String, Object>> recent = new List<Map<String, Object>>();
        for (Integer i = 0; i < Math.min(6, closedToday.size()); i++) {
            recent.add(workDto(closedToday[i]));
        }
        return new Map<String, Object>{
            'closedToday' => closedToday.size(),
            'avgHandleSeconds' => handled == 0 ? 0 : (Integer) (handleTotal / handled),
            'sentiment' => sentiment,
            'openCases' => [SELECT COUNT() FROM Case WHERE OwnerId = :userId AND IsClosed = FALSE],
            'queues' => queueStats(queryWork('WHERE Status__c = \'Queued\' LIMIT 500', new Map<String, Object>())),
            'recent' => recent
        };
    }

    public static Map<String, Object> supervisor() {
        Datetime now = Datetime.now();
        Datetime startOfDay = Datetime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
        List<SLK_Agent_Presence__c> presences = queryPresence('WHERE Agent__c != null ORDER BY Name', new Map<String, Object>());
        List<SLK_Work_Item__c> open = queryWork(
            'WHERE Status__c IN :open ORDER BY CreatedDate ASC LIMIT 500',
            new Map<String, Object>{ 'open' => OPEN_WORK }
        );
        List<SLK_Work_Item__c> queued = queryWork('WHERE Status__c = \'Queued\' ORDER BY CreatedDate ASC LIMIT 500', new Map<String, Object>());
        List<SLK_Work_Item__c> closed = queryWork(
            'WHERE Status__c = \'Closed\' AND Closed_At__c >= :since LIMIT 1000',
            new Map<String, Object>{ 'since' => startOfDay }
        );

        Map<Id, List<SLK_Work_Item__c>> workByAgent = new Map<Id, List<SLK_Work_Item__c>>();
        for (SLK_Work_Item__c item : open) {
            if (item.Agent__c == null) {
                continue;
            }
            if (!workByAgent.containsKey(item.Agent__c)) {
                workByAgent.put(item.Agent__c, new List<SLK_Work_Item__c>());
            }
            workByAgent.get(item.Agent__c).add(item);
        }
        Map<Id, Integer> closedByAgent = new Map<Id, Integer>();
        Long handleTotal = 0;
        Integer handled = 0;
        for (SLK_Work_Item__c item : closed) {
            if (item.Agent__c != null) {
                closedByAgent.put(item.Agent__c, usedOf(closedByAgent, item.Agent__c) + 1);
            }
            if (item.Accepted_At__c != null && item.Closed_At__c != null) {
                handleTotal += (item.Closed_At__c.getTime() - item.Accepted_At__c.getTime()) / 1000;
                handled++;
            }
        }

        List<Map<String, Object>> agents = new List<Map<String, Object>>();
        for (SLK_Agent_Presence__c presence : presences) {
            List<SLK_Work_Item__c> agentWork = workByAgent.containsKey(presence.Agent__c)
                ? workByAgent.get(presence.Agent__c)
                : new List<SLK_Work_Item__c>();
            Integer used = 0;
            for (SLK_Work_Item__c item : agentWork) {
                used += weight(item.Channel__c);
            }
            Map<String, Object> dto = presenceDto(presence, used, agentWork);
            dto.put('closedToday', usedOf(closedByAgent, presence.Agent__c));
            agents.add(dto);
        }

        Long waitTotal = 0;
        for (SLK_Work_Item__c item : queued) {
            waitTotal += (now.getTime() - item.CreatedDate.getTime()) / 1000;
        }
        List<Map<String, Object>> waiting = new List<Map<String, Object>>();
        for (Integer i = 0; i < Math.min(25, queued.size()); i++) {
            waiting.add(workDto(queued[i]));
        }

        return new Map<String, Object>{
            'waiting' => waiting,
            'kpis' => new Map<String, Object>{
                'queued' => queued.size(),
                'active' => open.size(),
                'closedToday' => closed.size(),
                'agentsOnline' => countStatus(presences, 'Online'),
                'agentsTotal' => presences.size(),
                'avgWaitSeconds' => queued.isEmpty() ? 0 : (Integer) (waitTotal / queued.size()),
                'avgHandleSeconds' => handled == 0 ? 0 : (Integer) (handleTotal / handled)
            },
            'agents' => agents,
            'queues' => queueStats(queued),
            'alerts' => alerts(open, queued, presences, now),
            'history' => agentWorkHistory(),
            'serverTime' => now
        };
    }

    public static List<Map<String, Object>> caseEmails(Id caseId) {
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (EmailMessage email : [
            SELECT Id, Subject, TextBody, FromAddress, FromName, ToAddress, Incoming, MessageDate
            FROM EmailMessage
            WHERE ParentId = :caseId
            ORDER BY MessageDate DESC
            LIMIT 25
        ]) {
            rows.add(
                new Map<String, Object>{
                    'id' => email.Id,
                    'subject' => email.Subject,
                    'body' => SLK_AIService.truncate(email.TextBody, 4000),
                    'fromAddress' => email.FromAddress,
                    'fromName' => email.FromName,
                    'toAddress' => email.ToAddress,
                    'incoming' => email.Incoming,
                    'sentAt' => email.MessageDate
                }
            );
        }
        return rows;
    }

    private static Integer countStatus(List<SLK_Agent_Presence__c> presences, String status) {
        Integer count = 0;
        for (SLK_Agent_Presence__c presence : presences) {
            if (presence.Status__c == status) {
                count++;
            }
        }
        return count;
    }

    private static List<Map<String, Object>> queueStats(List<SLK_Work_Item__c> queued) {
        Datetime now = Datetime.now();
        Map<String, Map<String, Object>> byQueue = new Map<String, Map<String, Object>>();
        for (SLK_Work_Item__c item : queued) {
            String name = String.isBlank(item.Queue__c) ? 'General Support' : item.Queue__c;
            if (!byQueue.containsKey(name)) {
                byQueue.put(
                    name,
                    new Map<String, Object>{
                        'name' => name,
                        'count' => 0,
                        'oldestWaitSeconds' => 0,
                        'byChannel' => new Map<String, Integer>{ 'Case' => 0, 'Voice' => 0, 'Messaging' => 0 }
                    }
                );
            }
            Map<String, Object> stats = byQueue.get(name);
            stats.put('count', (Integer) stats.get('count') + 1);
            Integer wait = (Integer) ((now.getTime() - item.CreatedDate.getTime()) / 1000);
            stats.put('oldestWaitSeconds', Math.max((Integer) stats.get('oldestWaitSeconds'), wait));
            Map<String, Integer> byChannel = (Map<String, Integer>) stats.get('byChannel');
            byChannel.put(item.Channel__c, byChannel.get(item.Channel__c) + 1);
        }
        return byQueue.values();
    }

    private static List<Map<String, Object>> alerts(
        List<SLK_Work_Item__c> open,
        List<SLK_Work_Item__c> queued,
        List<SLK_Agent_Presence__c> presences,
        Datetime now
    ) {
        List<Map<String, Object>> results = new List<Map<String, Object>>();
        List<SLK_Work_Item__c> all = new List<SLK_Work_Item__c>(open);
        all.addAll(queued);
        for (SLK_Work_Item__c item : all) {
            if (item.SLA_Due__c != null && item.SLA_Due__c < now.addMinutes(SLA_RISK_MINUTES)) {
                Boolean breached = item.SLA_Due__c < now;
                results.add(alert(breached ? 'critical' : 'warning', breached ? 'SLA breached' : 'SLA at risk', item));
            }
            if (item.Sentiment__c == 'Negative' && item.Status__c == 'Accepted') {
                results.add(alert('warning', 'Negative customer sentiment', item));
            }
        }
        for (SLK_Work_Item__c item : queued) {
            if (item.CreatedDate < now.addMinutes(-3)) {
                results.add(alert('info', 'Waiting over 3 minutes', item));
            }
        }
        for (SLK_Agent_Presence__c presence : presences) {
            if (presence.Status__c == 'Break' && presence.Status_Changed_At__c != null && presence.Status_Changed_At__c < now.addMinutes(-15)) {
                results.add(
                    new Map<String, Object>{
                        'severity' => 'info',
                        'title' => 'Extended break',
                        'detail' => presence.Name + ' has been on break for over 15 minutes.',
                        'agentId' => presence.Agent__c
                    }
                );
            }
        }
        return results;
    }

    private static Map<String, Object> alert(String severity, String title, SLK_Work_Item__c item) {
        return new Map<String, Object>{
            'severity' => severity,
            'title' => title,
            'detail' => item.Channel__c + ' · ' + item.Subject__c + (item.Agent__r?.Name == null ? ' · unassigned' : ' · ' + item.Agent__r.Name),
            'workId' => item.Id,
            'agentId' => item.Agent__c
        };
    }

    private static Map<String, Object> agentWorkHistory() {
        Map<String, Integer> byChannel = new Map<String, Integer>();
        Integer total = 0;
        try {
            for (AggregateResult row : [
                SELECT ServiceChannel.MasterLabel channel, COUNT(Id) total
                FROM AgentWork
                WHERE CreatedDate = LAST_N_DAYS:30
                GROUP BY ServiceChannel.MasterLabel
            ]) {
                Integer count = (Integer) row.get('total');
                byChannel.put(String.valueOf(row.get('channel')), count);
                total += count;
            }
        } catch (Exception e) {
            return new Map<String, Object>{ 'total' => 0, 'byChannel' => byChannel };
        }
        return new Map<String, Object>{ 'total' => total, 'byChannel' => byChannel };
    }

    // ---------------------------------------------------------------- DTOs

    public static Map<String, Object> workDto(SLK_Work_Item__c item) {
        return new Map<String, Object>{
            'id' => item.Id,
            'name' => item.Name,
            'channel' => item.Channel__c,
            'status' => item.Status__c,
            'subject' => item.Subject__c,
            'customerName' => item.Customer_Name__c,
            'queue' => item.Queue__c,
            'priority' => item.Priority__c,
            'agentId' => item.Agent__c,
            'agentName' => item.Agent__r?.Name,
            'caseId' => item.Case__c,
            'caseNumber' => item.Case__r?.CaseNumber,
            'sourceRecordId' => item.Source_Record_Id__c,
            'createdAt' => item.CreatedDate,
            'offeredAt' => item.Offered_At__c,
            'acceptedAt' => item.Accepted_At__c,
            'closedAt' => item.Closed_At__c,
            'sentiment' => item.Sentiment__c,
            'slaDue' => item.SLA_Due__c,
            'simulated' => item.Simulated__c,
            'onHold' => item.On_Hold__c,
            'summary' => item.Summary__c,
            'requiredSkill' => item.Required_Skill__c,
            'skills' => SLK_RoutingSkills.names(item.Skills__c)
        };
    }

    public static Map<String, Object> presenceDto(SLK_Agent_Presence__c presence, Integer used, List<SLK_Work_Item__c> work) {
        List<Map<String, Object>> workDtos = new List<Map<String, Object>>();
        for (SLK_Work_Item__c item : work) {
            workDtos.add(workDto(item));
        }
        return new Map<String, Object>{
            'id' => presence.Id,
            'userId' => presence.Agent__c,
            'name' => presence.Agent__r?.Name == null ? presence.Name : presence.Agent__r.Name,
            'photoUrl' => presence.Agent__r?.SmallPhotoUrl,
            'status' => presence.Status__c == null ? 'Offline' : presence.Status__c,
            'capacity' => presence.Capacity__c == null ? 4 : presence.Capacity__c.intValue(),
            'usedCapacity' => used,
            'skills' => skillList(presence.Skills__c),
            'skillLevels' => skillLevels(presence.Skills__c),
            'statusChangedAt' => presence.Status_Changed_At__c,
            'whisper' => presence.Whisper__c,
            'whisperAt' => presence.Whisper_At__c,
            'virtual' => presence.Virtual_Agent__c,
            'work' => workDtos
        };
    }

    private static List<String> skillList(String raw) {
        return SLK_RoutingSkills.names(String.isBlank(raw) ? DEFAULT_SKILLS : raw);
    }

    private static Map<String, Integer> skillLevels(String raw) {
        Map<String, Integer> levels = new Map<String, Integer>();
        Map<String, Integer> parsed = SLK_RoutingSkills.parse(raw);
        for (String name : skillList(raw)) {
            if (!SLK_RoutingSkills.isChannel(name)) {
                levels.put(name, parsed.get(name.toLowerCase()));
            }
        }
        return levels;
    }
}