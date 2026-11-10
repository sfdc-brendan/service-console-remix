/**
 * Customer 360: one grounded view of a contact across cases, routed conversations, and email,
 * plus an AI read of the relationship. Accepts a Contact, Case, or Work Item id.
 */
public with sharing class SLK_CustomerService {
    public static final Set<String> RELATIONSHIPS = new Set<String>{ 'Strong', 'Stable', 'At risk' };

    public class CustomerException extends Exception {
    }

    public static Id resolveContactId(Id recordId) {
        if (recordId == null) {
            throw new CustomerException('A record id is required.');
        }
        SObjectType type = recordId.getSobjectType();
        Id contactId;
        if (type == Contact.SObjectType) {
            contactId = recordId;
        } else if (type == Case.SObjectType) {
            List<Case> rows = [SELECT ContactId FROM Case WHERE Id = :recordId];
            contactId = rows.isEmpty() ? null : rows[0].ContactId;
        } else if (type == SLK_Work_Item__c.SObjectType) {
            List<SLK_Work_Item__c> rows = [SELECT Case__r.ContactId FROM SLK_Work_Item__c WHERE Id = :recordId];
            contactId = rows.isEmpty() ? null : rows[0].Case__r?.ContactId;
        }
        if (contactId == null) {
            throw new CustomerException('No customer contact is linked to this record.');
        }
        return contactId;
    }

    public static Map<String, Object> profile(Id recordId) {
        Id contactId = resolveContactId(recordId);
        List<Contact> contacts = [
            SELECT Id, Name, FirstName, Title, Department, Email, Phone, MobilePhone, MailingCity, MailingState, MailingCountry,
                CreatedDate, Owner.Name, AccountId, Account.Name, Account.Industry, Account.Type, Account.Phone, Account.Website,
                Account.BillingCity, Account.BillingState, Account.NumberOfEmployees
            FROM Contact
            WHERE Id = :contactId
        ];
        if (contacts.isEmpty()) {
            throw new CustomerException('Contact not found.');
        }
        Contact c = contacts[0];

        List<Case> cases = [
            SELECT Id, CaseNumber, Subject, Status, Priority, Origin, CreatedDate, ClosedDate, IsClosed, IsEscalated
            FROM Case
            WHERE ContactId = :contactId
            ORDER BY CreatedDate DESC
            LIMIT 50
        ];
        Set<Id> caseIds = new Map<Id, Case>(cases).keySet();
        List<SLK_Work_Item__c> work = [
            SELECT Id, Channel__c, Status__c, Subject__c, Sentiment__c, Summary__c, CreatedDate, Accepted_At__c, Closed_At__c,
                Source_Record_Id__c, Case__c, Agent__r.Name
            FROM SLK_Work_Item__c
            WHERE Case__c IN :caseIds
            ORDER BY CreatedDate DESC
            LIMIT 40
        ];
        List<EmailMessage> emails = caseIds.isEmpty()
            ? new List<EmailMessage>()
            : [
                  SELECT Id, Subject, Incoming, MessageDate, ParentId
                  FROM EmailMessage
                  WHERE ParentId IN :caseIds
                  ORDER BY MessageDate DESC
                  LIMIT 60
              ];

        Integer open = 0;
        Integer escalated = 0;
        Long resolutionMinutes = 0;
        Integer resolved = 0;
        List<Map<String, Object>> openCases = new List<Map<String, Object>>();
        for (Case row : cases) {
            if (!row.IsClosed) {
                open++;
                if (openCases.size() < 8) {
                    openCases.add(caseDto(row));
                }
            }
            if (row.IsEscalated) {
                escalated++;
            }
            if (row.IsClosed && row.ClosedDate != null) {
                resolutionMinutes += (row.ClosedDate.getTime() - row.CreatedDate.getTime()) / 60000;
                resolved++;
            }
        }

        Datetime since = Datetime.now().addDays(-30);
        Integer recent = 0;
        Map<String, Integer> channelMix = new Map<String, Integer>{ 'Voice' => 0, 'Messaging' => 0, 'Case' => 0, 'Email' => 0 };
        Map<String, Integer> sentiment = new Map<String, Integer>{ 'Positive' => 0, 'Neutral' => 0, 'Negative' => 0 };
        List<Map<String, Object>> timeline = new List<Map<String, Object>>();
        Datetime lastContact = null;

        for (SLK_Work_Item__c item : work) {
            channelMix.put(item.Channel__c, (channelMix.containsKey(item.Channel__c) ? channelMix.get(item.Channel__c) : 0) + 1);
            if (item.Sentiment__c != null && sentiment.containsKey(item.Sentiment__c)) {
                sentiment.put(item.Sentiment__c, sentiment.get(item.Sentiment__c) + 1);
            }
            if (item.CreatedDate >= since) {
                recent++;
            }
            lastContact = later(lastContact, item.CreatedDate);
            timeline.add(new Map<String, Object>{
                'id' => item.Id,
                'kind' => item.Channel__c == 'Voice' ? 'voice' : item.Channel__c == 'Messaging' ? 'messaging' : 'work',
                'title' => item.Subject__c,
                'detail' => joinNonBlank(new List<String>{ item.Status__c, item.Agent__r?.Name == null ? null : 'with ' + item.Agent__r.Name }, ' · '),
                'summary' => SLK_AIService.truncate(item.Summary__c, 240),
                'sentiment' => item.Sentiment__c,
                'at' => item.CreatedDate,
                'recordId' => String.isNotBlank(item.Source_Record_Id__c) ? item.Source_Record_Id__c : item.Case__c
            });
        }
        for (EmailMessage email : emails) {
            channelMix.put('Email', channelMix.get('Email') + 1);
            if (email.MessageDate != null && email.MessageDate >= since) {
                recent++;
            }
            lastContact = later(lastContact, email.MessageDate);
            timeline.add(new Map<String, Object>{
                'id' => email.Id,
                'kind' => 'email',
                'title' => email.Subject,
                'detail' => email.Incoming ? 'Email from customer' : 'Email to customer',
                'at' => email.MessageDate,
                'recordId' => email.ParentId
            });
        }
        for (Case row : cases) {
            lastContact = later(lastContact, row.CreatedDate);
            timeline.add(new Map<String, Object>{
                'id' => row.Id,
                'kind' => 'case',
                'title' => row.Subject,
                'detail' => 'Case ' + row.CaseNumber + ' opened via ' + (row.Origin == null ? 'unknown' : row.Origin) + ' · ' + row.Status,
                'at' => row.CreatedDate,
                'recordId' => row.Id
            });
            if (row.CreatedDate >= since) {
                recent++;
            }
        }
        Map<String, Object> activity = activityByMonth(cases, work, emails);
        timeline.sort(new NewestFirst());
        while (timeline.size() > 25) {
            timeline.remove(timeline.size() - 1);
        }

        Integer accountCases = c.AccountId == null ? 0 : [SELECT COUNT() FROM Case WHERE AccountId = :c.AccountId];
        Integer accountContacts = c.AccountId == null ? 0 : [SELECT COUNT() FROM Contact WHERE AccountId = :c.AccountId];
        List<Map<String, Object>> colleagues = new List<Map<String, Object>>();
        if (c.AccountId != null) {
            for (Contact peer : [
                SELECT Id, Name, Title, Email, (SELECT Id FROM Cases WHERE IsClosed = FALSE LIMIT 20)
                FROM Contact
                WHERE AccountId = :c.AccountId AND Id != :c.Id
                ORDER BY LastModifiedDate DESC
                LIMIT 6
            ]) {
                colleagues.add(
                    new Map<String, Object>{ 'id' => peer.Id, 'name' => peer.Name, 'title' => peer.Title, 'email' => peer.Email, 'openCases' => peer.Cases.size() }
                );
            }
        }

        return new Map<String, Object>{
            'contact' => new Map<String, Object>{
                'id' => c.Id,
                'name' => c.Name,
                'firstName' => c.FirstName,
                'title' => c.Title,
                'department' => c.Department,
                'email' => c.Email,
                'phone' => String.isNotBlank(c.Phone) ? c.Phone : c.MobilePhone,
                'location' => joinNonBlank(new List<String>{ c.MailingCity, c.MailingState, c.MailingCountry }, ', '),
                'customerSince' => c.CreatedDate,
                'owner' => c.Owner?.Name,
                'mobile' => c.MobilePhone,
                'accountId' => c.AccountId
            },
            'account' => c.AccountId == null
                ? null
                : new Map<String, Object>{
                      'id' => c.AccountId,
                      'name' => c.Account.Name,
                      'industry' => c.Account.Industry,
                      'type' => c.Account.Type,
                      'phone' => c.Account.Phone,
                      'website' => c.Account.Website,
                      'location' => joinNonBlank(new List<String>{ c.Account.BillingCity, c.Account.BillingState }, ', '),
                      'employees' => c.Account.NumberOfEmployees,
                      'totalCases' => accountCases,
                      'contacts' => accountContacts
                  },
            'stats' => new Map<String, Object>{
                'openCases' => open,
                'totalCases' => cases.size(),
                'escalated' => escalated,
                'avgResolutionMinutes' => resolved == 0 ? null : (Object) (resolutionMinutes / resolved),
                'interactions30d' => recent,
                'lastContact' => lastContact
            },
            'sentiment' => sentiment,
            'channelMix' => channelMix,
            'openCases' => openCases,
            'timeline' => timeline,
            'activity' => activity,
            'colleagues' => colleagues
        };
    }

    public static Map<String, Object> insight(Id recordId) {
        Map<String, Object> p = profile(recordId);
        Map<String, Object> contact = (Map<String, Object>) p.get('contact');
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
            'You are a customer intelligence analyst briefing a service rep before they help this customer. ' +
            'Be specific and factual; never invent facts that are not in the data.',
            'CUSTOMER: ' + contact.get('name') + (contact.get('title') == null ? '' : ', ' + contact.get('title')) +
            (account == null ? '' : '\nACCOUNT: ' + account.get('name') + ' | ' + account.get('industry') + ' | ' + account.get('type') + ' | ' + account.get('totalCases') + ' cases across ' + account.get('contacts') + ' contacts') +
            '\nSTATS: ' + JSON.serialize(p.get('stats')) + '\nSENTIMENT: ' + JSON.serialize(p.get('sentiment')) +
            '\n\nHISTORY (newest first):\n' + (String.isBlank(history) ? 'No prior interactions.' : history) +
            '\n\nJSON shape: {"headline":"max 12 words","summary":"2-3 sentences on who they are and how the relationship is going",' +
            '"relationship":"Strong|Stable|At risk","relationshipReason":"short","caresAbout":["up to 3 short items"],' +
            '"approach":"one sentence on how to handle them today","talkingPoints":["up to 3 short items"]}'
        );
        return new Map<String, Object>{
            'headline' => SLK_AIService.getStr(ai, 'headline'),
            'summary' => SLK_AIService.getStr(ai, 'summary'),
            'relationship' => SLK_AIService.pick(SLK_AIService.getStr(ai, 'relationship'), RELATIONSHIPS, 'Stable'),
            'relationshipReason' => SLK_AIService.getStr(ai, 'relationshipReason'),
            'caresAbout' => strings(SLK_AIService.getList(ai, 'caresAbout')),
            'approach' => SLK_AIService.getStr(ai, 'approach'),
            'talkingPoints' => strings(SLK_AIService.getList(ai, 'talkingPoints')),
            'generatedAt' => Datetime.now()
        };
    }

    public static Map<String, Object> activityByMonth(List<Case> cases, List<SLK_Work_Item__c> work, List<EmailMessage> emails) {
        Date first = Date.today().toStartOfMonth().addMonths(-11);
        Map<String, Map<String, Object>> months = new Map<String, Map<String, Object>>();
        List<Object> ordered = new List<Object>();
        for (Integer i = 0; i < 12; i++) {
            Date month = first.addMonths(i);
            Map<String, Object> bucket = new Map<String, Object>{ 'month' => month, 'Case' => 0, 'Voice' => 0, 'Messaging' => 0, 'Email' => 0 };
            months.put(monthKey(month), bucket);
            ordered.add(bucket);
        }
        for (Case row : cases) {
            bump(months, row.CreatedDate, 'Case');
        }
        for (SLK_Work_Item__c item : work) {
            if (item.Channel__c == 'Voice' || item.Channel__c == 'Messaging') {
                bump(months, item.CreatedDate, item.Channel__c);
            }
        }
        for (EmailMessage email : emails) {
            bump(months, email.MessageDate, 'Email');
        }
        return new Map<String, Object>{ 'months' => ordered };
    }

    private static void bump(Map<String, Map<String, Object>> months, Datetime at, String channel) {
        if (at == null) {
            return;
        }
        Map<String, Object> bucket = months.get(monthKey(at.date()));
        if (bucket != null) {
            bucket.put(channel, (Integer) bucket.get(channel) + 1);
        }
    }

    private static String monthKey(Date day) {
        return day.year() + '-' + day.month();
    }

    private static Map<String, Object> caseDto(Case row) {
        return new Map<String, Object>{
            'id' => row.Id,
            'caseNumber' => row.CaseNumber,
            'subject' => row.Subject,
            'status' => row.Status,
            'priority' => row.Priority,
            'createdDate' => row.CreatedDate
        };
    }

    public static Datetime later(Datetime a, Datetime b) {
        if (a == null) {
            return b;
        }
        return b != null && b > a ? b : a;
    }

    public static String joinNonBlank(List<String> parts, String separator) {
        List<String> kept = new List<String>();
        for (String part : parts) {
            if (String.isNotBlank(part)) {
                kept.add(part);
            }
        }
        return kept.isEmpty() ? null : String.join(kept, separator);
    }

    public static List<String> strings(List<Object> raw) {
        List<String> values = new List<String>();
        for (Object item : raw) {
            if (item != null && String.isNotBlank(String.valueOf(item))) {
                values.add(String.valueOf(item));
            }
        }
        return values;
    }

    public class NewestFirst implements System.Comparator<Map<String, Object>> {
        public Integer compare(Map<String, Object> a, Map<String, Object> b) {
            Datetime x = (Datetime) a.get('at');
            Datetime y = (Datetime) b.get('at');
            if (x == y) {
                return 0;
            }
            if (x == null) {
                return 1;
            }
            if (y == null) {
                return -1;
            }
            return x > y ? -1 : 1;
        }
    }
}