import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Button } from "../components/ui/button";

it("keeps secondary actions from submitting a form while respecting explicit submit buttons", () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <Button>Preview</Button>
      <Button type="submit">Save</Button>
    </form>,
  );
  fireEvent.click(screen.getByText("Preview"));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Save"));
  expect(submit).toHaveBeenCalledTimes(1);
});

it("does not pass a button type to a slotted link", () => {
  render(
    <Button asChild>
      <a href="/saved">Saved events</a>
    </Button>,
  );
  expect(screen.getByRole("link")).not.toHaveAttribute("type");
});
