import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

interface AuthContextValue {
  user: User
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const useFirebaseUser = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useFirebaseUser must be used within FirebaseAuthProvider.')
  return context
}