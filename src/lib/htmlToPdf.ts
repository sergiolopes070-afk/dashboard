// ─────────────────────────────────────────────────────────────────────────────
// Rendu HTML → PDF (A4) via un Chromium headless.
//   • Sur Vercel/Lambda : binaire @sparticuz/chromium (serverless).
//   • En local : Chrome installé (canal "chrome").
// Imports dynamiques : ces paquets lourds ne sont chargés qu'à l'appel, jamais
// embarqués dans le bundle client/edge.
// ─────────────────────────────────────────────────────────────────────────────

export async function htmlToPdf(html: string): Promise<Buffer> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION || process.env.AWS_EXECUTION_ENV);
  const puppeteer = (await import("puppeteer-core")).default;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let launchOpts: any;
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    launchOpts = {
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    };
  } else {
    // En local, on s'appuie sur Google Chrome installé.
    launchOpts = { channel: "chrome", headless: true };
  }

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // Laisse les polices (Google Fonts) se charger, sans bloquer indéfiniment.
    await Promise.race([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.evaluate(() => (document as any).fonts?.ready).catch(() => {}),
      new Promise(r => setTimeout(r, 3000)),
    ]);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
