/**
 * Append-only routing event trail stored as JSON on SLK_Work_Item__c.Routing_Log__c, so the console
 * can replay exactly how a piece of work was analyzed, matched, offered, and accepted.
 */
public class SLK_RoutingLog {
    public static final Integer MAX_EVENTS = 30;
    private static final Integer MAX_LENGTH = 32000;

    public static List<Object> read(String raw) {
        if (String.isBlank(raw)) {
            return new List<Object>();
        }
        try {
            Object parsed = JSON.deserializeUntyped(raw);
            return parsed instanceof List<Object> ? (List<Object>) parsed : new List<Object>();
        } catch (JSONException e) {
            return new List<Object>();
        }
    }

    public static Map<String, Object> event(String type, String title, String detail) {
        return new Map<String, Object>{ 'type' => type, 'title' => title, 'detail' => detail, 'at' => Datetime.now() };
    }

    /** Appends, keeping the first event (how the work arrived) when the trail has to be trimmed. */
    public static void add(SLK_Work_Item__c item, Map<String, Object> entry) {
        List<Object> events = read(item.Routing_Log__c);
        events.add(entry);
        while (events.size() > MAX_EVENTS) {
            events.remove(1);
        }
        String raw = JSON.serialize(events);
        while (raw.length() > MAX_LENGTH && events.size() > 2) {
            events.remove(1);
            raw = JSON.serialize(events);
        }
        item.Routing_Log__c = raw;
    }

    public static String lastType(SLK_Work_Item__c item) {
        List<Object> events = read(item.Routing_Log__c);
        return events.isEmpty() ? null : (String) ((Map<String, Object>) events[events.size() - 1]).get('type');
    }

    public static Map<String, Object> lastOfType(SLK_Work_Item__c item, String type) {
        List<Object> events = read(item.Routing_Log__c);
        for (Integer i = events.size() - 1; i >= 0; i--) {
            Map<String, Object> entry = (Map<String, Object>) events[i];
            if (entry.get('type') == type) {
                return entry;
            }
        }
        return null;
    }
}