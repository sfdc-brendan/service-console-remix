/**
 * Org-wide Service Console page layouts. Everyone reads them; only holders of the
 * SLK_Console_Layout_Admin custom permission can save or reset.
 */
public with sharing class SLK_LayoutService {
    public static final String ADMIN_PERMISSION = 'SLK_Console_Layout_Admin';
    public static final Set<String> PAGES = new Set<String>{ 'home', 'case', 'voice', 'messaging', 'supervisor', 'contact', 'account' };
    private static final Integer MAX_CONFIG_LENGTH = 100000;

    public class LayoutException extends Exception {
    }

    @TestVisible
    private static Boolean adminOverride;

    public static Boolean canEdit() {
        return adminOverride != null ? adminOverride : FeatureManagement.checkPermission(ADMIN_PERMISSION);
    }

    public static Map<String, Object> layouts() {
        Map<String, Object> byPage = new Map<String, Object>();
        for (SLK_Console_Layout__c row : [
            SELECT Page_Key__c, Config__c, LastModifiedDate, LastModifiedBy.Name
            FROM SLK_Console_Layout__c
            WHERE Page_Key__c IN :PAGES
        ]) {
            Object config = parse(row.Config__c);
            if (config != null) {
                byPage.put(row.Page_Key__c, new Map<String, Object>{
                    'config' => config,
                    'updatedAt' => row.LastModifiedDate,
                    'updatedBy' => row.LastModifiedBy?.Name
                });
            }
        }
        return new Map<String, Object>{ 'canEdit' => canEdit(), 'layouts' => byPage };
    }

    public static Map<String, Object> save(String pageKey, Object config) {
        String key = requireEditable(pageKey);
        if (!(config instanceof Map<String, Object>)) {
            throw new LayoutException('Layout config must be a JSON object.');
        }
        String json = System.JSON.serialize(config);
        if (json.length() > MAX_CONFIG_LENGTH) {
            throw new LayoutException('Layout config is too large.');
        }
        SLK_Console_Layout__c row = new SLK_Console_Layout__c(Name = 'Console layout · ' + key, Page_Key__c = key, Config__c = json);
        upsert row Page_Key__c;
        return new Map<String, Object>{ 'ok' => true, 'page' => key, 'updatedAt' => Datetime.now(), 'updatedBy' => UserInfo.getName() };
    }

    public static Map<String, Object> reset(String pageKey) {
        String key = requireEditable(pageKey);
        delete [SELECT Id FROM SLK_Console_Layout__c WHERE Page_Key__c = :key];
        return new Map<String, Object>{ 'ok' => true, 'page' => key };
    }

    private static String requireEditable(String pageKey) {
        if (!canEdit()) {
            throw new LayoutException('You need the Service Console Layout Admin permission to change layouts.');
        }
        String key = pageKey == null ? '' : pageKey.toLowerCase();
        if (!PAGES.contains(key)) {
            throw new LayoutException('Unknown console page: ' + pageKey);
        }
        return key;
    }

    private static Object parse(String raw) {
        if (String.isBlank(raw)) {
            return null;
        }
        try {
            return System.JSON.deserializeUntyped(raw);
        } catch (System.JSONException e) {
            return null;
        }
    }
}