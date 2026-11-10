export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Base64: { input: string; output: string; }
  Currency: { input: number | string; output: number; }
  Date: { input: string; output: string; }
  DateTime: { input: string; output: string; }
  Double: { input: number | string; output: number; }
  Email: { input: string; output: string; }
  EncryptedString: { input: string; output: string; }
  /** Can be set to an ID or a Reference to the result of another mutation operation. */
  IdOrRef: { input: string; output: string; }
  JSON: { input: string; output: string; }
  Latitude: { input: number | string; output: number; }
  /** A 64-bit signed integer */
  Long: { input: number; output: number; }
  LongTextArea: { input: string; output: string; }
  Longitude: { input: number | string; output: number; }
  MultiPicklist: { input: string; output: string; }
  Percent: { input: number | string; output: number; }
  PhoneNumber: { input: string; output: string; }
  Picklist: { input: string; output: string; }
  RichTextArea: { input: string; output: string; }
  TextArea: { input: string; output: string; }
  Time: { input: string; output: string; }
  Url: { input: string; output: string; }
};

export type CaseCommentCreateInput = {
  CaseComment: CaseCommentCreateRepresentation;
};

export type CaseCommentCreateRepresentation = {
  CommentBody?: InputMaybe<Scalars['LongTextArea']['input']>;
  CommentBodyRichtext?: InputMaybe<Scalars['RichTextArea']['input']>;
  CreatedById?: InputMaybe<Scalars['IdOrRef']['input']>;
  CreatedDate?: InputMaybe<Scalars['DateTime']['input']>;
  IsPublished?: InputMaybe<Scalars['Boolean']['input']>;
  LastModifiedById?: InputMaybe<Scalars['IdOrRef']['input']>;
  LastModifiedDate?: InputMaybe<Scalars['DateTime']['input']>;
  ParentId?: InputMaybe<Scalars['IdOrRef']['input']>;
};

export type CaseUpdateInput = {
  Case: CaseUpdateRepresentation;
  Id: Scalars['IdOrRef']['input'];
};

