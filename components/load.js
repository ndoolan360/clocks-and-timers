/**
 * Loads a component's template and stylesheets.
 * @param {URL} templateUrl
 * @param  {...URL} extraSheetUrls
 * @returns {Promise<{ template: HTMLTemplateElement, sheets: CSSStyleSheet[] }>}
 */
export async function loadComponentFromFiles(templateUrl, ...extraSheetUrls) {
  const template = document.createElement('template');
  /** @type {CSSStyleSheet[]} */
  const sheets = [];

  const results = await Promise.allSettled([
    fetch(templateUrl)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load template ${templateUrl}: ${r.status} ${r.statusText}`);
        return r.text();
      })
      .then(html => { template.innerHTML = html; }),
    ...extraSheetUrls.map((url, i) =>
      fetch(url)
        .then(r => {
          if (!r.ok) throw new Error(`Failed to load stylesheet ${url}: ${r.status} ${r.statusText}`);
          return r.text();
        })
        .then(css => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(css);
          sheets[i] = sheet;
        })
    ),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[loadComponentFromFiles]', result.reason);
    }
  }

  return { template, sheets };
}
