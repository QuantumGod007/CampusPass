import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import { AuthConfigurationError, getAuthConfig } from "../lib/auth/config";

type AuthStatus =
  "disabled" | "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  isPasswordRecovery: boolean;
}

interface AuthContextValue extends AuthState {
  user: Session["user"] | null;
  isSigningOut: boolean;
  signOut: () => Promise<boolean>;
  retry: () => void;
}

const loading: AuthState = {
  status: "loading",
  session: null,
  error: null,
  isPasswordRecovery: false,
};
const Context = createContext<AuthContextValue | null>(null);
const restoreError =
  "We couldn’t restore your account session. Please try again.";
const logoutError =
  "We couldn’t confirm sign-out with the server. Please try again.";

function sessionState(
  session: Session | null,
  isPasswordRecovery = false,
): AuthState {
  return {
    status: session ? "authenticated" : "unauthenticated",
    session,
    error: null,
    isPasswordRecovery: !!session && isPasswordRecovery,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loading);
  const [attempt, setAttempt] = useState(0);
  const [isSigningOut, setSigningOut] = useState(false);
  const client = useRef<SupabaseClient | null>(null);
  const lifecycle = useRef<{ active: boolean } | null>(null);
  const revision = useRef(0);
  const lastEvent = useRef<AuthChangeEvent | null>(null);
  const logout = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const lifetime = { active: true };
    lifecycle.current = lifetime;
    let unsubscribe: (() => void) | undefined;

    async function restore() {
      // Skip startup for StrictMode's discarded effect and unmounted providers.
      await Promise.resolve();
      if (!lifetime.active) return;
      const initialRevision = revision.current;
      try {
        if (getAuthConfig().mode === "demo") {
          setState({ ...loading, status: "disabled" });
          return;
        }
        // The existing demo should not download the Supabase SDK.
        const { getSupabaseClient } = await import("../lib/auth/client");
        if (!lifetime.active) return;
        const supabase = getSupabaseClient();
        client.current = supabase;
        if (!supabase) throw new Error("Authentication client is disabled.");
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
          // getSession owns initial restoration, including its error result.
          // Treating INITIAL_SESSION as a new event can hide restoration errors.
          if (!lifetime.active || event === "INITIAL_SESSION") return;
          revision.current++;
          lastEvent.current = event;
          setState((previous) =>
            sessionState(
              session,
              event === "PASSWORD_RECOVERY" ||
                (previous.isPasswordRecovery &&
                  previous.session?.user.id === session?.user.id &&
                  event !== "USER_UPDATED"),
            ),
          );
        });
        unsubscribe = () => subscription.unsubscribe();
        const { data, error } = await supabase.auth.getSession();
        if (!lifetime.active || revision.current !== initialRevision) return;
        if (error) throw error;
        setState(sessionState(data.session));
      } catch (error) {
        if (!lifetime.active || revision.current !== initialRevision) return;
        setState({
          ...loading,
          status: "error",
          error:
            error instanceof AuthConfigurationError
              ? error.message
              : restoreError,
        });
      }
    }
    void restore();
    return () => {
      lifetime.active = false;
      unsubscribe?.();
      client.current = null;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    if (logout.current) return;
    if (lifecycle.current) lifecycle.current.active = false;
    client.current = null;
    revision.current++;
    lastEvent.current = null;
    setState(loading);
    setAttempt((value) => value + 1);
  }, []);

  const signOut = useCallback((): Promise<boolean> => {
    if (logout.current) return logout.current;
    const supabase = client.current;
    const lifetime = lifecycle.current;
    if (!supabase || !lifetime?.active) return Promise.resolve(false);
    const auth = supabase.auth;
    const requestRevision = ++revision.current;
    lastEvent.current = null;
    setSigningOut(true);
    setState((previous) => ({ ...previous, error: null }));

    const stillCurrent = () => lifetime.active;
    // SIGNED_OUT may arrive before signOut resolves, even on SDK errors. Keep
    // that event, but never let a stale logout overwrite a newer sign-in.
    const mayUpdate = () =>
      stillCurrent() &&
      (revision.current === requestRevision ||
        lastEvent.current === "SIGNED_OUT");
    async function endSession() {
      await Promise.resolve();
      try {
        const { error } = await auth.signOut({ scope: "local" });
        if (error) throw error;
        if (mayUpdate()) setState(sessionState(null));
        return stillCurrent();
      } catch {
        if (mayUpdate())
          setState((previous) => ({
            ...previous,
            status: previous.status === "loading" ? "error" : previous.status,
            error: logoutError,
          }));
        return false;
      } finally {
        logout.current = null;
        if (stillCurrent()) setSigningOut(false);
      }
    }
    logout.current = endSession();
    return logout.current;
  }, []);

  return (
    <Context.Provider
      value={{
        ...state,
        user: state.session?.user ?? null,
        isSigningOut,
        retry,
        signOut,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
