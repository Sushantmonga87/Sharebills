import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Eye, EyeOff, ArrowLeft, CheckCircle2, Moon, Sun } from 'lucide-react';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import sharebillsIcon from '../../assets/sharebills-icon.webp';
import { Button } from '../common/UI';
import { auth } from '../../firebase';

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px] flex-shrink-0">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18l6.9-5.2Z"
      />
      <path
        fill="#EA4335"
        d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.9 15l6.9 5.2C14.4 15.5 18.8 12 24 12Z"
      />
    </svg>
  );
}

export default function AuthScreen({
  users = [],
  onLoadUsers,
  onSaveUser,
  onLogin,
  initialMode = null,
  isStandaloneApp = false,
  onBackToLanding,
  theme = 'light',
  onThemeChange,
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(initialMode === 'login');
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mobileIdentifierRef = useRef(null);
  const desktopIdentifierRef = useRef(null);
  const mobilePasswordRef = useRef(null);
  const desktopPasswordRef = useRef(null);

  useEffect(() => {
    if (isSheetOpen) {
      const timer = setTimeout(() => {
        const identifierInput = window.innerWidth >= 768
          ? desktopIdentifierRef.current
          : mobileIdentifierRef.current;
        if (identifierInput) {
          identifierInput.focus();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isSheetOpen, isLogin]);

  useEffect(() => {
    if (window.innerWidth >= 768 && desktopIdentifierRef.current) {
      desktopIdentifierRef.current.focus();
    }
  }, []);

  const handleOpenSheet = (mode) => {
    setIsLogin(mode === 'login');
    setIsForgotPassword(false);
    if (mobilePasswordRef.current) mobilePasswordRef.current.value = '';
    if (desktopPasswordRef.current) desktopPasswordRef.current.value = '';
    setError('');
    setNotice('');
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    if (onBackToLanding) {
      onBackToLanding();
      return;
    }
    setIsSheetOpen(false);
    if (mobilePasswordRef.current) mobilePasswordRef.current.value = '';
    if (desktopPasswordRef.current) desktopPasswordRef.current.value = '';
    setError('');
    setNotice('');
  };

  const getAuthErrorMessage = (authError) => {
    switch (authError.code) {
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/user-disabled':
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Invalid email/username or password.';
      case 'auth/email-already-in-use':
        return 'An account already uses this email. Please sign in.';
      case 'auth/weak-password':
        return 'Choose a password with at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a little and try again.';
      case 'auth/popup-blocked':
        return 'Google sign-in popup was blocked. Allow popups for this site and try again.';
      case 'auth/unauthorized-domain':
        return `Google sign-in is not enabled for ${window.location.hostname}. Add this host under Firebase Authentication > Settings > Authorized domains.`;
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not enabled for this Firebase project. Enable Google in Firebase Authentication settings.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was cancelled.';
      case 'auth/account-exists-with-different-credential':
        return 'An account already uses this email with another sign-in method. Sign in with that method first.';
      case 'auth/credential-already-in-use':
        return 'This Google account is already linked to another Sharebills profile.';
      default:
        return 'Could not complete the request. Please try again.';
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setNotice('');
    setIsSubmitting(true);

    try {
      if (!auth) {
        throw new Error('Google sign-in is unavailable without a Firebase connection.');
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      let googleUser;
      if (Capacitor.getPlatform() === 'android') {
        const nativeResult = await FirebaseAuthentication.signInWithGoogle();
        const idToken = nativeResult.credential?.idToken;
        if (!idToken) {
          throw new Error('Google sign-in did not return an ID token. Please try again.');
        }
        const result = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
        googleUser = result.user;
      } else {
        const result = await signInWithPopup(auth, provider);
        googleUser = result.user;
      }
      const userEmail = googleUser.email?.trim().toLowerCase();
      if (!userEmail) throw new Error('Google did not provide an email address for this account.');
      const authUsers = await onLoadUsers();

      const existingUser = authUsers.find(
        (item) => item.email?.trim().toLowerCase() === userEmail
      );
      if (existingUser) {
        onLogin(existingUser.id, existingUser);
        return;
      }

      const baseUsername =
        googleUser.displayName?.trim() || userEmail.split('@')[0] || 'Roommate';
      const usedUsernames = new Set(authUsers.map((item) => item.username?.toLowerCase()));
      let username = baseUsername;
      let suffix = 2;
      while (usedUsernames.has(username.toLowerCase())) {
        username = `${baseUsername} ${suffix}`;
        suffix += 1;
      }

      const newUser = {
        id: googleUser.uid,
        username,
        email: userEmail,
        photoDataUrl: googleUser.photoURL || '',
        createdAt: new Date().toISOString(),
      };
      await onSaveUser(newUser);

      onLogin(newUser.id, newUser);
    } catch (authError) {
      console.error('Google sign-in failed:', authError);
      if (authError.code === 'auth/popup-closed-by-user') return;
      setError(authError.code ? getAuthErrorMessage(authError) : authError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const passwordInput = form.querySelector('[data-auth-password]');
    setError('');
    setNotice('');
    setIsSubmitting(true);
    const password = passwordInput?.value || '';
    const cleanIdentifier = identifier.trim();
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    try {
      const authUsers = isForgotPassword ? users : await onLoadUsers();

      if (!auth) {
        if (isForgotPassword) {
          throw new Error('Password reset is unavailable without a Firebase connection.');
        }
        if (isLogin) {
          const localUser = authUsers.find(
            (item) =>
              item.email?.toLowerCase() === cleanIdentifier.toLowerCase() ||
              item.username?.toLowerCase() === cleanIdentifier.toLowerCase()
          );
          if (!localUser || localUser.password !== password) {
            setError('Invalid email/username or password.');
            return;
          }
          onLogin(localUser.id, localUser);
          return;
        }
        setError('Account creation requires Firebase email verification. Please try again when connected.');
        return;
      }

      if (isForgotPassword) {
        if (!cleanIdentifier.includes('@')) {
          setError('Enter the email address for your account.');
          return;
        }
        await sendPasswordResetEmail(auth, cleanIdentifier.toLowerCase());
        setIsForgotPassword(false);
        setIsLogin(true);
        setIdentifier(cleanIdentifier);
        setNotice('If an account uses this email, a password reset link is on its way. Please check spam folder if not recieved');
        return;
      }

      if (isLogin) {
        const matchedUser = authUsers.find(
          (item) =>
            item.email?.toLowerCase() === cleanIdentifier.toLowerCase() ||
            item.username?.toLowerCase() === cleanIdentifier.toLowerCase()
        );
        if (!matchedUser) {
          const legacyUser = authUsers.find(
            (item) => item.username?.toLowerCase() === cleanIdentifier.toLowerCase()
          );
          if (!legacyUser || legacyUser.password !== password) {
            setError('Invalid email/username or password.');
            return;
          }
          onLogin(legacyUser.id, legacyUser);
          return;
        }

        const userEmail = matchedUser.email?.toLowerCase();
        if (!userEmail) {
          if (matchedUser.password !== password) {
            setError('Invalid email/username or password.');
            return;
          }
          onLogin(matchedUser.id, matchedUser);
          return;
        }

        if (matchedUser.password === password && password.length < 6) {
          onLogin(matchedUser.id, matchedUser);
          return;
        }

        if (matchedUser.password === password) {
          try {
            const credential = await createUserWithEmailAndPassword(auth, userEmail, password);
            if (!credential.user.emailVerified) {
              await sendEmailVerification(credential.user);
            }
            await onSaveUser({ ...matchedUser, password: '' });
            if (!credential.user.emailVerified) {
              setNotice(`A verification link was sent to ${userEmail}. Verify your email before signing in. Check spam folder, if not recieved`);
              return;
            }
            onLogin(matchedUser.id, matchedUser);
            return;
          } catch (migrationError) {
            if (migrationError.code !== 'auth/email-already-in-use') throw migrationError;
          }
        }
        const credential = await signInWithEmailAndPassword(auth, userEmail, password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          setNotice(`A verification link was sent to ${userEmail}. Verify your email before signing in. Check spam folder, if not recieved`);
          return;
        }
        if (matchedUser.password) await onSaveUser({ ...matchedUser, password: '' });
        onLogin(matchedUser.id, matchedUser);
        return;
      }

      if (cleanUsername.length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }
      if (!cleanEmail) {
        setError('Email is required to create an account.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (authUsers.some((item) => item.username?.toLowerCase() === cleanUsername.toLowerCase())) {
        setError('Username already taken. Please sign in.');
        return;
      }
      if (authUsers.some((item) => item.email?.toLowerCase() === cleanEmail)) {
        setError('An account already uses this email. Please sign in.');
        return;
      }
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const newUser = {
        id: credential.user.uid,
        username: cleanUsername,
        email: cleanEmail,
        createdAt: new Date().toISOString(),
      };
      try {
        await onSaveUser(newUser);
      } catch (saveError) {
        await deleteUser(credential.user);
        await signInAnonymously(auth);
        throw saveError;
      }
      await sendEmailVerification(credential.user);
      setNotice(`Account created. Check ${cleanEmail} for a verification link, then sign in.`);
      setIsLogin(true);
      setIdentifier(cleanEmail);
    } catch (authError) {
      console.error('Authentication request failed:', authError);
      setError(authError.code ? getAuthErrorMessage(authError) : authError.message);
    } finally {
      if (passwordInput) passwordInput.value = '';
      setIsSubmitting(false);
    }
  };

  const renderAuthForm = (inputRef, passwordRef, idPrefix) => {
    const isMobileForm = idPrefix === 'mobile';
    const inputClassName = isMobileForm
      ? 'w-full rounded-xl border border-[#d6e2d8] bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-[#3E7754] focus:outline-none focus:ring-2 focus:ring-[#3E7754]/15'
      : 'w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all placeholder:text-slate-400';

    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      {error && (
        <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-xs font-medium flex items-start gap-2 border border-rose-200">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700"
        >
          {notice}
        </p>
      )}

      {isLogin || isForgotPassword ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-identifier`} className="text-xs font-semibold text-slate-700">
            {isForgotPassword ? 'Email address' : 'Email or username'}
          </label>
          <input
            id={`${idPrefix}-identifier`}
            ref={inputRef}
            type={isForgotPassword ? 'email' : 'text'}
            placeholder={isForgotPassword ? 'you@example.com' : 'you@example.com or username'}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete={isForgotPassword ? 'email' : 'username'}
            enterKeyHint="next"
            className={inputClassName}
            required
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-username`} className="text-xs font-semibold text-slate-700">
              Username
            </label>
            <input
              id={`${idPrefix}-username`}
              ref={inputRef}
              type="text"
              placeholder="e.g. taran"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              enterKeyHint="next"
              className={inputClassName}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-email`} className="text-xs font-semibold text-slate-700">
              Email
            </label>
            <input
              id={`${idPrefix}-email`}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              enterKeyHint="next"
              className={inputClassName}
              required
            />
          </div>
        </>
      )}

      {!isForgotPassword && (
        <div className="flex flex-col gap-1.5 relative">
          <div className="flex items-center justify-between">
            <label htmlFor={`${idPrefix}-password`} className="text-xs font-semibold text-slate-700">
              Password
            </label>
            {isLogin && (
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError('');
                  setNotice('');
                }}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id={`${idPrefix}-password`}
              ref={passwordRef}
              data-auth-password
              type={showPassword ? 'text' : 'password'}
              placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              enterKeyHint="done"
              minLength={!isLogin && !isForgotPassword ? 6 : undefined}
              className={`${inputClassName} pr-10`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 focus:outline-none"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className={`${isMobileForm ? 'auth-mobile-submit' : ''} w-full mt-1 h-11 text-sm`}
      >
        {isSubmitting
          ? 'Please wait...'
          : isForgotPassword
            ? 'Send reset link'
            : isLogin
              ? 'Sign in'
              : 'Create account'}
      </Button>

      {!isForgotPassword && (
        <>
          <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>or continue with</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            className={`flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border bg-white text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isMobileForm
                ? 'border-[#d6e2d8] text-slate-700 shadow-sm hover:bg-[#f8fbf8]'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <GoogleMark />
            Continue with Google
          </button>
        </>
      )}

      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={() => {
            if (isForgotPassword) {
              setIsForgotPassword(false);
            } else {
              setIsLogin(!isLogin);
            }
            if (mobilePasswordRef.current) mobilePasswordRef.current.value = '';
            if (desktopPasswordRef.current) desktopPasswordRef.current.value = '';
            setError('');
            setNotice('');
          }}
          className="text-slate-500 font-medium text-xs inline-flex items-center gap-1.5 hover:text-slate-800"
        >
          {isForgotPassword
            ? 'Remember your password?'
            : isLogin
              ? "Don't have an account?"
              : 'Already have an account?'}
          <span className="text-slate-900 font-bold hover:underline">
            {isForgotPassword ? 'Sign in' : isLogin ? 'Sign up' : 'Sign in'}
          </span>
        </button>
      </div>
      </div>
    );
  };

  return (
    <main className="auth-page-shell min-h-[100dvh] w-full font-sans flex items-center justify-center md:p-6 relative overflow-hidden">
      {!isStandaloneApp && (
        <button
          type="button"
          onClick={() => onThemeChange?.(theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="fixed right-4 top-4 z-[60] hidden h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-700 shadow-md backdrop-blur transition-colors hover:bg-white md:flex"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      )}

      {/* MOBILE LAYOUT */}
      <div className="fixed inset-0 flex h-full w-full flex-col overflow-hidden bg-[#3E7754] md:hidden">
        <div className="flex-1 flex flex-col justify-between">
          <div className="mobile-auth-hero relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#173F2D] via-[#23533A] to-[#3E7754] px-7 pb-8 pt-8 text-center">
            <div className="relative mb-4 flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[21px] border border-white/30 bg-white p-2 shadow-lg shadow-black/15">
              <img src={sharebillsIcon} alt="Sharebills logo" className="h-full w-full rounded-[15px] object-cover" />
            </div>
            <span className="relative rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
              Shared living, in sync
            </span>
            <h1 className="relative mt-4 max-w-sm text-[32px] font-extrabold leading-[1.08] text-white">
              Split Bills, <span className="text-emerald-200">Not Friendships.</span>
            </h1>
            <p className="relative mt-3 max-w-xs text-sm leading-relaxed text-emerald-50/85">
              Shared expenses, clear balances, and no awkward money reminders.
            </p>
            {!isStandaloneApp && (
              <div className="relative mt-5 w-full max-w-[310px] rounded-[22px] border border-white/20 bg-white/10 p-3.5 text-left shadow-xl shadow-black/10 backdrop-blur-md">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <img src={sharebillsIcon} alt="" className="h-9 w-9 rounded-xl border border-white/70 object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-white">Flat 402</p>
                      <p className="text-[10px] font-medium text-emerald-100/80">October shared balance</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-extrabold text-emerald-200">+₹3,450</p>
                    <p className="text-[9px] font-bold uppercase text-emerald-100/75">to receive</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
                  {[
                    { label: 'Rent', value: '₹6,000', color: 'bg-amber-300' },
                    { label: 'Groceries', value: '₹1,240', color: 'bg-sky-300' },
                    { label: 'Settled', value: '3 of 4', color: 'bg-emerald-300' },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0">
                      <span className={`mb-1 block h-1 w-5 rounded-full ${item.color}`} />
                      <p className="text-[9px] font-medium text-white/70">{item.label}</p>
                      <p className="truncate text-[10px] font-extrabold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mobile-auth-panel w-full rounded-t-[28px] border-t border-slate-200/80 bg-white px-6 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col gap-3">
            <Button onClick={() => handleOpenSheet('signup')} className="w-full h-11 text-sm">
              Get Started
            </Button>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GoogleMark />
              Continue with Google
            </button>
            <div className="text-center mt-1">
              <span className="text-slate-500 text-xs">Already have an account? </span>
              <button
                type="button"
                onClick={() => handleOpenSheet('login')}
                className="text-slate-900 font-bold text-xs hover:underline"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Slide-Up Sheet */}
        <div
          className={`auth-mobile-sheet fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#f5f8f5] transition-transform duration-200 ease-out ${
            isSheetOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex h-[65px] flex-shrink-0 items-center border-b border-[#dce6de] bg-white px-4">
            <button
              type="button"
              onClick={closeSheet}
              className="mr-2 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
              aria-label="Back to sign in options"
            >
              <ArrowLeft size={20} />
            </button>
            <img src={sharebillsIcon} alt="" className="mr-2 h-7 w-7 rounded-lg object-cover" />
            <h2 className="text-sm font-extrabold tracking-tight text-slate-900">
              {isForgotPassword
                ? 'Reset password'
                : isLogin
                  ? 'Sign in'
                  : 'Create account'}
            </h2>
            {!isStandaloneApp && (
              <button
                type="button"
                onClick={() => onThemeChange?.(theme === 'dark' ? 'light' : 'dark')}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-[#dce6de] bg-[#f5f8f5] text-slate-700 transition-colors hover:bg-[#edf3ee]"
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-6 pt-6 pb-10">
            <form onSubmit={handleSubmit} className="w-full">
              {renderAuthForm(mobileIdentifierRef, mobilePasswordRef, 'mobile')}
            </form>
          </div>
        </div>
      </div>

      <section className="hidden min-h-[min(760px,calc(100dvh-3rem))] w-full max-w-6xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(27,65,41,0.14)] md:grid md:grid-cols-[1.05fr_0.95fr]">
          <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#173F2D] via-[#23533A] to-[#3E7754] p-10 text-white lg:p-14">
            <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full border border-white/10 bg-white/[0.04]" />
            <div className="absolute -bottom-36 -left-20 h-96 w-96 rounded-full border border-white/10 bg-white/[0.04]" />
            <div className="relative flex items-center gap-3">
              <img src={sharebillsIcon} alt="" className="h-11 w-11 rounded-xl border border-white/30 object-cover shadow-lg" />
              <span className="text-xl font-extrabold tracking-tight">Sharebills</span>
            </div>
            <div className="relative my-12 max-w-lg">
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                Shared living, in sync
              </span>
              <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight lg:text-5xl">
                Split bills, <span className="text-emerald-200">not friendships.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-emerald-50/85">
                Keep household expenses clear, balanced, and easy for everyone to settle.
              </p>
              <ul className="mt-8 space-y-4 text-sm text-emerald-50/90">
                {[
                  'Track shared expenses and rent in one place',
                  'See who owes what with clear balances',
                  'Settle up directly with simple payment details',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-200" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="relative text-xs font-medium text-emerald-100/70">
              © {new Date().getFullYear()} Sharebills
            </p>
          </div>

          <div className="auth-desktop-form-panel flex items-center justify-center bg-[#fbfdfb] p-10 lg:p-14">
            <div className="w-full max-w-md">
              {!isStandaloneApp || isSheetOpen ? (
                <>
                  <button
                    type="button"
                    onClick={onBackToLanding || closeSheet}
                    className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900"
                  >
                    <ArrowLeft size={17} />
                    {onBackToLanding ? 'Back to Sharebills' : 'Back'}
                  </button>
                  <div className="mb-7">
                    <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
                      {isForgotPassword ? 'Reset password' : isLogin ? 'Welcome back' : 'Create your account'}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {isForgotPassword
                        ? 'We’ll email you a password reset link.'
                        : isLogin
                          ? 'Sign in to pick up where your household left off.'
                          : 'Get your household on the same page about shared expenses.'}
                    </p>
                  </div>
                  <form onSubmit={handleSubmit} className="w-full">
                    {renderAuthForm(desktopIdentifierRef, desktopPasswordRef, 'desktop')}
                  </form>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                    Welcome to Sharebills
                  </span>
                  <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 lg:text-4xl">
                    Make shared expenses easier.
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-slate-600">
                    Create a space for your household and keep every shared bill organized from day one.
                  </p>
                  <div className="mt-9 space-y-3">
                    <Button onClick={() => handleOpenSheet('signup')} className="h-12 w-full text-sm">
                      Get Started
                    </Button>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isSubmitting}
                      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <GoogleMark />
                      Continue with Google
                    </button>
                  </div>
                  <p className="mt-6 text-center text-sm text-slate-500">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => handleOpenSheet('login')}
                      className="font-bold text-slate-900 hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </>
              )}
            </div>
          </div>
      </section>
    </main>
  );
}