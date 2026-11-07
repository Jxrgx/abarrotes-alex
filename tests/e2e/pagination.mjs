// Paginación del catálogo con varias páginas usando el catálogo semilla: requiere una
// instancia LOCAL con QA_CATALOG_PAGE_SIZE pequeño (p. ej. 4 → 12 productos = 3 páginas).
// Solo lectura: no crea productos ni pedidos. Ver tests/README.md.
// Uso: QA_CATALOG_PAGE_SIZE=4 npx next start -p 3102
//      E2E_BASE_URL=http://localhost:3102 npm run test:e2e:pagination
import { BASE, check, launch, mainText, newPage, relevantConsole, screenshot, sleep, summary } from "./lib.mjs";

// Identidad de cada tarjeta: nombre + presentación (el seed tiene nombres repetidos, p. ej. 600 ml y 2 L).
const names = (page) => page.evaluate(() => [...document.querySelectorAll("main article")].map((a) => [...a.querySelectorAll("h2, h3, p")].slice(0, 3).map((e) => e.textContent.trim()).join(" | ")));
const nav = (page) =>
  page.evaluate(() => {
    const n = document.querySelector("nav[aria-label='Paginación de productos']");
    if (!n) return null;
    const visible = (e) => e.checkVisibility();
    return {
      current: n.querySelector("[aria-current=page]")?.textContent.trim() ?? null,
      prevDisabled: [...n.querySelectorAll("button[disabled]")].some((b) => visible(b) && /Anterior/.test(b.textContent)),
      nextDisabled: [...n.querySelectorAll("button[disabled]")].some((b) => visible(b) && /Siguiente/.test(b.textContent)),
      mobileLabel: [...n.querySelectorAll("p")].find(visible)?.textContent.trim() ?? null,
      numbers: [...n.querySelectorAll("ul li")].filter(visible).map((li) => li.textContent.trim()),
    };
  });
const waitIdle = (page) => page.waitForFunction(() => !document.querySelector("[aria-busy=true]"), { timeout: 10000 }).catch(() => null);
async function clickPager(page, label) {
  const link = (await page.evaluateHandle((text) => [...document.querySelectorAll("nav[aria-label='Paginación de productos'] a")].find((a) => a.checkVisibility() && a.textContent.trim().startsWith(text)), label)).asElement();
  if (!link) return false;
  await link.click();
  return true;
}

