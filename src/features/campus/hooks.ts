import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/auth";
import {
  campusError,
  CampusError,
  getCampusRepository,
  type CampusRepository,
} from "../../lib/campus/repository";
export function useCampusIdentity() {
  const auth = useAuth();
  const owner =
    auth.status === "authenticated" && !auth.isSigningOut
      ? auth.user?.id
      : undefined;
  return {
    owner,
    key: owner && auth.session ? `${owner}:${auth.session.access_token}` : null,
  };
}
export function useAccountQuery<T>(
  load: (owner: string, signal: AbortSignal) => Promise<T>,
  scope = "",
) {
  const { owner, key: identityKey } = useCampusIdentity();
  const key = identityKey ? `${identityKey}:${scope}` : null;
  const [version, retry] = useState(0);
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    status: "loading" | "ready" | "error";
    error: CampusError | null;
  }>({ key: null, data: null, status: "loading", error: null });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function fetchData() {
      await Promise.resolve();
      if (!active || !key || !owner) return;
      setState({ key, data: null, status: "loading", error: null });
      try {
        const data = await load(owner, controller.signal);
        if (active && !controller.signal.aborted)
          setState({ key, data, status: "ready", error: null });
      } catch (error) {
        if (active && !controller.signal.aborted)
          setState({
            key,
            data: null,
            status: "error",
            error: campusError(error),
          });
      }
    }
    void fetchData();
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, owner, load, version]);
  const reload = useCallback(() => retry((value) => value + 1), []);
  return {
    data: key && state.key === key ? state.data : null,
    error: key && state.key === key ? state.error : null,
    status: key && state.key === key ? state.status : ("loading" as const),
    reload,
  };
}
const access = (owner: string, signal: AbortSignal) =>
  getCampusRepository().access(owner, signal);
const bookings = (owner: string, signal: AbortSignal) =>
  getCampusRepository().bookings(owner, signal);
export const useCampusAccess = () => useAccountQuery(access);
export const useCampusBookings = () => useAccountQuery(bookings);
export function useCampusEvents(owned = false) {
  return useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().events(owner, owned, signal),
      [owned],
    ),
  );
}
export function useCampusEvent(id: string) {
  return useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().event(owner, id, signal),
      [id],
    ),
  );
}
export function useCampusAttendees(id: string) {
  return useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().attendees(owner, id, signal),
      [id],
    ),
  );
}
export function useCampusAction() {
  const { owner, key } = useCampusIdentity();
  const lifetime = useRef<{ active: boolean; key: string | null } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    key: string | null;
    busy: boolean;
    error: CampusError | null;
  }>({ key: null, busy: false, error: null });
  useEffect(() => {
    const current = { key, active: true };
    lifetime.current = current;
    return () => {
      current.active = false;
      pending.current?.abort();
      pending.current = null;
    };
  }, [key]);
  async function run<T>(
    operation: (
      repository: CampusRepository,
      owner: string,
      signal: AbortSignal,
    ) => Promise<T>,
  ): Promise<T> {
    const current = lifetime.current;
    if (!key || !owner || !current?.active || current.key !== key)
      throw new CampusError("42501", "Your account changed. Sign in again.");
    if (pending.current)
      throw new CampusError(
        "busy",
        "Please wait for the current request to finish.",
      );
    const controller = new AbortController();
    pending.current = controller;
    setState({ key, busy: true, error: null });
    try {
      const result = await operation(
        getCampusRepository(),
        owner,
        controller.signal,
      );
      if (!current.active || controller.signal.aborted)
        throw new DOMException("Account request superseded", "AbortError");
      setState({ key, busy: false, error: null });
      return result;
    } catch (error) {
      if (!current.active || controller.signal.aborted)
        throw new DOMException("Account request superseded", "AbortError");
      const normalized = campusError(error);
      setState({ key, busy: false, error: normalized });
      throw normalized;
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  return {
    run,
    busy: !!key && state.key === key && state.busy,
    error: key && state.key === key ? state.error : null,
  };
}
