/**
 * Peer review workflow for draft articles: submission (with an AI quality pre-check),
 * reviewer decisions, and the review queue.
 */
public with sharing class SLK_ReviewService {
    public class ReviewException extends Exception {
    }

    public static Map<String, Object> submit(Id versionId, Id reviewerId, String notes, Boolean runAiCheck) {
        if (reviewerId == null) {
            throw new ReviewException('Choose a reviewer.');
        }
        Knowledge__kav article = SLK_ArticleService.loadArticle(versionId);
        if (article.PublishStatus != 'Draft') {
            throw new ReviewException('Only drafts can be submitted for review.');
        }

        Map<String, Object> report = runAiCheck == false ? null : SLK_ArticleService.qualityCheck(versionId);

        List<SLK_Article_Review__c> prior = [
            SELECT Id, Status__c
            FROM SLK_Article_Review__c
            WHERE Knowledge_Article_Id__c = :article.KnowledgeArticleId
        ];
        for (SLK_Article_Review__c review : prior) {
            if (review.Status__c == 'Pending' || review.Status__c == 'Approved') {
                review.Status__c = 'Withdrawn';
            }
        }
        update prior;

        List<SLK_Knowledge_Gap__c> gaps = [
            SELECT Id, Status__c
            FROM SLK_Knowledge_Gap__c
            WHERE Draft_Article_Version_Id__c = :article.Id
            LIMIT 1
        ];

        SLK_Article_Review__c review = new SLK_Article_Review__c(
            Article_Version_Id__c = article.Id,
            Knowledge_Article_Id__c = article.KnowledgeArticleId,
            Article_Title__c = SLK_AIService.truncate(article.Title, 255),
            Article_Number__c = article.ArticleNumber,
            Status__c = 'Pending',
            Reviewer__c = reviewerId,
            Submitted_By__c = UserInfo.getUserId(),
            Submitted_At__c = Datetime.now(),
            Round__c = prior.size() + 1,
            Submitter_Notes__c = notes,
            Knowledge_Gap__c = gaps.isEmpty() ? null : gaps[0].Id,
            AI_Quality_Score__c = report == null ? null : (Integer) report.get('score'),
            AI_Quality_Report__c = report == null ? null : JSON.serialize(report)
        );
        insert review;

        if (!gaps.isEmpty()) {
            gaps[0].Status__c = 'In Review';
            update gaps;
        }
        return new Map<String, Object>{ 'reviewId' => review.Id, 'qualityScore' => review.AI_Quality_Score__c };
    }

    public static Map<String, Object> decide(Id reviewId, String decision, String comments) {
        SLK_Article_Review__c review = loadReview(reviewId);
        if (review.Status__c != 'Pending') {
            throw new ReviewException('This review has already been decided.');
        }
        if (decision == 'approve') {
            review.Status__c = 'Approved';
        } else if (decision == 'changes') {
            if (String.isBlank(comments)) {
                throw new ReviewException('Explain what needs to change.');
            }
            review.Status__c = 'Changes Requested';
        } else {
            throw new ReviewException('Unknown decision: ' + decision);
        }
        review.Reviewer_Comments__c = comments;
        review.Decision_At__c = Datetime.now();
        update review;

        if (review.Knowledge_Gap__c != null && decision == 'changes') {
            update new SLK_Knowledge_Gap__c(Id = review.Knowledge_Gap__c, Status__c = 'Drafting');
        }
        return reviewRow(loadReview(reviewId));
    }

    public static Map<String, Object> getReview(Id reviewId) {
        return reviewRow(loadReview(reviewId));
    }

    public static Map<String, Object> refreshQuality(Id reviewId) {
        SLK_Article_Review__c review = loadReview(reviewId);
        Map<String, Object> report = SLK_ArticleService.qualityCheck(review.Article_Version_Id__c);
        review.AI_Quality_Score__c = (Integer) report.get('score');
        review.AI_Quality_Report__c = JSON.serialize(report);
        update review;
        return reviewRow(loadReview(reviewId));
    }

    public static List<Map<String, Object>> queue(String scope) {
        Id me = UserInfo.getUserId();
        List<SLK_Article_Review__c> reviews;
        if (scope == 'mine') {
            reviews = [
                SELECT Id, Name, Status__c, Round__c, Reviewer__c, Reviewer__r.Name, Submitted_By__r.Name, Submitted_At__c,
                    Decision_At__c, Submitter_Notes__c, Reviewer_Comments__c, AI_Quality_Score__c, AI_Quality_Report__c,
                    Article_Version_Id__c, Article_Title__c, Article_Number__c, Knowledge_Gap__r.Name, Knowledge_Gap__r.Case_Count__c
                FROM SLK_Article_Review__c
                WHERE Reviewer__c = :me AND Status__c IN ('Pending', 'Approved')
                ORDER BY Submitted_At__c ASC
                LIMIT 200
            ];
        } else if (scope == 'submitted') {
            reviews = [
                SELECT Id, Name, Status__c, Round__c, Reviewer__c, Reviewer__r.Name, Submitted_By__r.Name, Submitted_At__c,
                    Decision_At__c, Submitter_Notes__c, Reviewer_Comments__c, AI_Quality_Score__c, AI_Quality_Report__c,
                    Article_Version_Id__c, Article_Title__c, Article_Number__c, Knowledge_Gap__r.Name, Knowledge_Gap__r.Case_Count__c
                FROM SLK_Article_Review__c
                WHERE Submitted_By__c = :me
                ORDER BY CreatedDate DESC
                LIMIT 200
            ];
        } else {
            reviews = [
                SELECT Id, Name, Status__c, Round__c, Reviewer__c, Reviewer__r.Name, Submitted_By__r.Name, Submitted_At__c,
                    Decision_At__c, Submitter_Notes__c, Reviewer_Comments__c, AI_Quality_Score__c, AI_Quality_Report__c,
                    Article_Version_Id__c, Article_Title__c, Article_Number__c, Knowledge_Gap__r.Name, Knowledge_Gap__r.Case_Count__c
                FROM SLK_Article_Review__c
                ORDER BY CreatedDate DESC
                LIMIT 200
            ];
        }
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (SLK_Article_Review__c review : reviews) {
            Map<String, Object> row = reviewRow(review);
            row.put('gapName', review.Knowledge_Gap__r?.Name);
            row.put('gapCaseCount', review.Knowledge_Gap__r?.Case_Count__c);
            rows.add(row);
        }
        return rows;
    }

    public static List<Map<String, Object>> reviewers() {
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (User u : [
            SELECT Id, Name, Title, SmallPhotoUrl
            FROM User
            WHERE IsActive = TRUE AND UserType = 'Standard' AND UserPermissionsKnowledgeUser = TRUE
            ORDER BY Name
            LIMIT 200
        ]) {
            rows.add(
                new Map<String, Object>{
                    'id' => u.Id,
                    'name' => u.Name,
                    'title' => u.Title,
                    'photo' => u.SmallPhotoUrl,
                    'isMe' => u.Id == UserInfo.getUserId()
                }
            );
        }
        return rows;
    }

    public static Map<String, Object> reviewRow(SLK_Article_Review__c review) {
        Object report;
        if (String.isNotBlank(review.AI_Quality_Report__c)) {
            try {
                report = JSON.deserializeUntyped(review.AI_Quality_Report__c);
            } catch (Exception e) {
                report = null;
            }
        }
        return new Map<String, Object>{
            'id' => review.Id,
            'name' => review.Name,
            'status' => review.Status__c,
            'round' => review.Round__c,
            'reviewerId' => review.Reviewer__c,
            'reviewer' => review.Reviewer__r?.Name,
            'submittedBy' => review.Submitted_By__r?.Name,
            'submittedAt' => review.Submitted_At__c,
            'decisionAt' => review.Decision_At__c,
            'notes' => review.Submitter_Notes__c,
            'comments' => review.Reviewer_Comments__c,
            'qualityScore' => review.AI_Quality_Score__c,
            'qualityReport' => report,
            'articleId' => review.Article_Version_Id__c,
            'articleTitle' => review.getPopulatedFieldsAsMap().containsKey('Article_Title__c') ? review.Article_Title__c : null,
            'articleNumber' => review.getPopulatedFieldsAsMap().containsKey('Article_Number__c') ? review.Article_Number__c : null,
            'isMine' => review.Reviewer__c == UserInfo.getUserId()
        };
    }

    private static SLK_Article_Review__c loadReview(Id reviewId) {
        List<SLK_Article_Review__c> reviews = [
            SELECT Id, Name, Status__c, Round__c, Reviewer__c, Reviewer__r.Name, Submitted_By__r.Name, Submitted_At__c,
                Decision_At__c, Submitter_Notes__c, Reviewer_Comments__c, AI_Quality_Score__c, AI_Quality_Report__c,
                Article_Version_Id__c, Article_Title__c, Article_Number__c, Knowledge_Gap__c
            FROM SLK_Article_Review__c
            WHERE Id = :reviewId
        ];
        if (reviews.isEmpty()) {
            throw new ReviewException('Review not found.');
        }
        return reviews[0];
    }
}