export type CaseUpdateRepresentation = {
  AI_Brief_Generated_At__c?: InputMaybe<Scalars['DateTime']['input']>;
  AI_Brief_Model__c?: InputMaybe<Scalars['String']['input']>;
  AI_Classification_Summary__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  AI_Triage_Brief__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  ANTH_Client_Version__c?: InputMaybe<Scalars['String']['input']>;
  ANTH_Component__c?: InputMaybe<Scalars['String']['input']>;
  ANTH_Org_Id__c?: InputMaybe<Scalars['String']['input']>;
  ANTH_Product_Line__c?: InputMaybe<Scalars['Picklist']['input']>;
  ANTH_Repeat_Escalation__c?: InputMaybe<Scalars['Boolean']['input']>;
  ANTH_Resolution_Path__c?: InputMaybe<Scalars['Picklist']['input']>;
  ANTH_Support_Tier__c?: InputMaybe<Scalars['Picklist']['input']>;
  ANTH_Surface__c?: InputMaybe<Scalars['String']['input']>;
  AccountId?: InputMaybe<Scalars['IdOrRef']['input']>;
  Amazon_Carrier__c?: InputMaybe<Scalars['Picklist']['input']>;
  Amazon_Category__c?: InputMaybe<Scalars['Picklist']['input']>;
  Amazon_Fulfillment_Center__c?: InputMaybe<Scalars['String']['input']>;
  Amazon_Item__c?: InputMaybe<Scalars['String']['input']>;
  Amazon_Membership__c?: InputMaybe<Scalars['Picklist']['input']>;
  Amazon_Order_Id__c?: InputMaybe<Scalars['String']['input']>;
  Amazon_Order_Value__c?: InputMaybe<Scalars['Currency']['input']>;
  Amazon_Refund_Amount__c?: InputMaybe<Scalars['Currency']['input']>;
  Amazon_Repeat_Contact__c?: InputMaybe<Scalars['Boolean']['input']>;
  Amazon_Resolution__c?: InputMaybe<Scalars['Picklist']['input']>;
  AssetId?: InputMaybe<Scalars['IdOrRef']['input']>;
  AssetWarrantyId?: InputMaybe<Scalars['IdOrRef']['input']>;
  BusinessHoursId?: InputMaybe<Scalars['IdOrRef']['input']>;
  CSAT__c?: InputMaybe<Scalars['Double']['input']>;
  Case_Assignment_Timestamp__c?: InputMaybe<Scalars['DateTime']['input']>;
  Case_Feedback__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  ClosedDate__c?: InputMaybe<Scalars['DateTime']['input']>;
  Comments?: InputMaybe<Scalars['LongTextArea']['input']>;
  ContactId?: InputMaybe<Scalars['IdOrRef']['input']>;
  CreatedDate__c?: InputMaybe<Scalars['DateTime']['input']>;
  CurrencyIsoCode?: InputMaybe<Scalars['Picklist']['input']>;
  DB_Case_Duration_Hours__c?: InputMaybe<Scalars['Double']['input']>;
  DB_Hours__c?: InputMaybe<Scalars['Double']['input']>;
  DateTime_Closed_c__c?: InputMaybe<Scalars['DateTime']['input']>;
  DateTime_Opened_c__c?: InputMaybe<Scalars['DateTime']['input']>;
  Dell_Component__c?: InputMaybe<Scalars['String']['input']>;
  Dell_Dispatch__c?: InputMaybe<Scalars['Picklist']['input']>;
  Dell_Firmware_Version__c?: InputMaybe<Scalars['String']['input']>;
  Dell_Model__c?: InputMaybe<Scalars['String']['input']>;
  Dell_Product_Line__c?: InputMaybe<Scalars['Picklist']['input']>;
  Dell_Repeat_Dispatch__c?: InputMaybe<Scalars['Boolean']['input']>;
  Dell_Service_Tag__c?: InputMaybe<Scalars['String']['input']>;
  Dell_Support_Tier__c?: InputMaybe<Scalars['Picklist']['input']>;
  Description?: InputMaybe<Scalars['LongTextArea']['input']>;
  EDY_ORGCUSTOM__DB__c?: InputMaybe<Scalars['Boolean']['input']>;
  EDY_ORGCUSTOM__Old_Description__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  EDY_ORGCUSTOM__Old_Subject__c?: InputMaybe<Scalars['String']['input']>;
  EntitlementId?: InputMaybe<Scalars['IdOrRef']['input']>;
  External_ID__c?: InputMaybe<Scalars['String']['input']>;
  First_Contact_Close__c?: InputMaybe<Scalars['Boolean']['input']>;
  HH_Component__c?: InputMaybe<Scalars['String']['input']>;
  HH_Item__c?: InputMaybe<Scalars['String']['input']>;
  HH_Lot__c?: InputMaybe<Scalars['String']['input']>;
  HH_Loyalty_Tier__c?: InputMaybe<Scalars['Picklist']['input']>;
  HH_Order_Number__c?: InputMaybe<Scalars['String']['input']>;
  HH_Product_Line__c?: InputMaybe<Scalars['Picklist']['input']>;
  HH_Repeat_Contact__c?: InputMaybe<Scalars['Boolean']['input']>;
  HH_Resolution__c?: InputMaybe<Scalars['Picklist']['input']>;
  IsClosedOnCreate?: InputMaybe<Scalars['Boolean']['input']>;
  IsEscalated?: InputMaybe<Scalars['Boolean']['input']>;
  IsSelfServiceClosed?: InputMaybe<Scalars['Boolean']['input']>;
  IsStopped?: InputMaybe<Scalars['Boolean']['input']>;
  IsVisibleInSelfService?: InputMaybe<Scalars['Boolean']['input']>;
  Issue_Signature__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  LN_Event__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  LN_Issue_Type__c?: InputMaybe<Scalars['Picklist']['input']>;
  LN_Ticket_Order__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  Language?: InputMaybe<Scalars['Picklist']['input']>;
  Log_Analysis__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  MilestoneStatus__c?: InputMaybe<Scalars['String']['input']>;
  NVDA_Component__c?: InputMaybe<Scalars['String']['input']>;
  NVDA_Platform__c?: InputMaybe<Scalars['String']['input']>;
  NVDA_Product_Line__c?: InputMaybe<Scalars['Picklist']['input']>;
  NVDA_Repeat_Escalation__c?: InputMaybe<Scalars['Boolean']['input']>;
  NVDA_Resolution_Path__c?: InputMaybe<Scalars['Picklist']['input']>;
  NVDA_Serial_Number__c?: InputMaybe<Scalars['String']['input']>;
  NVDA_Software_Version__c?: InputMaybe<Scalars['String']['input']>;
  NVDA_Support_Tier__c?: InputMaybe<Scalars['Picklist']['input']>;
  Offer_Voucher__c?: InputMaybe<Scalars['Boolean']['input']>;
  Opportunity__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  Origin?: InputMaybe<Scalars['Picklist']['input']>;
  OwnerId?: InputMaybe<Scalars['IdOrRef']['input']>;
  PANW_Component__c?: InputMaybe<Scalars['String']['input']>;
  PANW_Platform__c?: InputMaybe<Scalars['String']['input']>;
  PANW_Product_Line__c?: InputMaybe<Scalars['Picklist']['input']>;
  PANW_Repeat_Escalation__c?: InputMaybe<Scalars['Boolean']['input']>;
  PANW_Resolution_Path__c?: InputMaybe<Scalars['Picklist']['input']>;
  PANW_Serial_Number__c?: InputMaybe<Scalars['String']['input']>;
  PANW_Software_Version__c?: InputMaybe<Scalars['String']['input']>;
  PANW_Support_Tier__c?: InputMaybe<Scalars['Picklist']['input']>;
  PP_Device_Fingerprint__c?: InputMaybe<Scalars['String']['input']>;
  PP_Dispute_Summary__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  PP_Fraud_Case_Type__c?: InputMaybe<Scalars['String']['input']>;
  PP_Fraud_Signals__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  PP_Payment_Account__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  ParentId?: InputMaybe<Scalars['IdOrRef']['input']>;
  Priority?: InputMaybe<Scalars['Picklist']['input']>;
  ProductId?: InputMaybe<Scalars['IdOrRef']['input']>;
  Product_Family_KB__c?: InputMaybe<Scalars['Picklist']['input']>;
  Reason?: InputMaybe<Scalars['Picklist']['input']>;
  RecordTypeId?: InputMaybe<Scalars['IdOrRef']['input']>;
  SDO_Analytics_Demo_Closed_Date__c?: InputMaybe<Scalars['DateTime']['input']>;
  SDO_Article_Helpful_Reason__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  SDO_Article_Helpful__c?: InputMaybe<Scalars['Picklist']['input']>;
  SDO_Einstein_Discovery_Leading_Causes__c?: InputMaybe<Scalars['RichTextArea']['input']>;
  SDO_Einstein_Discovery_Outcome__c?: InputMaybe<Scalars['Double']['input']>;
  SDO_Einstein_Discovery_Prescription__c?: InputMaybe<Scalars['RichTextArea']['input']>;
  SDO_OMS_Order_Summary__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  SDO_Quality_Score__c?: InputMaybe<Scalars['Double']['input']>;
  SDO_SFS_City__c?: InputMaybe<Scalars['String']['input']>;
  SDO_SFS_Country__c?: InputMaybe<Scalars['String']['input']>;
  SDO_SFS_State__c?: InputMaybe<Scalars['String']['input']>;
  SDO_SFS_Street__c?: InputMaybe<Scalars['String']['input']>;
  SDO_SFS_Work_Type__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  SDO_SFS_Zip__c?: InputMaybe<Scalars['String']['input']>;
  SDO_Servcie_Response_Time_mins__c?: InputMaybe<Scalars['Double']['input']>;
  SDO_Service_Article_Created__c?: InputMaybe<Scalars['Boolean']['input']>;
  SDO_Service_ChatKey__c?: InputMaybe<Scalars['String']['input']>;
  SDO_Service_Close_Summary__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  SDO_Service_Contact_Reason__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  SDO_Service_Customer_Type__c?: InputMaybe<Scalars['Picklist']['input']>;
  SDO_Service_Est_Cost__c?: InputMaybe<Scalars['Double']['input']>;
  SDO_Service_NBA_to_Display__c?: InputMaybe<Scalars['String']['input']>;
  SDO_Service_Resolution__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  SDO_Service_SLA_Compliant__c?: InputMaybe<Scalars['Boolean']['input']>;
  SDO_Service_SLA_Type__c?: InputMaybe<Scalars['Picklist']['input']>;
  SDO_Service_Send_Email_Trigger__c?: InputMaybe<Scalars['Boolean']['input']>;
  SDO_Service_Surveys_CSAT_Score__c?: InputMaybe<Scalars['Double']['input']>;
  SDO_Service_Surveys_Comment__c?: InputMaybe<Scalars['TextArea']['input']>;
  SDO_Service_Surveys_NPS_Score__c?: InputMaybe<Scalars['Double']['input']>;
  SDO_Service_Surveys_NPS__c?: InputMaybe<Scalars['String']['input']>;
  SDO_Service_Territory__c?: InputMaybe<Scalars['IdOrRef']['input']>;
  SDO_Sub_Type__c?: InputMaybe<Scalars['Picklist']['input']>;
  SDO_Survey_CSAT__c?: InputMaybe<Scalars['String']['input']>;
  SDO_Volume__c?: InputMaybe<Scalars['Double']['input']>;
  Send_FieldService__c?: InputMaybe<Scalars['Boolean']['input']>;
  ServiceContractId?: InputMaybe<Scalars['IdOrRef']['input']>;
  SlaStartDate?: InputMaybe<Scalars['DateTime']['input']>;
  Slack_Channel_Id__c?: InputMaybe<Scalars['String']['input']>;
  Slack_Channel_Name__c?: InputMaybe<Scalars['String']['input']>;
  Slack_Last_Error__c?: InputMaybe<Scalars['String']['input']>;
  Slack_Sync_State__c?: InputMaybe<Scalars['String']['input']>;
  Slack_Thread_Ts__c?: InputMaybe<Scalars['String']['input']>;
  SourceId?: InputMaybe<Scalars['IdOrRef']['input']>;
  Status?: InputMaybe<Scalars['Picklist']['input']>;
  Subject?: InputMaybe<Scalars['String']['input']>;
  SuppliedCompany?: InputMaybe<Scalars['String']['input']>;
  SuppliedEmail?: InputMaybe<Scalars['Email']['input']>;
  SuppliedName?: InputMaybe<Scalars['String']['input']>;
  SuppliedPhone?: InputMaybe<Scalars['String']['input']>;
  Teams_Customer_Update__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  Teams_Handoff_Status__c?: InputMaybe<Scalars['String']['input']>;
  Teams_Handoff_To__c?: InputMaybe<Scalars['String']['input']>;
  Teams_Request_Key__c?: InputMaybe<Scalars['String']['input']>;
  Time_Open__c?: InputMaybe<Scalars['Double']['input']>;
  Type?: InputMaybe<Scalars['Picklist']['input']>;
  Type_of_Support__c?: InputMaybe<Scalars['Picklist']['input']>;
  db_hours_DateTime_Closed_c__c?: InputMaybe<Scalars['Double']['input']>;
  db_hours_DateTime_Opened_c__c?: InputMaybe<Scalars['Double']['input']>;
  demoRecommendations__c?: InputMaybe<Scalars['LongTextArea']['input']>;
  inov8__PMT_Project__c?: InputMaybe<Scalars['IdOrRef']['input']>;
};

