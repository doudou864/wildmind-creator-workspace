export type LoginState = 'logged_in' | 'logged_out' | 'unknown' | 'awaiting_confirmation';
export type LoginResult = {
  platformId: string;
  state: LoginState;
  reason: string;
  checkedAt: string;
  statePath: string | null;
  spaceId?: number;
  page?: string;
};
export interface WorkspaceBrowser {
  openLogin(platformId: string): Promise<{ spaceId: number; page: string; result?: LoginResult }>;
  finishLogin(platformId: string, spaceId: number, page: string): Promise<LoginResult>;
  checkLogins(platformIds?: string[]): Promise<LoginResult[]>;
}
