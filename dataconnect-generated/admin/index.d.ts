import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface GetDeploymentStatusData {
  schoolhouseDeployment?: {
    environment: string;
    schemaVersion: string;
    updatedAt: TimestampString;
  };
}

export interface SchoolhouseDeployment_Key {
  id: string;
  __typename?: 'SchoolhouseDeployment_Key';
}

export interface UpsertDeploymentStatusData {
  schoolhouseDeployment_upsert: SchoolhouseDeployment_Key;
}

export interface UpsertDeploymentStatusVariables {
  environment: string;
  schemaVersion: string;
}

/** Generated Node Admin SDK operation action function for the 'GetDeploymentStatus' Query. Allow users to execute without passing in DataConnect. */
export function getDeploymentStatus(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<GetDeploymentStatusData>>;
/** Generated Node Admin SDK operation action function for the 'GetDeploymentStatus' Query. Allow users to pass in custom DataConnect instances. */
export function getDeploymentStatus(options?: OperationOptions): Promise<ExecuteOperationResponse<GetDeploymentStatusData>>;

/** Generated Node Admin SDK operation action function for the 'UpsertDeploymentStatus' Mutation. Allow users to execute without passing in DataConnect. */
export function upsertDeploymentStatus(dc: DataConnect, vars: UpsertDeploymentStatusVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpsertDeploymentStatusData>>;
/** Generated Node Admin SDK operation action function for the 'UpsertDeploymentStatus' Mutation. Allow users to pass in custom DataConnect instances. */
export function upsertDeploymentStatus(vars: UpsertDeploymentStatusVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpsertDeploymentStatusData>>;

