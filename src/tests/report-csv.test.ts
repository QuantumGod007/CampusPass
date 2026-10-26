import { describe, it, expect, vi } from "vitest";
import { csvCell, completeReportCSV } from "../lib/campus/report-csv";
import type { CampusRepository } from "../lib/campus/repository";
import { headerFixture, pageFixture } from "./reporting-fixtures";
function repo(load: ReturnType<typeof vi.fn>) {
  return { reportPage: load } as unknown as CampusRepository;
}
describe("complete CSV construction from authorized immutable pages", () => {
  it.each([
    "=1+1",
    "+cmd",
    "-1+1",
    "@SUM(A1)",
    " \t=SUM(A1)",
    "\ufeff=1",
    "\u200b=1",
    "＝SUM(A1)",
    "\r\n@cmd",
  ])("neutralizes spreadsheet formula prefix %s", (value) => {
    expect(csvCell(value).startsWith("\"'")).toBe(true);
  });
  it("quotes delimiters, quotes and malformed controls while preserving Unicode", () => {
    expect(csvCell('Zoë, "Test"\n\0name')).toBe('"Zoë, ""Test""  name"');
    expect(csvCell("Björk")).toBe('"Björk"');
  });
  it("downloads every page in order from the same snapshot", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ...pageFixture(1, 2), next_after: 2 })
      .mockResolvedValueOnce(pageFixture(3, 3));
    const progress = vi.fn();
    const csv = await completeReportCSV(
      repo(load),
      "owner",
      headerFixture(),
      new AbortController().signal,
      progress,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.trimEnd().split("\r\n")).toHaveLength(4);
    expect(load.mock.calls.map((x) => x[3])).toEqual([0, 2]);
    expect(progress).toHaveBeenLastCalledWith(3);
    expect(csv).not.toContain("student_id");
  });
  it("refuses an incomplete last page instead of labelling it complete", async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ ...pageFixture(1, 2), next_after: null });
    await expect(
      completeReportCSV(
        repo(load),
        "owner",
        headerFixture(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "incomplete" });
  });
  it("refuses skipped/duplicate positions and a cross-event page", async () => {
    const load = vi.fn().mockResolvedValue(pageFixture(2, 3));
    await expect(
      completeReportCSV(
        repo(load),
        "owner",
        headerFixture(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "incomplete" });
    load.mockResolvedValue({ ...pageFixture(), event_id: crypto.randomUUID() });
    await expect(
      completeReportCSV(
        repo(load),
        "owner",
        headerFixture(),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "report_changed" });
  });
  it("does not return a CSV if a later page fails or access is revoked", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ ...pageFixture(1, 2), next_after: 2 })
      .mockRejectedValueOnce(Error("Access revoked"));
    await expect(
      completeReportCSV(
        repo(load),
        "owner",
        headerFixture(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("Access revoked");
  });
  it("aborts before requesting a report using a new account token", async () => {
    const load = vi.fn(),
      controller = new AbortController();
    controller.abort();
    await expect(
      completeReportCSV(
        repo(load),
        "owner",
        headerFixture(),
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
  it("exports a truthful header-only file for zero bookings", async () => {
    const load = vi
      .fn()
      .mockResolvedValue({
        ...pageFixture(),
        row_count: 0,
        rows: [],
        next_after: null,
      });
    const csv = await completeReportCSV(
      repo(load),
      "owner",
      { ...headerFixture(), row_count: 0 },
      new AbortController().signal,
    );
    expect(csv.trimEnd().split("\r\n")).toHaveLength(1);
  });
});