export enum DataType {
  Address = 'ADDRESS',
  Anytype = 'ANYTYPE',
  Base64 = 'BASE64',
  Boolean = 'BOOLEAN',
  Combobox = 'COMBOBOX',
  Complexvalue = 'COMPLEXVALUE',
  Currency = 'CURRENCY',
  Date = 'DATE',
  Datetime = 'DATETIME',
  Double = 'DOUBLE',
  Email = 'EMAIL',
  Encryptedstring = 'ENCRYPTEDSTRING',
  Int = 'INT',
  Json = 'JSON',
  Junctionidlist = 'JUNCTIONIDLIST',
  Location = 'LOCATION',
  Long = 'LONG',
  Multipicklist = 'MULTIPICKLIST',
  Percent = 'PERCENT',
  Phone = 'PHONE',
  Picklist = 'PICKLIST',
  Reference = 'REFERENCE',
  String = 'STRING',
  Textarea = 'TEXTAREA',
  Time = 'TIME',
  Url = 'URL'
}

export enum FieldExtraTypeInfo {
  ExternalLookup = 'EXTERNAL_LOOKUP',
  ImageUrl = 'IMAGE_URL',
  IndirectLookup = 'INDIRECT_LOOKUP',
  Personname = 'PERSONNAME',
  Plaintextarea = 'PLAINTEXTAREA',
  Richtextarea = 'RICHTEXTAREA',
  SwitchablePersonname = 'SWITCHABLE_PERSONNAME'
}

