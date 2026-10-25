import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import type { ProfileAccount, ProfileError } from "../lib/profiles/repository";
import type { ProfileValues } from "../lib/profiles/schema";
type State = {
  key: string | null;
  status: "loading" | "ready" | "error";
  account: ProfileAccount | null;
  error: ProfileError | null;
};
interface ProfileContext {
  status: "disabled" | "loading" | "ready" | "error";
  account: ProfileAccount | null;
  error: ProfileError | null;
  isSaving: boolean;
  reload: () => void;
  save: (values: ProfileValues) => Promise<ProfileAccount>;
}
const Context = createContext<ProfileContext | null>(null);
export function ProfileProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const owner =
    auth.status === "authenticated" && !auth.isSigningOut
      ? auth.user?.id
      : undefined;
  const key =
    owner && auth.session ? `${owner}:${auth.session.access_token}` : null;
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<State>({
    key: null,
    status: "loading",
    account: null,
    error: null,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const lifetime = useRef<{
    active: boolean;
    key: string | null;
    revision: number;
  } | null>(null);
  const mutation = useRef<{
    key: string;
    promise: Promise<ProfileAccount>;
    controller: AbortController;
  } | null>(null);
  useEffect(() => {
    const current = { active: true, key, revision: 0 };
    lifetime.current = current;
    const controller = new AbortController();
    async function load() {
      await Promise.resolve();
      if (!current.active || !key || !owner) return;
      setState({ key, status: "loading", account: null, error: null });
      try {
        const { getProfileRepository } =
          await import("../lib/profiles/repository");
        const account = await getProfileRepository().load(
          owner,
          controller.signal,
        );
        if (current.active && current.revision === 0)
          setState({ key, status: "ready", account, error: null });
      } catch (error) {
        if (
          current.active &&
          !controller.signal.aborted &&
          current.revision === 0
        )
          setState({
            key,
            status: "error",
            account: null,
            error: error as ProfileError,
          });
      }
    }
    void load();
    return () => {
      current.active = false;
      controller.abort();
      if (mutation.current?.key === key) {
        mutation.current.controller.abort();
        mutation.current = null;
      }
    };
  }, [key, owner, attempt]);
  function save(values: ProfileValues): Promise<ProfileAccount> {
    if (
      !key ||
      !owner ||
      !lifetime.current?.active ||
      lifetime.current.key !== key
    )
      return Promise.reject(
        new Error("Your session changed. Reload your profile."),
      );
    if (mutation.current?.key === key) return mutation.current.promise;
    const current = lifetime.current;
    const revision = ++current.revision;
    const controller = new AbortController();
    setSavingKey(key);
    async function write() {
      await Promise.resolve();
      try {
        const { getProfileRepository } =
          await import("../lib/profiles/repository");
        const account = await getProfileRepository().save(
          owner!,
          values,
          controller.signal,
        );
        if (
          !current.active ||
          controller.signal.aborted ||
          current.revision !== revision
        )
          throw new DOMException("Account request superseded", "AbortError");
        setState({ key, status: "ready", account, error: null });
        return account;
      } finally {
        if (mutation.current?.controller === controller)
          mutation.current = null;
        if (current.active) setSavingKey(null);
      }
    }
    const promise = write();
    mutation.current = { key, promise, controller };
    return promise;
  }
  // The key guard is evaluated during render, so an account switch/sign-out
  // never displays cached personal data while effect cleanup is still pending.
  const visible =
    key && state.key === key
      ? state
      : { status: "loading" as const, account: null, error: null };
  return (
    <Context.Provider
      value={{
        ...visible,
        status: key ? visible.status : "disabled",
        isSaving: !!key && savingKey === key,
        reload: () => retry((value) => value + 1),
        save,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useOptionalStudentProfile() {
  return useContext(Context);
}
export function useStudentProfile() {
  const context = useContext(Context);
  if (!context) throw new Error("ProfileProvider is missing.");
  return context;
}