const browser = await launch();
try {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, 1440);

  console.log("== Desktop (1440)");
  await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  const count = await page.evaluate(() => document.querySelector("main [role=status]")?.textContent ?? "");
  const total = Number(/(\d+) productos?/.exec(count)?.[1] ?? 0);
  const perPage = (await names(page)).length;
  const pages = Math.ceil(total / perPage);
  if (pages < 2) throw new Error(`Se necesitan ≥ 2 páginas (total ${total}, por página ${perPage}). Levanta la instancia con QA_CATALOG_PAGE_SIZE pequeño.`);
  check(`conteo total real (${total}) y página parcial (${perPage} por página → ${pages} páginas)`, total >= 10 && perPage < total);
  let n = await nav(page);
  check("página 1: aria-current=1 y «Anterior» deshabilitado (no es enlace)", n?.current === "1" && n.prevDisabled && !n.nextDisabled, n);
  const page1 = await names(page);
  check("<nav aria-label='Paginación de productos'> presente", Boolean(n));

  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await clickPager(page, "Siguiente");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("page") === "2", { timeout: 10000 }).catch(() => null);
  await waitIdle(page);
  await sleep(500);
  const page2 = await names(page);
  check("Siguiente → ?page=2 con otros productos", new URL(page.url()).searchParams.get("page") === "2" && page2.length > 0 && page2.every((name) => !page1.includes(name)), page2);
  const listTop = await page.evaluate(() => document.getElementById("lista-productos").getBoundingClientRect().top);
  check(`al cambiar de página lleva al inicio de la lista (top ${Math.round(listTop)} px, bajo el header)`, listTop >= 0 && listTop < 200);
  n = await nav(page);
  check("página 2: aria-current=2", n?.current === "2", n);

  // Recorrer hasta la última: Siguiente deshabilitado y sin repetidos entre páginas.
  const seen = [...page1, ...page2];
  for (let target = 3; target <= pages; target++) {
    await clickPager(page, "Siguiente");
    await page.waitForFunction((t) => new URL(location.href).searchParams.get("page") === String(t), { timeout: 10000 }, target).catch(() => null);
    await waitIdle(page);
    seen.push(...(await names(page)));
  }
  n = await nav(page);
  check("última página: «Siguiente» deshabilitado", n?.nextDisabled && n.current === String(pages), n);
  check(`todas las páginas suman el total sin repetidos (${seen.length}/${total})`, seen.length === total && new Set(seen).size === total);
  await screenshot(page, "paginacion-ultima-1440.png");

  console.log("== Atrás / adelante");
  await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  await clickPager(page, "Siguiente");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("page") === "2", { timeout: 10000 }).catch(() => null);
  await waitIdle(page);
  await page.goBack({ waitUntil: "networkidle0" });
  check("Atrás → página 1", !new URL(page.url()).searchParams.has("page") && JSON.stringify(await names(page)) === JSON.stringify(page1));
  await page.goForward({ waitUntil: "networkidle0" });
  check("Adelante → página 2", new URL(page.url()).searchParams.get("page") === "2" && JSON.stringify(await names(page)) === JSON.stringify(page2));
  await page.reload({ waitUntil: "networkidle0" });
  check("refresh conserva la página", JSON.stringify(await names(page)) === JSON.stringify(page2));

  console.log("== Reset a página 1 y combinaciones");
  await page.goto(`${BASE}/productos?page=2`, { waitUntil: "networkidle0" });
  const input = (await page.evaluateHandle(() => [...document.querySelectorAll("header input[type=search]")].find((e) => e.checkVisibility()))).asElement();
  await input.type("leche", { delay: 40 });
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "leche", { timeout: 10000 }).catch(() => null);
  check("escribir en página 2 → vuelve a página 1 (sin ?page)", !new URL(page.url()).searchParams.has("page"));
  await page.goto(`${BASE}/productos?page=2`, { waitUntil: "networkidle0" });
  await page.select("main select", "precio-asc").catch(() => null);
  const sortSelect = await page.evaluateHandle(() => [...document.querySelectorAll("main select")].find((s) => s.checkVisibility() && [...s.options].some((o) => o.value === "precio-asc")));
  await sortSelect.asElement()?.select("precio-asc");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("orden") === "precio-asc", { timeout: 10000 }).catch(() => null);
  check("cambiar el orden en página 2 → página 1", !new URL(page.url()).searchParams.has("page"));
  // Orden por precio GLOBAL: la página 2 empieza donde terminó la 1.
  const priceOf = () => page.evaluate(() => [...document.querySelectorAll("main article")].map((a) => Number(/\$([\d,.]+)/.exec(a.querySelector("[class*=text-lg], [class*=font-semibold]")?.textContent ?? a.innerText)?.[1].replace(/,/g, "") ?? "0")));
  await page.goto(`${BASE}/productos?orden=precio-asc`, { waitUntil: "networkidle0" });
  const firstPrices = await priceOf();
  await page.goto(`${BASE}/productos?orden=precio-asc&page=2`, { waitUntil: "networkidle0" });
  const secondPrices = await priceOf();
  check("precio asc global: máximo de la página 1 ≤ mínimo de la página 2", Math.max(...firstPrices) <= Math.min(...secondPrices), { firstPrices, secondPrices });
  await page.goto(`${BASE}/productos?orden=precio-desc`, { waitUntil: "networkidle0" });
  const descFirst = await priceOf();
  await page.goto(`${BASE}/productos?orden=precio-desc&page=2`, { waitUntil: "networkidle0" });
  const descSecond = await priceOf();
  check("precio desc global: mínimo de la página 1 ≥ máximo de la página 2", Math.min(...descFirst) >= Math.max(...descSecond), { descFirst, descSecond });
  const response = await page.goto(`${BASE}/productos?page=${pages + 5}`, { waitUntil: "networkidle0" });
  check(`página inexistente (${pages + 5}) → estado amigable (${response.status()})`, response.status() === 200 && /Esta página no existe/.test(await mainText(page)) && /Ir a la última página/.test(await mainText(page)));

  console.log("== Carrito con paginación");
  await page.goto(`${BASE}/productos?page=2`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.querySelector("main article button[aria-label^='Agregar']")?.click());
  await sleep(500);
  await page.goto(`${BASE}/productos`, { waitUntil: "networkidle0" });
  await page.goto(`${BASE}/productos?page=2`, { waitUntil: "networkidle0" });
  check("el producto agregado en página 2 conserva su cantidad al volver", await page.evaluate(() => Boolean(document.querySelector("main article [aria-label*='Aumentar'], main article [aria-label*='Quitar'], main article [aria-label*='Disminuir']"))));
  await page.evaluate(() => localStorage.clear());

  console.log("== Móvil (390)");
  const mobile = await newPage(ctx, 390);
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mobile.goto(`${BASE}/productos?page=2`, { waitUntil: "networkidle0" });
  n = await nav(mobile);
  check(`móvil: «Página 2 de ${pages}» sin fila de números`, n?.mobileLabel === `Página 2 de ${pages}` && n.numbers.length === 0, n);
  const targets = await mobile.evaluate(() => [...document.querySelectorAll("nav[aria-label='Paginación de productos'] a, nav[aria-label='Paginación de productos'] button")].filter((e) => e.checkVisibility()).map((e) => Math.round(e.getBoundingClientRect().height)));
  check(`móvil: objetivos táctiles ≥ 40 px (${targets.join(", ")})`, targets.every((h) => h >= 40));
  check("móvil: sin desbordamiento horizontal", await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await screenshot(mobile, "paginacion-movil-390.png", { fullPage: true });

  const issues = relevantConsole();
  check(`consola sin errores (${issues.length})`, issues.length === 0, issues.slice(0, 3));
  await ctx.close();
} finally {
  await browser.close();
}
summary("Paginación del catálogo");