export enum FormFactor {
  Large = 'LARGE',
  Medium = 'MEDIUM',
  Small = 'SMALL'
}

export enum LayoutComponentType {
  Canvas = 'CANVAS',
  CustomLink = 'CUSTOM_LINK',
  EmptySpace = 'EMPTY_SPACE',
  Field = 'FIELD',
  ReportChart = 'REPORT_CHART',
  VisualforcePage = 'VISUALFORCE_PAGE'
}

export enum LayoutMode {
  Create = 'CREATE',
  Edit = 'EDIT',
  View = 'VIEW'
}

export enum LayoutType {
  Compact = 'COMPACT',
  Full = 'FULL'
}

export enum ResultOrder {
  Asc = 'ASC',
  Desc = 'DESC'
}

export enum TabOrder {
  LeftRight = 'LEFT_RIGHT',
  TopDown = 'TOP_DOWN'
}

export enum UiBehavior {
  Edit = 'EDIT',
  Readonly = 'READONLY',
  Required = 'REQUIRED'
}

export type CreateCaseCommentMutationVariables = Exact<{
  input: CaseCommentCreateInput;
}>;


export type CreateCaseCommentMutation = { uiapi: { CaseCommentCreate?: { Record?: { Id: string } | null } | null } };

export type UpdateCaseMutationVariables = Exact<{
  input: CaseUpdateInput;
}>;


