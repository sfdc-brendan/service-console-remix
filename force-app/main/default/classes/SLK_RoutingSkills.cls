/**
 * Skill vocabulary for routing. Agent skills live on SLK_Agent_Presence__c.Skills__c as
 * "Channel;Skill:Level" (level 1-10, default 5). The catalog the AI may tag from merges a built-in
 * service taxonomy, the org's Omni-Channel Skill records, and any skill an agent already lists.
 */
public without sharing class SLK_RoutingSkills {
    public static final Integer DEFAULT_LEVEL = 5;
    private static final List<String> OMNI_EXCLUDED_PREFIXES = new List<String>{ 'SDO_SFS_', 'SDO_Scheduler_', 'Turbine_', 'SDO_Slack_' };

    /** Built-in skills with the phrases that suggest them when the model is unavailable. */
    public static final Map<String, List<String>> TAXONOMY = new Map<String, List<String>>{
        'Technical Support' => new List<String>{
            'error', 'bug', 'crash', 'fails', 'failing', 'failed', 'broken', 'outage', 'not working', 'timeout', 'login', 'install',
            'firmware', 'api', 'integration', 'cluster', 'container', 'kubernetes', 'driver'
        },
        'Billing' => new List<String>{
            'invoice', 'charge', 'charged', 'refund', 'payment', 'billing', 'credit card', 'overcharge', 'receipt', 'subscription', 'billed'
        },
        'Security & Compliance' => new List<String>{
            'security', 'soc 2', 'soc2', 'compliance', 'gdpr', 'hipaa', 'breach', 'vulnerability', 'sso', 'mfa', 'audit', 'questionnaire',
            'encryption', 'phishing', 'pen test'
        },
        'Networking' => new List<String>{ 'network', 'vpn', 'dns', 'latency', 'firewall', 'bandwidth', 'packet', 'connectivity', 'wifi', 'router' },
        'Hardware' => new List<String>{ 'hardware', 'device', 'gpu', 'server', 'disk', 'replacement', 'rma', 'overheating', 'node', 'power supply' },
        'Account Management' => new List<String>{
            'renewal', 'contract', 'seats', 'license', 'licenses', 'upgrade', 'downgrade', 'plan', 'add users', 'pricing', 'quote'
        },
        'Onboarding' => new List<String>{ 'onboarding', 'setup', 'set up', 'getting started', 'training', 'configure', 'implementation', 'migrate' },
        'Escalation Handling' => new List<String>{ 'escalate', 'escalation', 'executive', 'legal', 'complaint', 'unacceptable', 'cancel my', 'lawyer' },
        'French' => new List<String>{ 'bonjour', 'merci', 'français', 'francais' },
        'Spanish' => new List<String>{ 'hola', 'gracias', 'español', 'espanol' }
    };

    /** Lower-case skill name to level. Channel names are included so they can gate routing too. */
    public static Map<String, Integer> parse(String raw) {
        Map<String, Integer> levels = new Map<String, Integer>();
        for (String entry : (String.isBlank(raw) ? SLK_RoutingService.DEFAULT_SKILLS : raw).split(';')) {
            String name = entry.substringBefore(':').trim();
            if (String.isBlank(name)) {
                continue;
            }
            Integer level = DEFAULT_LEVEL;
            if (entry.contains(':')) {
                try {
                    level = Math.max(1, Math.min(10, Integer.valueOf(entry.substringAfter(':').trim())));
                } catch (TypeException e) {
                    level = DEFAULT_LEVEL;
                }
            }
            levels.put(name.toLowerCase(), level);
        }
        return levels;
    }

    /** Display names in the order an agent lists them, without levels. */
    public static List<String> names(String raw) {
        List<String> values = new List<String>();
        if (String.isBlank(raw)) {
            return values;
        }
        for (String entry : raw.split(';')) {
            String name = entry.substringBefore(':').trim();
            if (String.isNotBlank(name)) {
                values.add(name);
            }
        }
        return values;
    }

    public static Boolean isChannel(String name) {
        return name != null && SLK_RoutingService.CHANNELS.contains(name.trim());
    }

    /** Every skill the AI may tag, with where it comes from and how many agents are staffed with it. */
    public static List<Map<String, Object>> catalog() {
        Map<String, Map<String, Object>> byKey = new Map<String, Map<String, Object>>();
        for (String name : TAXONOMY.keySet()) {
            byKey.put(name.toLowerCase(), entry(name, 'console'));
        }
        for (Skill row : [SELECT DeveloperName, MasterLabel FROM Skill ORDER BY MasterLabel LIMIT 200]) {
            if (excluded(row.DeveloperName) || byKey.containsKey(row.MasterLabel.toLowerCase())) {
                continue;
            }
            byKey.put(row.MasterLabel.toLowerCase(), entry(row.MasterLabel, 'omni'));
        }
        for (SLK_Agent_Presence__c presence : [SELECT Skills__c, Status__c FROM SLK_Agent_Presence__c WHERE Agent__c != NULL]) {
            for (String name : names(presence.Skills__c)) {
                if (isChannel(name)) {
                    continue;
                }
                String key = name.toLowerCase();
                if (!byKey.containsKey(key)) {
                    byKey.put(key, entry(name, 'agent'));
                }
                Map<String, Object> skill = byKey.get(key);
                skill.put('agents', (Integer) skill.get('agents') + 1);
                if (presence.Status__c == 'Online') {
                    skill.put('online', (Integer) skill.get('online') + 1);
                }
            }
        }
        return byKey.values();
    }

    public static List<String> catalogNames() {
        List<String> values = new List<String>();
        for (Map<String, Object> skill : catalog()) {
            values.add((String) skill.get('name'));
        }
        return values;
    }

    /** Map of lower-case name to the catalog's canonical spelling. */
    public static Map<String, String> canonicalMap(List<String> catalogNames) {
        Map<String, String> canonical = new Map<String, String>();
        for (String name : catalogNames) {
            canonical.put(name.toLowerCase(), name);
        }
        return canonical;
    }

    /** Taxonomy skills whose phrases appear in the text, strongest first, with the phrases that matched. */
    public static List<Map<String, Object>> keywordMatches(String text) {
        String haystack = ' ' + (text == null ? '' : text.toLowerCase()) + ' ';
        List<Map<String, Object>> matches = new List<Map<String, Object>>();
        for (String name : TAXONOMY.keySet()) {
            List<String> hits = new List<String>();
            for (String phrase : TAXONOMY.get(name)) {
                if (haystack.contains(phrase)) {
                    hits.add(phrase);
                }
            }
            if (!hits.isEmpty()) {
                matches.add(new Map<String, Object>{ 'name' => name, 'hits' => hits });
            }
        }
        matches.sort(new MostHits());
        return matches;
    }

    private static Map<String, Object> entry(String name, String source) {
        return new Map<String, Object>{ 'name' => name, 'source' => source, 'agents' => 0, 'online' => 0 };
    }

    private static Boolean excluded(String developerName) {
        for (String prefix : OMNI_EXCLUDED_PREFIXES) {
            if (developerName.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private class MostHits implements System.Comparator<Map<String, Object>> {
        public Integer compare(Map<String, Object> a, Map<String, Object> b) {
            return ((List<String>) b.get('hits')).size() - ((List<String>) a.get('hits')).size();
        }
    }
}