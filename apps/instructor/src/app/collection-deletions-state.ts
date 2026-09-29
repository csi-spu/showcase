export type CollectionDeletionsErrorMessage =
  | 'alreadyRestored'
  | 'ancestorDeleted'
  | 'confirmationMismatch'
  | 'deletionNotFound'
  | 'invalid'
  | 'notFound'
  | 'restoreReasonInvalid'
  | 'roundClosed'
  | 'sessionExpired'
  | 'unavailable';

/* The deleted ancestor a restore waits on, when the error is `ancestorDeleted`. */
export interface DeletedAncestor {
  kind: 'group' | 'round';
  name: string;
}

export interface DeleteCollectionItemActionState {
  deletionId: string | null;
  error: CollectionDeletionsErrorMessage | null;
}

export interface RestoreCollectionDeletionActionState {
  ancestor: DeletedAncestor | null;
  error: CollectionDeletionsErrorMessage | null;
  isRestored: boolean;
}

export const INITIAL_DELETE_COLLECTION_ITEM_STATE: DeleteCollectionItemActionState = {
  deletionId: null,
  error: null,
};

export const INITIAL_RESTORE_COLLECTION_DELETION_STATE: RestoreCollectionDeletionActionState = {
  ancestor: null,
  error: null,
  isRestored: false,
};

export type DeleteCollectionItemAction = (
  previousState: DeleteCollectionItemActionState,
  formData: FormData,
) => Promise<DeleteCollectionItemActionState>;

export type RestoreCollectionDeletionAction = (
  previousState: RestoreCollectionDeletionActionState,
  formData: FormData,
) => Promise<RestoreCollectionDeletionActionState>;
