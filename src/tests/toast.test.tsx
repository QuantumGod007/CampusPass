import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../components/toast";

function Notify() {
  const toast = useToast();
  return <button onClick={() => toast("Saved")}>Notify</button>;
}

afterEach(() => vi.useRealTimers());

it("bounds notification timers and releases them on dismissal, expiry and unmount", () => {
  vi.useFakeTimers();
  const { unmount } = render(
    <ToastProvider>
      <Notify />
    </ToastProvider>,
  );
  for (let i = 0; i < 10; i++) fireEvent.click(screen.getByText("Notify"));
  expect(screen.getAllByRole("status")).toHaveLength(3);
  expect(vi.getTimerCount()).toBe(3);
  fireEvent.click(screen.getAllByLabelText("Dismiss notification")[0]);
  expect(vi.getTimerCount()).toBe(2);
  act(() => vi.advanceTimersByTime(4500));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(screen.getByText("Notify"));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
