/**
 * Account 360: every contact, case, conversation, and email on an account rolled into one view,
 * with entitlement and SLA performance, assets, open pipeline, and an AI read of the relationship.
 * Accepts an Account, Contact, Case, or Work Item id.
 */
public with sharing class SLK_AccountService {
    private static final Integer CASE_LIMIT = 200;

    public class AccountException extends Exception {
    }

    public static Id resolveAccountId(Id recordId) {
        if (recordId == null) {
            throw new AccountException('A record id is required.');
        }
        SObjectType type = recordId.getSobjectType();
        Id accountId;
        if (type == Account.SObjectType) {
            accountId = recordId;
        } else if (type == Contact.SObjectType) {
            List<Contact> rows = [SELECT AccountId FROM Contact WHERE Id = :recordId];
            accountId = rows.isEmpty() ? null : rows[0].AccountId;
        } else if (type == Case.SObjectType) {
            List<Case> rows = [SELECT AccountId FROM Case WHERE Id = :recordId];
            accountId = rows.isEmpty() ? null : rows[0].AccountId;
        } else if (type == SLK_Work_Item__c.SObjectType) {
            List<SLK_Work_Item__c> rows = [SELECT Case__r.AccountId FROM SLK_Work_Item__c WHERE Id = :recordId];
            accountId = rows.isEmpty() ? null : rows[0].Case__r?.AccountId;
        }
        if (accountId == null) {
            throw new AccountException('No account is linked to this record.');
        }
        return accountId;
    }

    public static Map<String, Object> profile(Id recordId) {
        Id accountId = resolveAccountId(recordId);
        List<Account> accounts = [
            SELECT Id, Name, Industry, Type, Phone, Website, Rating, AnnualRevenue, NumberOfEmployees, Description, Ownership,
                BillingStreet, BillingCity, BillingState, BillingCountry, CreatedDate, Owner.Name, ParentId, Parent.Name
            FROM Account
            WHERE Id = :accountId
        ];
        if (accounts.isEmpty()) {
            throw new AccountException('Account not found.');
        }
        Account a = accounts[0];

        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Status, Priority, Origin, Type, CreatedDate, ClosedDate, IsClosed, IsEscalated,
                ContactId, Contact.Name
            FROM Case
            WHERE AccountId = :accountId
            ORDER BY CreatedDate DESC
            LIMIT :CASE_LIMIT
        ];
        Set<Id> caseIds = new Map<Id, Case>(cases).keySet();
        List<SLK_Work_Item__c> work = [
            SELECT Id, Channel__c, Status__c, Subject__c, Sentiment__c, Summary__c, CreatedDate, Source_Record_Id__c, Case__c,
                Case__r.Contact.Name, Agent__r.Name
            FROM SLK_Work_Item__c
            WHERE Case__c IN :caseIds
            ORDER BY CreatedDate DESC
            LIMIT 100
        ];
        List<EmailMessage> emails = caseIds.isEmpty()
            ? new List<EmailMessage>()
            : [
                  SELECT Id, Subject, Incoming, MessageDate, ParentId
                  FROM EmailMessage
                  WHERE ParentId IN :caseIds
                  ORDER BY MessageDate DESC
                  LIMIT 150
              ];

        Datetime since = Datetime.now().addDays(-30);
        Integer open = 0;
        Integer escalated = 0;
        Integer urgentOpen = 0;
        Integer opened30d = 0;
        Long resolutionMinutes = 0;
        Integer resolved = 0;
        Datetime lastContact = null;
        Map<String, Integer> byPriority = new Map<String, Integer>();
        Map<String, Integer> byStatus = new Map<String, Integer>();
        Map<String, Integer> byType = new Map<String, Integer>();
        Map<Id, Integer> openByContact = new Map<Id, Integer>();
        Map<Id, Integer> totalByContact = new Map<Id, Integer>();
        Map<Id, Datetime> lastByContact = new Map<Id, Datetime>();
        List<Map<String, Object>> openCases = new List<Map<String, Object>>();
        List<Map<String, Object>> timeline = new List<Map<String, Object>>();

        for (Case row : cases) {
            lastContact = SLK_CustomerService.later(lastContact, row.CreatedDate);
            bump(byType, String.isBlank(row.Type) ? 'Other' : row.Type);
            if (row.ContactId != null) {
                bumpId(totalByContact, row.ContactId);
                lastByContact.put(row.ContactId, SLK_CustomerService.later(lastByContact.get(row.ContactId), row.CreatedDate));
            }
            if (row.CreatedDate >= since) {
                opened30d++;
            }
            if (!row.IsClosed) {
                open++;
                bump(byPriority, String.isBlank(row.Priority) ? 'None' : row.Priority);
                bump(byStatus, row.Status);
                if (row.Priority == 'High' || row.Priority == 'Critical' || row.IsEscalated) {
                    urgentOpen++;
                }
                if (row.ContactId != null) {
                    bumpId(openByContact, row.ContactId);
                }
                if (openCases.size() < 10) {
                    openCases.add(new Map<String, Object>{
                        'id' => row.Id,
                        'caseNumber' => row.CaseNumber,
                        'subject' => row.Subject,
                        'status' => row.Status,
                        'priority' => row.Priority,
                        'createdDate' => row.CreatedDate,
                        'contactName' => row.Contact?.Name
                    });
                }
            }
            if (row.IsEscalated) {
                escalated++;
            }
            if (row.IsClosed && row.ClosedDate != null) {
                resolutionMinutes += (row.ClosedDate.getTime() - row.CreatedDate.getTime()) / 60000;
                resolved++;
            }
            if (timeline.size() < 40) {
                timeline.add(new Map<String, Object>{
                    'id' => row.Id,
                    'kind' => 'case',
                    'title' => row.Subject,
                    'detail' => SLK_CustomerService.joinNonBlank(
                        new List<String>{ 'Case ' + row.CaseNumber, row.Contact?.Name, row.Status },
                        ' · '
                    ),
                    'at' => row.CreatedDate,
                    'recordId' => row.Id
                });
            }
        }

        Integer conversations30d = 0;
        Map<String, Integer> channelMix = new Map<String, Integer>{ 'Voice' => 0, 'Messaging' => 0, 'Case' => 0, 'Email' => 0 };
        Map<String, Integer> sentiment = new Map<String, Integer>{ 'Positive' => 0, 'Neutral' => 0, 'Negative' => 0 };
        for (SLK_Work_Item__c item : work) {
            channelMix.put(item.Channel__c, (channelMix.containsKey(item.Channel__c) ? channelMix.get(item.Channel__c) : 0) + 1);
            if (item.Sentiment__c != null && sentiment.containsKey(item.Sentiment__c)) {
                sentiment.put(item.Sentiment__c, sentiment.get(item.Sentiment__c) + 1);
            }
            if (item.CreatedDate >= since) {
                conversations30d++;
            }
            lastContact = SLK_CustomerService.later(lastContact, item.CreatedDate);
            timeline.add(new Map<String, Object>{
                'id' => item.Id,
                'kind' => item.Channel__c == 'Voice' ? 'voice' : item.Channel__c == 'Messaging' ? 'messaging' : 'work',
                'title' => item.Subject__c,
                'detail' => SLK_CustomerService.joinNonBlank(
                    new List<String>{ item.Case__r?.Contact?.Name, item.Status__c, item.Agent__r?.Name == null ? null : 'with ' + item.Agent__r.Name },
                    ' · '
                ),
                'summary' => SLK_AIService.truncate(item.Summary__c, 240),
                'sentiment' => item.Sentiment__c,
                'at' => item.CreatedDate,
                'recordId' => String.isNotBlank(item.Source_Record_Id__c) ? item.Source_Record_Id__c : item.Case__c
            });
        }
        Integer emailCount = 0;
        for (EmailMessage email : emails) {
            channelMix.put('Email', channelMix.get('Email') + 1);
            lastContact = SLK_CustomerService.later(lastContact, email.MessageDate);
            if (emailCount++ < 30) {
                timeline.add(new Map<String, Object>{
                    'id' => email.Id,
                    'kind' => 'email',
                    'title' => email.Subject,
                    'detail' => email.Incoming ? 'Email from customer' : 'Email to customer',
                    'at' => email.MessageDate,
                    'recordId' => email.ParentId
                });
            }
        }
        timeline.sort(new SLK_CustomerService.NewestFirst());
        while (timeline.size() > 30) {
            timeline.remove(timeline.size() - 1);
        }

        Integer contactCount = [SELECT COUNT() FROM Contact WHERE AccountId = :accountId];
        Integer totalCases = cases.size() < CASE_LIMIT ? cases.size() : [SELECT COUNT() FROM Case WHERE AccountId = :accountId];
        Integer openTotal = cases.size() < CASE_LIMIT ? open : [SELECT COUNT() FROM Case WHERE AccountId = :accountId AND IsClosed = FALSE];
        List<Map<String, Object>> contacts = new List<Map<String, Object>>();
        for (Contact person : [
            SELECT Id, Name, Title, Email, Phone
            FROM Contact
            WHERE AccountId = :accountId
            ORDER BY LastModifiedDate DESC
            LIMIT 50
        ]) {
            contacts.add(new Map<String, Object>{
                'id' => person.Id,
                'name' => person.Name,
                'title' => person.Title,
                'email' => person.Email,
                'phone' => person.Phone,
                'openCases' => valueOr(openByContact.get(person.Id)),
                'totalCases' => valueOr(totalByContact.get(person.Id)),
                'lastCase' => lastByContact.get(person.Id)
            });
        }
        contacts.sort(new MostEngaged());
        while (contacts.size() > 12) {
            contacts.remove(contacts.size() - 1);
        }

        return new Map<String, Object>{
            'account' => new Map<String, Object>{
                'id' => a.Id,
                'name' => a.Name,
                'industry' => a.Industry,
                'type' => a.Type,
                'phone' => a.Phone,
                'website' => a.Website,
                'rating' => a.Rating,
                'annualRevenue' => a.AnnualRevenue,
                'employees' => a.NumberOfEmployees,
                'ownership' => a.Ownership,
                'description' => SLK_AIService.truncate(a.Description, 600),
                'address' => SLK_CustomerService.joinNonBlank(
                    new List<String>{ a.BillingStreet, a.BillingCity, a.BillingState, a.BillingCountry },
                    ', '
                ),
                'location' => SLK_CustomerService.joinNonBlank(new List<String>{ a.BillingCity, a.BillingState }, ', '),
                'owner' => a.Owner?.Name,
                'customerSince' => a.CreatedDate,
                'parent' => a.ParentId == null ? null : new Map<String, Object>{ 'id' => a.ParentId, 'name' => a.Parent.Name }
            },
            'stats' => new Map<String, Object>{
                'openCases' => openTotal,
                'urgentOpen' => urgentOpen,
                'totalCases' => totalCases,
                'sampled' => cases.size(),
                'escalated' => escalated,
                'opened30d' => opened30d,
                'conversations30d' => conversations30d,
                'avgResolutionMinutes' => resolved == 0 ? null : (Object) (resolutionMinutes / resolved),
                'contacts' => contactCount,
                'lastContact' => lastContact
            },
            'caseMix' => new Map<String, Object>{ 'byPriority' => byPriority, 'byStatus' => byStatus, 'byType' => top(byType, 6) },
            'sentiment' => sentiment,
            'channelMix' => channelMix,
            'openCases' => openCases,
            'timeline' => timeline,
            'activity' => SLK_CustomerService.activityByMonth(cases, work, emails),
            'contacts' => contacts,
            'service' => serviceLevels(accountId),
            'assets' => assets(accountId),
            'pipeline' => pipeline(accountId)
        };
    }

    public static Map<String, Object> insight(Id recordId) {
        Map<String, Object> p = profile(recordId);
        Map<String, Object> account = (Map<String, Object>) p.get('account');
        String history = '';
        for (Object raw : (List<Object>) p.get('timeline')) {
            Map<String, Object> row = (Map<String, Object>) raw;
            Datetime at = (Datetime) row.get('at');
            history +=
                '- ' + (at == null ? '' : at.format('yyyy-MM-dd')) + ' ' + String.valueOf(row.get('kind')).toUpperCase() + ': ' + row.get('title') +
                ' (' + row.get('detail') + ')' +
                (row.get('sentiment') == null ? '' : ' sentiment=' + row.get('sentiment')) +
                (row.get('summary') == null ? '' : ' — ' + row.get('summary')) + '\n';
        }
        Map<String, Object> ai = SLK_AIService.generateJson(
            'You are an account intelligence analyst briefing a service team before they work with this customer account. ' +
            'Look across every contact and case for patterns. Be specific and factual; never invent facts that are not in the data.',
            'ACCOUNT: ' + account.get('name') + ' | ' + account.get('industry') + ' | ' + account.get('type') + ' | rating ' + account.get('rating') +
            '\nSTATS: ' + JSON.serialize(p.get('stats')) +
            '\nCASE MIX: ' + JSON.serialize(p.get('caseMix')) +
            '\nSENTIMENT: ' + JSON.serialize(p.get('sentiment')) +
            '\nSERVICE LEVELS: ' + JSON.serialize(p.get('service')) +
            '\nOPEN PIPELINE: ' + JSON.serialize(p.get('pipeline')) +
            '\n\nHISTORY (newest first):\n' + (String.isBlank(history) ? 'No interactions recorded.' : history) +
            '\n\nJSON shape: {"headline":"max 12 words","summary":"2-3 sentences on the account and how the relationship is going",' +
            '"relationship":"Strong|Stable|At risk","relationshipReason":"short","caresAbout":["up to 3 recurring themes or priorities"],' +
            '"approach":"one sentence on how the team should handle this account right now","talkingPoints":["up to 3 short, concrete actions"]}'
        );
        return new Map<String, Object>{
            'headline' => SLK_AIService.getStr(ai, 'headline'),
            'summary' => SLK_AIService.getStr(ai, 'summary'),
            'relationship' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'relationship'), SLK_CustomerService.RELATIONSHIPS, 'Stable'),
            'relationshipReason' => SLK_AIService.getStr(ai, 'relationshipReason'),
            'caresAbout' => SLK_CustomerService.strings(SLK_AIService.getList(ai, 'caresAbout')),
            'approach' => SLK_AIService.getStr(ai, 'approach'),
            'talkingPoints' => SLK_CustomerService.strings(SLK_AIService.getList(ai, 'talkingPoints')),
            'generatedAt' => Datetime.now()
        };
    }

    private static Map<String, Object> serviceLevels(Id accountId) {
        List<Map<String, Object>> entitlements = new List<Map<String, Object>>();
        for (Entitlement row : [
            SELECT Id, Name, Status, StartDate, EndDate, Type, SlaProcess.Name
            FROM Entitlement
            WHERE AccountId = :accountId
            ORDER BY EndDate DESC NULLS FIRST
            LIMIT 6
        ]) {
            entitlements.add(new Map<String, Object>{
                'id' => row.Id,
                'name' => row.Name,
                'status' => row.Status,
                'type' => row.Type,
                'process' => row.SlaProcess?.Name,
                'startDate' => row.StartDate,
                'endDate' => row.EndDate
            });
        }
        Integer met = 0;
        Integer missed = 0;
        Integer breachedOpen = 0;
        Integer inFlight = 0;
        Datetime now = Datetime.now();
        Datetime since = now.addDays(-90);
        for (CaseMilestone row : [
            SELECT IsCompleted, IsViolated, TargetDate
            FROM CaseMilestone
            WHERE Case.AccountId = :accountId AND StartDate >= :since
            LIMIT 500
        ]) {
            if (row.IsCompleted) {
                if (row.IsViolated) {
                    missed++;
                } else {
                    met++;
                }
            } else if (row.IsViolated || (row.TargetDate != null && row.TargetDate < now)) {
                breachedOpen++;
            } else {
                inFlight++;
            }
        }
        Integer finished = met + missed;
        return new Map<String, Object>{
            'entitlements' => entitlements,
            'met' => met,
            'missed' => missed,
            'breachedOpen' => breachedOpen,
            'inFlight' => inFlight,
            'metPct' => finished == 0 ? null : (Object) Math.round(met * 100.0 / finished)
        };
    }

    private static List<Map<String, Object>> assets(Id accountId) {
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (Asset row : [
            SELECT Id, Name, Status, SerialNumber, InstallDate, UsageEndDate, Quantity, Product2.Name
            FROM Asset
            WHERE AccountId = :accountId
            ORDER BY InstallDate DESC NULLS LAST
            LIMIT 8
        ]) {
            rows.add(new Map<String, Object>{
                'id' => row.Id,
                'name' => row.Name,
                'product' => row.Product2?.Name,
                'status' => row.Status,
                'serialNumber' => row.SerialNumber,
                'installDate' => row.InstallDate,
                'usageEndDate' => row.UsageEndDate,
                'quantity' => row.Quantity
            });
        }
        return rows;
    }

    private static Map<String, Object> pipeline(Id accountId) {
        Decimal total = 0;
        Integer count = 0;
        List<Map<String, Object>> items = new List<Map<String, Object>>();
        for (Opportunity row : [
            SELECT Id, Name, StageName, Amount, CloseDate, Probability, Owner.Name
            FROM Opportunity
            WHERE AccountId = :accountId AND IsClosed = FALSE
            ORDER BY CloseDate ASC
            LIMIT 50
        ]) {
            total += row.Amount == null ? 0 : row.Amount;
            count++;
            if (items.size() < 5) {
                items.add(new Map<String, Object>{
                    'id' => row.Id,
                    'name' => row.Name,
                    'stage' => row.StageName,
                    'amount' => row.Amount,
                    'closeDate' => row.CloseDate,
                    'probability' => row.Probability,
                    'owner' => row.Owner?.Name
                });
            }
        }
        AggregateResult[] won = [
            SELECT SUM(Amount) amount
            FROM Opportunity
            WHERE AccountId = :accountId AND IsWon = TRUE AND CloseDate = LAST_N_DAYS:365
        ];
        Object wonAmount = won.isEmpty() ? null : won[0].get('amount');
        return new Map<String, Object>{
            'openAmount' => total,
            'openCount' => count,
            'wonLastYear' => wonAmount == null ? 0 : wonAmount,
            'items' => items
        };
    }

    private static void bump(Map<String, Integer> counts, String key) {
        counts.put(key, (counts.containsKey(key) ? counts.get(key) : 0) + 1);
    }

    private static void bumpId(Map<Id, Integer> counts, Id key) {
        counts.put(key, valueOr(counts.get(key)) + 1);
    }

    private static Integer valueOr(Integer value) {
        return value == null ? 0 : value;
    }

    private static List<Map<String, Object>> top(Map<String, Integer> counts, Integer size) {
        List<Map<String, Object>> rows = new List<Map<String, Object>>();
        for (String key : counts.keySet()) {
            rows.add(new Map<String, Object>{ 'label' => key, 'count' => counts.get(key) });
        }
        rows.sort(new LargestCount());
        while (rows.size() > size) {
            rows.remove(rows.size() - 1);
        }
        return rows;
    }

    private class LargestCount implements System.Comparator<Map<String, Object>> {
        public Integer compare(Map<String, Object> a, Map<String, Object> b) {
            return (Integer) b.get('count') - (Integer) a.get('count');
        }
    }

    private class MostEngaged implements System.Comparator<Map<String, Object>> {
        public Integer compare(Map<String, Object> a, Map<String, Object> b) {
            Integer open = (Integer) b.get('openCases') - (Integer) a.get('openCases');
            return open != 0 ? open : (Integer) b.get('totalCases') - (Integer) a.get('totalCases');
        }
    }
}