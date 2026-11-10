import GET_CASE_DETAIL from './query/getCaseDetail.graphql?raw';
import GET_ACCOUNT_CASES from './query/getAccountCases.graphql?raw';
import GET_MY_OPEN_CASES from './query/getMyOpenCases.graphql?raw';
import GET_VOICE_CALL from './query/getVoiceCall.graphql?raw';
import GET_MESSAGING_SESSION from './query/getMessagingSession.graphql?raw';
import GET_WORK_BY_SOURCE from './query/getWorkBySource.graphql?raw';
import GET_RECENT_CHANNEL_ACTIVITY from './query/getRecentChannelActivity.graphql?raw';
import UPDATE_CASE from './mutation/updateCase.graphql?raw';
import CREATE_CASE_COMMENT from './mutation/createCaseComment.graphql?raw';
import { runMutation, runQuery } from './sdk';
import type {
  CreateCaseCommentMutation,
  CreateCaseCommentMutationVariables,
  GetAccountCasesQuery,
  GetAccountCasesQueryVariables,
  GetCaseDetailQuery,
  GetCaseDetailQueryVariables,
  GetMessagingSessionQuery,
  GetMessagingSessionQueryVariables,
  GetMyOpenCasesQuery,
  GetMyOpenCasesQueryVariables,
  GetRecentChannelActivityQuery,
  GetRecentChannelActivityQueryVariables,
  GetVoiceCallQuery,
  GetVoiceCallQueryVariables,
  GetWorkBySourceQuery,
  GetWorkBySourceQueryVariables,
  UpdateCaseMutation,
  UpdateCaseMutationVariables,
} from '../graphql-operations-types';

type Field<T> = { value?: T | null } | null | undefined;

const val = <T>(field: Field<T>): T | null => field?.value ?? null;
const str = (field: Field<string>): string => field?.value ?? '';

function nodes<T>(connection: { edges?: Array<{ node?: T | null } | null> | null } | null | undefined): T[] {
  return (connection?.edges ?? []).flatMap(edge => (edge?.node ? [edge.node] : []));
}

export interface CaseContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  city: string | null;
}

export interface CaseAccount {
  id: string;
  name: string;
  industry: string | null;
  type: string | null;
  phone: string | null;
  annualRevenue: string | null;
  employees: number | null;
  city: string | null;
  rating: string | null;
}

export interface CaseComment {
  id: string;
  body: string;
  isPublished: boolean;
  createdDate: string | null;
  createdBy: string;
}

export interface CaseTask {
  id: string;
  subject: string;
  status: string | null;
  activityDate: string | null;
  subtype: string | null;
  createdDate: string | null;
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  origin: string | null;
  type: string | null;
  reason: string | null;
  isEscalated: boolean;
  isClosed: boolean;
  createdDate: string | null;
  lastModifiedDate: string | null;
  closedDate: string | null;
  ownerId: string | null;
  ownerName: string;
  contact: CaseContact | null;
  account: CaseAccount | null;
  comments: CaseComment[];
  tasks: CaseTask[];
}

export interface CaseListItem {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  priority: string;
  origin: string | null;
  createdDate: string | null;
  contactName: string | null;
}

export interface VoiceCallRecord {
  id: string;
  name: string;
  callType: string | null;
  startTime: string | null;
  durationSeconds: number | null;
  fromNumber: string | null;
  toNumber: string | null;
  disposition: string | null;
  resolution: string | null;
  relatedRecordId: string | null;
  createdDate: string | null;
}

export interface MessagingSessionRecord {
  id: string;
  name: string;
  status: string | null;
  channelType: string | null;
  channelName: string | null;
  origin: string | null;
  startTime: string | null;
  endTime: string | null;
  caseId: string | null;
  contactId: string | null;
  contactName: string | null;
  createdDate: string | null;
}

