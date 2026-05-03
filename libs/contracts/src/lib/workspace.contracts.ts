export interface WorkspaceDto {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export interface CreateWorkspaceDto {
  name: string;
}

export interface UpdateWorkspaceDto {
  name?: string;
}
