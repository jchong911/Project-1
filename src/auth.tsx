import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { ArrowRight, Cloud, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { auth, firebaseConfigured } from './firebase'
import { AuthContext } from './authContext'
import './auth.css'

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!firebaseConfigured)

  useEffect(() => {
    if (!auth || !firebaseConfigured) return
    return onAuthStateChanged(auth, (activeUser) => {
      setUser(activeUser)
      setReady(true)
    })
  }, [])

  const configuredAuth = auth
  if (!firebaseConfigured || !configuredAuth) return <FirebaseSetup />
  if (!ready) return <AuthLoading />
  if (!user) return <AuthenticationScreen />

  return <AuthContext.Provider value={{ user, signOut: () => signOut(configuredAuth) }}>{children}</AuthContext.Provider>
}

function AuthenticationScreen() {
  const [isCreating, setIsCreating] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auth) return
    const values = new FormData(event.currentTarget)
    const email = String(values.get('email')).trim()
    const password = String(values.get('password'))
    setError('')
    setSuccessMessage('')
    setIsSubmitting(true)
    try {
      if (isResetting) {
        await sendPasswordResetEmail(auth, email)
        setSuccessMessage('Password reset email sent. Check your inbox and spam folder.')
      } else if (isCreating) {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (caught) {
      const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : ''
      setError(authErrorMessage(code))
    } finally {
      setIsSubmitting(false)
    }
  }

  const signInWithGoogle = async () => {
    if (!auth) return
    setError('')
    setSuccessMessage('')
    setIsSubmitting(true)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (caught) {
      setError(authErrorMessage(caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : ''))
    } finally {
      setIsSubmitting(false)
    }
  }

  const switchMode = (nextMode: 'normal' | 'reset') => {
    setIsResetting(nextMode === 'reset')
    setIsCreating(false)
    setError('')
    setSuccessMessage('')
  }

  return (
    <main className="access-screen">
      <section className="access-panel">
        <BrandMark />
        <p className="section-kicker">YOUR MONEY, ON YOUR TERMS</p>
        <h1>{isResetting ? 'Reset your password.' : isCreating ? 'Create your account.' : 'Welcome back.'}</h1>
        <p className="access-description">
          {isResetting
            ? 'Enter the email linked to your account and we’ll send a secure reset link.'
            : 'Sign in to keep your budget available across your devices.'}
        </p>
        <form className="access-form" onSubmit={submit}>
          <label>Email address<input type="email" name="email" autoComplete="email" required /></label>
          {!isResetting && <label>Password<input type="password" name="password" autoComplete={isCreating ? 'new-password' : 'current-password'} minLength={6} required /></label>}
          {error && <p className="access-error" role="alert">{error}</p>}
          {successMessage && <p className="access-success" role="status">{successMessage}</p>}
          <button className="button button-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isResetting ? 'Send reset email' : isCreating ? 'Create account' : 'Sign in'}
            {!isSubmitting && <ArrowRight size={16} />}
          </button>
        </form>
        {!isResetting && (
          <>
            <button className="google-button" type="button" onClick={() => void signInWithGoogle()} disabled={isSubmitting}>
              <span className="google-g">G</span> Continue with Google
            </button>
            <button className="access-switch" type="button" onClick={() => switchMode('reset')}><KeyRound size={12} /> Forgot your password?</button>
          </>
        )}
        {isResetting ? (
          <button className="access-switch" type="button" onClick={() => switchMode('normal')}>Return to sign in</button>
        ) : (
          <button className="access-switch" type="button" onClick={() => { setIsCreating(!isCreating); setError(''); setSuccessMessage('') }}>
            {isCreating ? 'Already have an account? Sign in' : 'New to Pocketplan? Create an account'}
          </button>
        )}
        <div className="access-assurance"><LockKeyhole size={15} /><span>Your budget is scoped to your account.</span></div>
      </section>
    </main>
  )
}

function FirebaseSetup() {
  return (
    <main className="access-screen">
      <section className="access-panel setup-panel">
        <BrandMark />
        <p className="section-kicker">ONE PRIVATE ACCOUNT, EVERYWHERE</p>
        <h1>Connect your Firebase project.</h1>
        <p className="access-description">Add your Firebase web app settings to <code>.env.local</code> to turn on sign-in and cross-device budget sync.</p>
        <div className="setup-steps">
          <p><span>1</span>Create a Firebase project and register a web app.</p>
          <p><span>2</span>Enable Email/Password in Authentication and create a Firestore database.</p>
          <p><span>3</span>Copy the Firebase web config into <code>.env.local</code>, then deploy <code>firestore.rules</code>.</p>
        </div>
        <div className="access-assurance"><ShieldCheck size={16} /><span>This app uses Firestore only. Payslip files are never uploaded.</span></div>
      </section>
    </main>
  )
}

function AuthLoading() {
  return <main className="auth-loading"><Cloud size={20} /><span>Connecting to your budget…</span></main>
}

function BrandMark() {
  return <a className="access-brand" href="/" aria-label="Pocketplan home"><span className="brand-mark"><i /><i /><i /></span><span className="brand-name">pocket<span>plan</span></span></a>
}

function authErrorMessage(code: string) {
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'That email and password combination was not recognized.'
  if (code.includes('email-already-in-use')) return 'An account already exists for that email. Try signing in.'
  if (code.includes('weak-password')) return 'Choose a password with at least 6 characters.'
  if (code.includes('email-not-found')) return 'No account exists with that email address.'
  if (code.includes('invalid-api-key') || code.includes('operation-not-allowed')) return 'Google sign-in is not enabled in your Firebase Authentication settings.'
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a little and try again.'
  if (code.includes('network-request-failed')) return 'Could not reach Firebase. Check your internet connection.'
  return 'Could not complete sign-in. Check your Firebase Authentication setup and try again.'
}