export interface ChannelActivity {
  id: string;
  kind: 'voice' | 'messaging';
  name: string;
  detail: string;
  createdDate: string | null;
}

export async function getCaseDetail(id: string): Promise<CaseRecord | null> {
  const data = await runQuery<GetCaseDetailQuery, GetCaseDetailQueryVariables>(GET_CASE_DETAIL, { id });
  const node = nodes(data.uiapi.query.Case)[0];
  if (!node) {
    return null;
  }
  const contact = node.Contact;
  const account = node.Account;
  return {
    id: node.Id,
    caseNumber: str(node.CaseNumber),
    subject: str(node.Subject),
    description: str(node.Description),
    status: str(node.Status),
    priority: str(node.Priority),
    origin: val(node.Origin),
    type: val(node.Type),
    reason: val(node.Reason),
    isEscalated: val(node.IsEscalated) === true,
    isClosed: val(node.IsClosed) === true,
    createdDate: val(node.CreatedDate),
    lastModifiedDate: val(node.LastModifiedDate),
    closedDate: val(node.ClosedDate),
    ownerId: val(node.OwnerId),
    ownerName: str(node.Owner?.Name),
    contact: contact
      ? {
          id: contact.Id,
          name: str(contact.Name),
          email: val(contact.Email),
          phone: val(contact.Phone) ?? val(contact.MobilePhone),
          title: val(contact.Title),
          city: val(contact.MailingCity),
        }
      : null,
    account: account
      ? {
          id: account.Id,
          name: str(account.Name),
          industry: account.Industry?.displayValue ?? val(account.Industry),
          type: account.Type?.displayValue ?? val(account.Type),
          phone: val(account.Phone),
          annualRevenue: account.AnnualRevenue?.displayValue ?? null,
          employees: val(account.NumberOfEmployees),
          city: val(account.BillingCity),
          rating: account.Rating?.displayValue ?? val(account.Rating),
        }
      : null,
    comments: nodes(node.CaseComments).map(c => ({
      id: c.Id,
      body: str(c.CommentBody),
      isPublished: val(c.IsPublished) === true,
      createdDate: val(c.CreatedDate),
      createdBy: str(c.CreatedBy?.Name),
    })),
    tasks: nodes(node.Tasks).map(t => ({
      id: t.Id,
      subject: str(t.Subject),
      status: val(t.Status),
      activityDate: val(t.ActivityDate),
      subtype: val(t.TaskSubtype),
      createdDate: val(t.CreatedDate),
    })),
  };
}

export async function getAccountCases(accountId: string, excludeId: string): Promise<{ total: number; cases: CaseListItem[] }> {
  const data = await runQuery<GetAccountCasesQuery, GetAccountCasesQueryVariables>(GET_ACCOUNT_CASES, {
    accountId,
    excludeId,
  });
  const connection = data.uiapi.query.Case;
  return {
    total: connection?.totalCount ?? 0,
    cases: nodes(connection).map(c => ({
      id: c.Id,
      caseNumber: str(c.CaseNumber),
      subject: str(c.Subject),
      status: str(c.Status),
      priority: str(c.Priority),
      origin: null,
      createdDate: val(c.CreatedDate),
      contactName: null,
    })),
  };
}

export async function getMyOpenCases(ownerId: string): Promise<{ total: number; cases: CaseListItem[] }> {
  const data = await runQuery<GetMyOpenCasesQuery, GetMyOpenCasesQueryVariables>(GET_MY_OPEN_CASES, { ownerId });
  const connection = data.uiapi.query.Case;
  return {
    total: connection?.totalCount ?? 0,
    cases: nodes(connection).map(c => ({
      id: c.Id,
      caseNumber: str(c.CaseNumber),
      subject: str(c.Subject),
      status: str(c.Status),
      priority: str(c.Priority),
      origin: val(c.Origin),
      createdDate: val(c.CreatedDate),
      contactName: val(c.Contact?.Name),
    })),
  };
}