export type UpdateCaseMutation = { uiapi: { CaseUpdate?: { Record?: { Id: string, Status?: { value?: string | null } | null, Priority?: { value?: string | null } | null } | null } | null } };

export type GetAccountCasesQueryVariables = Exact<{
  accountId: Scalars['ID']['input'];
  excludeId: Scalars['ID']['input'];
}>;


export type GetAccountCasesQuery = { uiapi: { query: { Case?: { totalCount: number, edges?: Array<{ node?: { Id: string, CaseNumber?: { value?: string | null } | null, Subject?: { value?: string | null } | null, Status?: { value?: string | null } | null, Priority?: { value?: string | null } | null, CreatedDate?: { value?: string | null } | null } | null } | null> | null } | null } } };

export type GetCaseDetailQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetCaseDetailQuery = { uiapi: { query: { Case?: { edges?: Array<{ node?: { Id: string, CaseNumber?: { value?: string | null } | null, Subject?: { value?: string | null } | null, Description?: { value?: string | null } | null, Status?: { value?: string | null, displayValue?: string | null } | null, Priority?: { value?: string | null, displayValue?: string | null } | null, Origin?: { value?: string | null, displayValue?: string | null } | null, Type?: { value?: string | null, displayValue?: string | null } | null, Reason?: { value?: string | null, displayValue?: string | null } | null, IsEscalated?: { value?: boolean | null } | null, IsClosed?: { value?: boolean | null } | null, CreatedDate?: { value?: string | null } | null, LastModifiedDate?: { value?: string | null } | null, ClosedDate?: { value?: string | null } | null, OwnerId?: { value?: string | null } | null, Owner?:
              | { Id: string, Name?: { value?: string | null } | null }
              | { Id: string, Name?: { value?: string | null } | null }
             | null, ContactId?: { value?: string | null } | null, Contact?: { Id: string, Name?: { value?: string | null } | null, Email?: { value?: string | null } | null, Phone?: { value?: string | null } | null, MobilePhone?: { value?: string | null } | null, Title?: { value?: string | null } | null, MailingCity?: { value?: string | null } | null } | null, AccountId?: { value?: string | null } | null, Account?: { Id: string, Name?: { value?: string | null } | null, Industry?: { value?: string | null, displayValue?: string | null } | null, Type?: { value?: string | null, displayValue?: string | null } | null, Phone?: { value?: string | null } | null, AnnualRevenue?: { value?: number | null, displayValue?: string | null } | null, NumberOfEmployees?: { value?: number | null } | null, BillingCity?: { value?: string | null } | null, Rating?: { value?: string | null, displayValue?: string | null } | null } | null, CaseComments?: { edges?: Array<{ node?: { Id: string, CommentBody?: { value?: string | null } | null, IsPublished?: { value?: boolean | null } | null, CreatedDate?: { value?: string | null } | null, CreatedBy?: { Name?: { value?: string | null } | null } | null } | null } | null> | null } | null, Tasks?: { edges?: Array<{ node?: { Id: string, Subject?: { value?: string | null } | null, Status?: { value?: string | null } | null, ActivityDate?: { value?: string | null } | null, TaskSubtype?: { value?: string | null } | null, CreatedDate?: { value?: string | null } | null } | null } | null> | null } | null } | null } | null> | null } | null } } };

