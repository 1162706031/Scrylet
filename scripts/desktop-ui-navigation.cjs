// Acceptance navigation for current source and older independently kept packages.
// Keeps the old disclosure path when validating a pre-sidebar executable.
async function openDesktopSection(page, view) {
  const navigation = page.locator(`[data-view="${view}"]`);
  if (await navigation.count()) {
    await navigation.focus();
    await navigation.press("Enter");
    return;
  }
  const selectors = { capture: ".capture-settings", network: ".connection-settings", activity: "#maintenance" };
  if (view === "overview") {
    for (const selector of Object.values(selectors))
      await page.locator(selector).evaluate(panel => { panel.open = false; });
    return;
  }
  const panel = page.locator(selectors[view]);
  if (!await panel.evaluate(element => element.open)) {
    await panel.locator("summary").focus();
    await panel.locator("summary").press("Enter");
  }
}
module.exports = { openDesktopSection };
