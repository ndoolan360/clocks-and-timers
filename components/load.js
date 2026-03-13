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

  await Promise.allSettled([
    fetch(templateUrl)
      .then(r => r.text())
      .then(html => { template.innerHTML = html; }),
    ...extraSheetUrls.map(url =>
      fetch(url)
        .then(r => r.text())
        .then(css => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(css);
          sheets.push(sheet);
        })
    ),
  ]);

  return { template, sheets };
}
