/**
 * Read-only knowledge coverage analytics: how many cases are backed by an attached
 * article, where the holes are, and how healthy the published library is.
 */
public with sharing class SLK_CoverageService {
    private static final String LANG = 'en_US';

    public static Map<String, Object> getDashboard() {
        Integer totalCases = [SELECT COUNT() FROM Case];
        Integer coveredCases = [SELECT COUNT() FROM Case WHERE Id IN (SELECT CaseId FROM CaseArticle)];
        Integer openUncovered = [
            SELECT COUNT()
            FROM Case
            WHERE IsClosed = FALSE AND Id NOT IN (SELECT CaseId FROM CaseArticle)
        ];
        Integer published = [SELECT COUNT() FROM Knowledge__kav WHERE PublishStatus = 'Online' AND Language = :LANG];
        Integer drafts = [SELECT COUNT() FROM Knowledge__kav WHERE PublishStatus = 'Draft' AND Language = :LANG];
        Integer published30 = [
            SELECT COUNT()
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = :LANG AND LastPublishedDate = LAST_N_DAYS:30
        ];
        Id me = UserInfo.getUserId();
        Integer pendingReviews = [SELECT COUNT() FROM SLK_Article_Review__c WHERE Status__c = 'Pending'];
        Integer myReviews = [
            SELECT COUNT()
            FROM SLK_Article_Review__c
            WHERE Status__c = 'Pending' AND Reviewer__c = :me
        ];
        Integer approvedReady = [SELECT COUNT() FROM SLK_Article_Review__c WHERE Status__c = 'Approved'];

        Map<String, Object> gapStats = new Map<String, Object>{
            'Open' => 0,
            'Drafting' => 0,
            'In Review' => 0,
            'Covered' => 0,
            'Dismissed' => 0
        };
        Decimal linkableCases = 0;
        Decimal missingCases = 0;
        for (AggregateResult row : [
            SELECT Status__c status, Gap_Kind__c kind, COUNT(Id) total, SUM(Case_Count__c) cases
            FROM SLK_Knowledge_Gap__c
            GROUP BY Status__c, Gap_Kind__c
        ]) {
            String status = (String) row.get('status');
            if (status == null) {
                continue;
            }
            Integer current = (Integer) gapStats.get(status);
            gapStats.put(status, (current == null ? 0 : current) + (Integer) row.get('total'));
            if (status == 'Open' || status == 'Drafting' || status == 'In Review') {
                Decimal cases = (Decimal) row.get('cases');
                if ((String) row.get('kind') == 'Unlinked Content') {
                    linkableCases += cases == null ? 0 : cases;
                } else {
                    missingCases += cases == null ? 0 : cases;
                }
            }
        }

        List<Map<String, Object>> topGaps = new List<Map<String, Object>>();
        for (SLK_Knowledge_Gap__c gap : [
            SELECT Id, Name, Gap_Kind__c, Priority__c, Case_Count__c, Status__c, Impact_Score__c
            FROM SLK_Knowledge_Gap__c
            WHERE Status__c IN ('Open', 'Drafting', 'In Review')
            ORDER BY Case_Count__c DESC NULLS LAST
            LIMIT 6
        ]) {
            topGaps.add(
                new Map<String, Object>{
                    'id' => gap.Id,
                    'name' => gap.Name,
                    'kind' => gap.Gap_Kind__c,
                    'priority' => gap.Priority__c,
                    'caseCount' => gap.Case_Count__c,
                    'status' => gap.Status__c,
                    'impact' => gap.Impact_Score__c
                }
            );
        }

        List<Map<String, Object>> activity = new List<Map<String, Object>>();
        for (SLK_Article_Review__c review : [
            SELECT Id, Name, Article_Title__c, Status__c, LastModifiedDate, Reviewer__r.Name, Submitted_By__r.Name
            FROM SLK_Article_Review__c
            ORDER BY LastModifiedDate DESC
            LIMIT 8
        ]) {
            activity.add(
                new Map<String, Object>{
                    'id' => review.Id,
                    'name' => review.Name,
                    'title' => review.Article_Title__c,
                    'status' => review.Status__c,
                    'when' => review.LastModifiedDate,
                    'reviewer' => review.Reviewer__r?.Name,
                    'author' => review.Submitted_By__r?.Name
                }
            );
        }

        return new Map<String, Object>{
            'totals' => new Map<String, Object>{
                'cases' => totalCases,
                'coveredCases' => coveredCases,
                'uncoveredCases' => totalCases - coveredCases,
                'openUncoveredCases' => openUncovered,
                'coverageRate' => totalCases == 0 ? 0 : (Decimal.valueOf(coveredCases) * 100 / totalCases).setScale(1),
                'publishedArticles' => published,
                'draftArticles' => drafts,
                'publishedLast30' => published30,
                'pendingReviews' => pendingReviews,
                'myPendingReviews' => myReviews,
                'approvedReady' => approvedReady,
                'linkableCases' => linkableCases,
                'missingContentCases' => missingCases
            },
            'gapStats' => gapStats,
            'coverageByType' => coverageByType(),
            'trend' => monthlyTrend(),
            'topArticles' => topArticles(8),
            'topGaps' => topGaps,
            'activity' => activity
        };
    }

    private static List<Map<String, Object>> coverageByType() {
        Map<String, Integer> totals = new Map<String, Integer>();
        Map<String, Integer> covered = new Map<String, Integer>();
        for (AggregateResult row : [SELECT Type caseType, COUNT(Id) total FROM Case GROUP BY Type]) {
            totals.put(labelFor((String) row.get('caseType')), (Integer) row.get('total'));
        }
        for (AggregateResult row : [
            SELECT Type caseType, COUNT(Id) total
            FROM Case
            WHERE Id IN (SELECT CaseId FROM CaseArticle)
            GROUP BY Type
        ]) {
            covered.put(labelFor((String) row.get('caseType')), (Integer) row.get('total'));
        }
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (String key : totals.keySet()) {
            Integer total = totals.get(key);
            Integer cov = covered.containsKey(key) ? covered.get(key) : 0;
            rows.add(
                new Map<String, Object>{
                    'label' => key,
                    'total' => total,
                    'covered' => cov,
                    'rate' => total == 0 ? 0 : (Decimal.valueOf(cov) * 100 / total).setScale(1)
                }
            );
        }
        return rows;
    }

    private static List<Map<String, Object>> monthlyTrend() {
        Map<String, Integer> totals = new Map<String, Integer>();
        Map<String, Integer> covered = new Map<String, Integer>();
        for (AggregateResult row : [
            SELECT CALENDAR_YEAR(CreatedDate) y, CALENDAR_MONTH(CreatedDate) m, COUNT(Id) total
            FROM Case
            WHERE CreatedDate = LAST_N_MONTHS:6 OR CreatedDate = THIS_MONTH
            GROUP BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)
        ]) {
            totals.put(monthKey(row), (Integer) row.get('total'));
        }
        for (AggregateResult row : [
            SELECT CALENDAR_YEAR(CreatedDate) y, CALENDAR_MONTH(CreatedDate) m, COUNT(Id) total
            FROM Case
            WHERE (CreatedDate = LAST_N_MONTHS:6 OR CreatedDate = THIS_MONTH) AND Id IN (SELECT CaseId FROM CaseArticle)
            GROUP BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)
        ]) {
            covered.put(monthKey(row), (Integer) row.get('total'));
        }
        List<String> keys = new List<String>(totals.keySet());
        keys.sort();
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (String key : keys) {
            Integer total = totals.get(key);
            Integer cov = covered.containsKey(key) ? covered.get(key) : 0;
            rows.add(
                new Map<String, Object>{
                    'month' => key,
                    'total' => total,
                    'covered' => cov,
                    'rate' => total == 0 ? 0 : (Decimal.valueOf(cov) * 100 / total).setScale(1)
                }
            );
        }
        return rows;
    }

    private static String monthKey(AggregateResult row) {
        Integer month = (Integer) row.get('m');
        return row.get('y') + '-' + (month < 10 ? '0' : '') + month;
    }

    private static String labelFor(String value) {
        return String.isBlank(value) ? 'Unspecified' : value;
    }

    public static List<Map<String, Object>> topArticles(Integer limitSize) {
        Map<Id, Integer> counts = new Map<Id, Integer>();
        for (AggregateResult row : [
            SELECT KnowledgeArticleId kaId, COUNT(Id) total
            FROM CaseArticle
            GROUP BY KnowledgeArticleId
            ORDER BY COUNT(Id) DESC
            LIMIT :limitSize
        ]) {
            counts.put((Id) row.get('kaId'), (Integer) row.get('total'));
        }
        Map<Id, Knowledge__kav> byKa = new Map<Id, Knowledge__kav>();
        for (Knowledge__kav article : [
            SELECT Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name, Article_Confidence__c
            FROM Knowledge__kav
            WHERE KnowledgeArticleId IN :counts.keySet() AND PublishStatus = 'Online' AND Language = :LANG
        ]) {
            byKa.put(article.KnowledgeArticleId, article);
        }
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (Id kaId : counts.keySet()) {
            Knowledge__kav article = byKa.get(kaId);
            if (article == null) {
                continue;
            }
            Map<String, Object> row = articleRow(article);
            row.put('attachCount', counts.get(kaId));
            rows.add(row);
        }
        return rows;
    }

    public static Map<String, Object> getUncoveredCases(String caseType, String search, String scope, Integer limitSize, Integer offsetSize) {
        String whereClause = 'Id NOT IN (SELECT CaseId FROM CaseArticle)';
        if (String.isNotBlank(caseType)) {
            whereClause += caseType == 'Unspecified' ? ' AND Type = null' : ' AND Type = :caseType';
        }
        String likeTerm;
        if (String.isNotBlank(search)) {
            likeTerm = '%' + search.trim() + '%';
            whereClause += ' AND (Subject LIKE :likeTerm OR CaseNumber LIKE :likeTerm)';
        }
        if (scope == 'open') {
            whereClause += ' AND IsClosed = FALSE';
        } else if (scope == 'closed') {
            whereClause += ' AND IsClosed = TRUE';
        }
        Integer lim = Math.min(Math.max(limitSize == null ? 25 : limitSize, 1), 100);
        Integer off = Math.min(Math.max(offsetSize == null ? 0 : offsetSize, 0), 2000);
        Map<String, Object> binds = new Map<String, Object>{ 'caseType' => caseType, 'likeTerm' => likeTerm };
        Integer total = Database.countQueryWithBinds('SELECT COUNT() FROM Case WHERE ' + whereClause, binds, AccessLevel.USER_MODE);
        List<Case> rows = Database.queryWithBinds(
            'SELECT Id, CaseNumber, Subject, Status, Type, Priority, Origin, CreatedDate, IsClosed, Account.Name ' +
                'FROM Case WHERE ' +
                whereClause +
                ' ORDER BY CreatedDate DESC LIMIT ' +
                lim +
                ' OFFSET ' +
                off,
            binds,
            AccessLevel.USER_MODE
        );
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (Case c : rows) {
            items.add(caseRow(c));
        }
        return new Map<String, Object>{ 'total' => total, 'items' => items, 'limit' => lim, 'offset' => off };
    }

    public static Map<String, Object> getHealth() {
        List<Map<String, Object>> stale = new List<Map<String, Object>>();
        for (Knowledge__kav article : [
            SELECT Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name, Article_Confidence__c
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = :LANG
            ORDER BY LastPublishedDate ASC
            LIMIT 25
        ]) {
            stale.add(articleRow(article));
        }

        Integer unusedCount = [
            SELECT COUNT()
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = :LANG AND KnowledgeArticleId NOT IN (SELECT KnowledgeArticleId FROM CaseArticle)
        ];
        List<Map<String, Object>> unused = new List<Map<String, Object>>();
        for (Knowledge__kav article : [
            SELECT Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name, Article_Confidence__c
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = :LANG AND KnowledgeArticleId NOT IN (SELECT KnowledgeArticleId FROM CaseArticle)
            ORDER BY LastPublishedDate ASC
            LIMIT 40
        ]) {
            unused.add(articleRow(article));
        }

        List<Map<String, Object>> lowConfidence = new List<Map<String, Object>>();
        for (Knowledge__kav article : [
            SELECT Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name, Article_Confidence__c
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = :LANG AND Article_Confidence__c IN ('Work in Progress', 'Not Validated')
            ORDER BY LastPublishedDate ASC
            LIMIT 40
        ]) {
            lowConfidence.add(articleRow(article));
        }

        List<Knowledge__kav> drafts = [
            SELECT Id, KnowledgeArticleId, Title, ArticleNumber, ArticleTotalViewCount, LastPublishedDate, RecordType.Name,
                Article_Confidence__c, Requires_Revision__c
            FROM Knowledge__kav
            WHERE PublishStatus = 'Draft' AND Language = :LANG
            ORDER BY LastModifiedDate DESC
            LIMIT 200
        ];
        Set<Id> draftMasters = new Set<Id>();
        for (Knowledge__kav draft : drafts) {
            draftMasters.add(draft.KnowledgeArticleId);
        }
        Set<Id> hasOnline = new Set<Id>();
        for (Knowledge__kav online : [
            SELECT KnowledgeArticleId
            FROM Knowledge__kav
            WHERE PublishStatus = 'Online' AND Language = :LANG AND KnowledgeArticleId IN :draftMasters
        ]) {
            hasOnline.add(online.KnowledgeArticleId);
        }
        List<Map<String, Object>> inRevision = new List<Map<String, Object>>();
        for (Knowledge__kav draft : drafts) {
            if ((draft.Requires_Revision__c || hasOnline.contains(draft.KnowledgeArticleId)) && inRevision.size() < 40) {
                inRevision.add(articleRow(draft));
            }
        }

        return new Map<String, Object>{
            'stale' => stale,
            'unused' => unused,
            'unusedCount' => unusedCount,
            'lowConfidence' => lowConfidence,
            'inRevision' => inRevision,
            'top' => topArticles(15)
        };
    }

    public static Map<String, Object> articleRow(Knowledge__kav article) {
        Integer ageDays = article.LastPublishedDate == null
            ? null
            : article.LastPublishedDate.date().daysBetween(Date.today());
        return new Map<String, Object>{
            'id' => article.Id,
            'knowledgeArticleId' => article.KnowledgeArticleId,
            'title' => article.Title,
            'articleNumber' => article.ArticleNumber,
            'views' => article.ArticleTotalViewCount,
            'lastPublished' => article.LastPublishedDate,
            'ageDays' => ageDays,
            'recordType' => article.RecordType?.Name,
            'confidence' => article.Article_Confidence__c
        };
    }

    public static Map<String, Object> caseRow(Case c) {
        return new Map<String, Object>{
            'id' => c.Id,
            'caseNumber' => c.CaseNumber,
            'subject' => c.Subject,
            'status' => c.Status,
            'type' => c.Type,
            'priority' => c.Priority,
            'origin' => c.Origin,
            'createdDate' => c.CreatedDate,
            'isClosed' => c.IsClosed,
            'account' => c.Account?.Name
        };
    }
}