export async function getVoiceCall(id: string): Promise<VoiceCallRecord | null> {
  const data = await runQuery<GetVoiceCallQuery, GetVoiceCallQueryVariables>(GET_VOICE_CALL, { id });
  const node = nodes(data.uiapi.query.VoiceCall)[0];
  if (!node) {
    return null;
  }
  return {
    id: node.Id,
    name: str(node.Name),
    callType: node.CallType?.displayValue ?? val(node.CallType),
    startTime: val(node.CallStartDateTime),
    durationSeconds: val(node.CallDurationInSeconds),
    fromNumber: val(node.FromPhoneNumber),
    toNumber: val(node.ToPhoneNumber),
    disposition: val(node.CallDisposition),
    resolution: val(node.CallResolution),
    relatedRecordId: val(node.RelatedRecordId),
    createdDate: val(node.CreatedDate),
  };
}

export async function getMessagingSession(id: string): Promise<MessagingSessionRecord | null> {
  const data = await runQuery<GetMessagingSessionQuery, GetMessagingSessionQueryVariables>(GET_MESSAGING_SESSION, { id });
  const node = nodes(data.uiapi.query.MessagingSession)[0];
  if (!node) {
    return null;
  }
  return {
    id: node.Id,
    name: str(node.Name),
    status: node.Status?.displayValue ?? val(node.Status),
    channelType: node.ChannelType?.displayValue ?? val(node.ChannelType),
    channelName: val(node.ChannelName),
    origin: node.Origin?.displayValue ?? val(node.Origin),
    startTime: val(node.StartTime),
    endTime: val(node.EndTime),
    caseId: val(node.CaseId),
    contactId: node.EndUserContact?.Id ?? null,
    contactName: val(node.EndUserContact?.Name),
    createdDate: val(node.CreatedDate),
  };
}

export async function getWorkIdBySource(sourceId: string): Promise<string | null> {
  const data = await runQuery<GetWorkBySourceQuery, GetWorkBySourceQueryVariables>(GET_WORK_BY_SOURCE, { sourceId });
  return nodes(data.uiapi.query.SLK_Work_Item__c)[0]?.Id ?? null;
}

export async function getRecentChannelActivity(): Promise<ChannelActivity[]> {
  const data = await runQuery<GetRecentChannelActivityQuery, GetRecentChannelActivityQueryVariables>(
    GET_RECENT_CHANNEL_ACTIVITY,
    {}
  );
  const voice: ChannelActivity[] = nodes(data.uiapi.query.VoiceCall).map(v => ({
    id: v.Id,
    kind: 'voice',
    name: str(v.Name),
    detail: [val(v.CallType), val(v.FromPhoneNumber)].filter(Boolean).join(' · '),
    createdDate: val(v.CreatedDate),
  }));
  const messaging: ChannelActivity[] = nodes(data.uiapi.query.MessagingSession).map(m => ({
    id: m.Id,
    kind: 'messaging',
    name: str(m.Name),
    detail: [m.ChannelType?.displayValue ?? val(m.ChannelType), val(m.EndUserContact?.Name)].filter(Boolean).join(' · '),
    createdDate: val(m.CreatedDate),
  }));
  return [...voice, ...messaging].sort((a, b) => (b.createdDate ?? '').localeCompare(a.createdDate ?? ''));
}

export async function updateCase(id: string, fields: { Status?: string; Priority?: string }): Promise<void> {
  await runMutation<UpdateCaseMutation, UpdateCaseMutationVariables>(UPDATE_CASE, { input: { Id: id, Case: fields } });
}

export async function addCaseComment(caseId: string, body: string, isPublished = false): Promise<void> {
  await runMutation<CreateCaseCommentMutation, CreateCaseCommentMutationVariables>(CREATE_CASE_COMMENT, {
    input: { CaseComment: { ParentId: caseId, CommentBody: body, IsPublished: isPublished } },
  });
}