export type CaseOwnerUserFragment = { Id: string, Name?: { value?: string | null } | null };

export type CaseOwnerGroupFragment = { Id: string, Name?: { value?: string | null } | null };

export type GetMessagingSessionQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetMessagingSessionQuery = { uiapi: { query: { MessagingSession?: { edges?: Array<{ node?: { Id: string, Name?: { value?: string | null } | null, Status?: { value?: string | null, displayValue?: string | null } | null, ChannelType?: { value?: string | null, displayValue?: string | null } | null, ChannelName?: { value?: string | null } | null, Origin?: { value?: string | null, displayValue?: string | null } | null, StartTime?: { value?: string | null } | null, EndTime?: { value?: string | null } | null, CaseId?: { value?: string | null } | null, EndUserContact?: { Id: string, Name?: { value?: string | null } | null } | null, CreatedDate?: { value?: string | null } | null } | null } | null> | null } | null } } };

export type GetMyOpenCasesQueryVariables = Exact<{
  ownerId: Scalars['ID']['input'];
}>;


export type GetMyOpenCasesQuery = { uiapi: { query: { Case?: { totalCount: number, edges?: Array<{ node?: { Id: string, CaseNumber?: { value?: string | null } | null, Subject?: { value?: string | null } | null, Status?: { value?: string | null } | null, Priority?: { value?: string | null } | null, Origin?: { value?: string | null } | null, CreatedDate?: { value?: string | null } | null, Contact?: { Name?: { value?: string | null } | null } | null } | null } | null> | null } | null } } };

export type GetRecentChannelActivityQueryVariables = Exact<{ [key: string]: never; }>;


export type GetRecentChannelActivityQuery = { uiapi: { query: { VoiceCall?: { totalCount: number, edges?: Array<{ node?: { Id: string, Name?: { value?: string | null } | null, CallType?: { value?: string | null } | null, CallDurationInSeconds?: { value?: number | null } | null, FromPhoneNumber?: { value?: string | null } | null, CreatedDate?: { value?: string | null } | null } | null } | null> | null } | null, MessagingSession?: { totalCount: number, edges?: Array<{ node?: { Id: string, Name?: { value?: string | null } | null, Status?: { value?: string | null } | null, ChannelType?: { value?: string | null, displayValue?: string | null } | null, CreatedDate?: { value?: string | null } | null, EndUserContact?: { Name?: { value?: string | null } | null } | null } | null } | null> | null } | null } } };

export type GetVoiceCallQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetVoiceCallQuery = { uiapi: { query: { VoiceCall?: { edges?: Array<{ node?: { Id: string, Name?: { value?: string | null } | null, CallType?: { value?: string | null, displayValue?: string | null } | null, CallStartDateTime?: { value?: string | null } | null, CallDurationInSeconds?: { value?: number | null } | null, FromPhoneNumber?: { value?: string | null } | null, ToPhoneNumber?: { value?: string | null } | null, CallDisposition?: { value?: string | null } | null, CallResolution?: { value?: string | null } | null, RelatedRecordId?: { value?: string | null } | null, CreatedDate?: { value?: string | null } | null } | null } | null> | null } | null } } };

export type GetWorkBySourceQueryVariables = Exact<{
  sourceId: Scalars['String']['input'];
}>;


export type GetWorkBySourceQuery = { uiapi: { query: { SLK_Work_Item__c?: { edges?: Array<{ node?: { Id: string, Case__c?: { value?: string | null } | null } | null } | null> | null } | null } } };
