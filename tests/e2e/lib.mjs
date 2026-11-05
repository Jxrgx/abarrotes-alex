// Utilidades E2E (puppeteer-core + Chrome instalado). Ver tests/README.md.
// Credenciales: SOLO ADMIN_TEST_EMAIL / ADMIN_TEST_PASSWORD (variables de entorno; se
// cargan con --env-file=.env.local). Viven en memoria: nunca se imprimen, registran ni
// aparecen en capturas (el correo se enmascara antes de capturar).
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ARTIFACTS = new URL("./.artifacts/", import.meta.url);
const env = (key) => (process.env[key] ?? "").trim();
const CREDS = { email: env("ADMIN_TEST_EMAIL"), password: env("ADMIN_TEST_PASSWORD") };
export const hasCreds = () => CREDS.email.length > 0 && CREDS.password.length > 0;
export const containsCreds = (text) => Boolean(text) && (text.includes(CREDS.password) || text.toLowerCase().includes(CREDS.email.toLowerCase()));

let pass = 0, fail = 0;
export function check(name, ok, info) {
  if (ok) pass++;
  else fail++;
  let detail = !ok && info !== undefined ? JSON.stringify(info).slice(0, 500) : "";
  if (containsCreds(detail)) detail = "[omitido: datos sensibles]";
  console.log(ok ? "  PASS" : "  FAIL", name, detail);
}
export const summary = (label) => console.log(`\n${label}: ${pass} PASS / ${fail} FAIL`);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const consoleIssues = [];
export const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true });
export async function newPage(context, width = 1440) {
  const page = await context.newPage();
  await page.setViewport({ width, height: width < 600 ? 844 : 900 });
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const text = message.text();
    consoleIssues.push({ type: message.type(), text: containsCreds(text) ? "[omitido]" : text.slice(0, 300), url: page.url().replace(BASE, "") });
  });
  page.on("pageerror", (error) => consoleIssues.push({ type: "pageerror", text: String(error.message).slice(0, 300) }));
  return page;
}
export const relevantConsole = () => consoleIssues.filter((issue) => !/status of 4\d\d/.test(issue.text));

export async function login(page, via = "click") {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
  await page.type("#login-email", CREDS.email);
  await page.type("#login-password", CREDS.password);
  const nav = page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => null);
  if (via === "enter") await page.keyboard.press("Enter");
  else await page.click("button[type=submit]");
  await nav;
  await page.waitForFunction(() => location.pathname === "/admin", { timeout: 30000 }).catch(() => null);
  return new URL(page.url()).pathname;
}
export async function typeEmailWrongPassword(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
  await page.type("#login-email", CREDS.email);
  await page.type("#login-password", "contraseña-incorrecta-e2e");
}

export async function screenshot(page, path, options = {}) {
  await page.evaluate((email) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (email && walker.currentNode.nodeValue.toLowerCase().includes(email.toLowerCase())) walker.currentNode.nodeValue = "usuario-e2e";
    for (const input of document.querySelectorAll("input")) if (input.type === "password" || (email && input.value.toLowerCase().includes(email.toLowerCase()))) input.value = "";
  }, CREDS.email);
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(path, ARTIFACTS)), ...options });
}

export const metrics = (page) => page.evaluate(() => {
  const root = document.querySelector("dialog[open]") ?? document;
  const interactive = [...root.querySelectorAll("a, button, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, [role=menuitem]")]
    .filter((element) => element.checkVisibility() && !element.closest(".sr-only") && !element.matches(".sr-only"));
  return {
    overflowX: document.documentElement.scrollWidth > innerWidth,
    small: interactive.map((element) => [element, element.getBoundingClientRect()]).filter(([, rect]) => rect.height < 40 && rect.width > 0)
      .map(([element, rect]) => `${element.tagName}:${(element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 24)}:${Math.round(rect.height)}`),
  };
});
export const clickText = (page, selector, text) => page.evaluate((s, t) => {
  const element = [...document.querySelectorAll(s)].find((e) => e.checkVisibility() && e.textContent.trim().includes(t));
  element?.click();
  return Boolean(element);
}, selector, text);
export const dialogText = (page) => page.evaluate(() => document.querySelector("dialog[open]")?.innerText.replace(/\s+/g, " ") ?? null);
export const mainText = (page) => page.evaluate(() => document.querySelector("main")?.innerText.replace(/\s+/g, " ") ?? "");
export async function clearAndType(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(selector, value);
}
export async function waitDialogClosed(page, timeout = 30000) {
  try { await page.waitForFunction(() => !document.querySelector("dialog[open]"), { timeout }); return null; } catch { return dialogText(page); }
}
export async function waitToast(page, text, timeout = 15000) {
  try { await page.waitForFunction((t) => document.querySelector("[role=status][aria-live]")?.innerText.includes(t), { timeout }, text); return true; } catch { return false; }
}
