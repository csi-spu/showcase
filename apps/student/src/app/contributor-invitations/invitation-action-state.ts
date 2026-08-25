export interface InvitationActionState {
  error: 'conflict' | 'invalid' | 'network' | 'unavailable' | null;
  invitationPath?: string;
  recoveryCode?: string;
  success: boolean;
}

export function initialInvitationActionState(): InvitationActionState {
  return { error: null, success: false };
}
