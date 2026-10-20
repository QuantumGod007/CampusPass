import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { Check, CircleAlert, X } from "lucide-react";
interface Toast {
  id: number;
  message: string;
  error: boolean;
}
const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);
  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      activeTimers.clear();
    };
  }, []);
  const dismiss = (id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };
  const notify = (message: string, error = false) => {
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-2), { id, message, error }]);
    // Match the three visible notifications and release dismissed/expired timers.
    if (timers.current.size >= 3) {
      const oldest = timers.current.keys().next().value;
      if (oldest !== undefined) dismiss(oldest);
    }
    timers.current.set(
      id,
      setTimeout(() => dismiss(id), 4500),
    );
  };
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            className={`toast ${toast.error ? "toast-error" : ""}`}
            key={toast.id}
            role="status"
          >
            {toast.error ? <CircleAlert size={18} /> : <Check size={18} />}
            <span>{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              className="icon-button"
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  return useContext(ToastContext);
}
