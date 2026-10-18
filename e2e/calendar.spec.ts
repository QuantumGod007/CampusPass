import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSeed } from "../src/data/seed";
import { makeRegistration } from "../src/lib/domain";
import { student } from "../src/tests/fixtures";

for (const width of [1440, 390, 320]) {
  test(`calendar download uses booked event data at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const initial = createSeed();
    // Use an edited event to ensure the download isn't tied to seed copy.
    initial.events[0].title = "Campus, Code & Café; 🎓";
    initial.events[0].venue = "Studio A, Block B";
    initial.events[0].description =
      "Bring a laptop; meet fellow makers.\nBuild, learn & share.";
    const { state, registration } = makeRegistration(
      initial,
      "buildfest",
      student,
    );
    const event = state.events[0];
    await page.addInitScript((saved) => {
      localStorage.setItem("campuspass.demo.v1", JSON.stringify(saved));
    }, state);
    await page.goto(`/bookings/${registration.id}`);
    const action = page.getByRole("button", { name: "Add to Calendar" });
    await expect(action).toBeVisible();
    await expect(action).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);

    const downloading = page.waitForEvent("download");
    await action.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("campuspass-event.ics");
    expect(await download.failure()).toBeNull();
    const calendar = await readFile((await download.path())!, "utf8");
    const unfolded = calendar.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Campus\\, Code & Café\\; 🎓\r\n");
    expect(unfolded).toContain("LOCATION:Studio A\\, Block B\r\n");
    expect(unfolded).toContain(
      "DESCRIPTION:Bring a laptop\\; meet fellow makers.\\nBuild\\, learn & share.\r\n",
    );
    const utc = (date: string) =>
      new Date(date)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    expect(unfolded).toContain(`DTSTART:${utc(event.start)}\r\n`);
    expect(unfolded).toContain(`DTEND:${utc(event.end)}\r\n`);
    expect(calendar).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(calendar).toMatch(/\r\nEND:VCALENDAR\r\n$/);
    expect(calendar).not.toContain(registration.prn);
    expect(calendar).not.toContain(registration.email);

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: testInfo.outputPath("calendar-pass.png"),
      fullPage: true,
    });
  });
}
