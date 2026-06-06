import { createContext, useContext } from 'react';
import { AuthUserPublic } from '../api';

export interface SchoolSessionContext {
  sessionUser: AuthUserPublic;
}

const ctx = createContext<SchoolSessionContext | null>(null);

export const SchoolSessionProvider = ctx.Provider;

export function useSchoolSession(): SchoolSessionContext {
  const value = useContext(ctx);
  if (!value) {
    throw new Error('useSchoolSession must be used within SchoolSessionProvider');
  }
  return value;
}
