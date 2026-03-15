/**
 *
 * @param {HTMLElement} element
 * @param {URL} templateUrl
 * @param {...URL} cssUrls
 * @return {Promise<ShadowRoot>}
 */
export async function loadWidgetAsShadow(element, templateUrl, ...cssUrls) {
  const [html, ...cssTexts] = await Promise.all([
    fetch(templateUrl).then((r) => r.text()),
    ...cssUrls.map((url) => fetch(url).then((r) => r.text())),
  ]);

  const template = document.createElement('template');
  template.innerHTML = html;

  const sheets = cssTexts.map((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  });

  element.attachShadow({ mode: 'open' });
  element.shadowRoot.adoptedStyleSheets = sheets;
  element.shadowRoot.appendChild(template.content.cloneNode(true));

  registerRemoveButton(element.shadowRoot);

  return element.shadowRoot;
}

/**
 * Register the remove-btn to dispatch a 'widget-removed' event when clicked,
 * which parent containers can listen for to remove the widget from the DOM.
 * @param {ShadowRoot} shadowRoot
 * @returns {void}
 */
function registerRemoveButton(shadowRoot) {
  const removeBtn = shadowRoot.getElementById('remove-btn');
  if (!removeBtn) return;

  removeBtn.addEventListener('click', () =>
    removeBtn.dispatchEvent(new CustomEvent('widget-removed', { bubbles: true, composed: true }))
  );
  removeBtn.disabled = false;
}

/**
 * Register's a buttons click event and enables it
 * @param {ShadowRoot} shadowRoot
 * @param {string} btnId
 * @param {Function} callback
 * @returns {HTMLButtonElement}
 */
export function registerButton(shadowRoot, btnId, callback) {
  const btn = shadowRoot.getElementById(btnId);
  if (!btn) return;

  btn.addEventListener('click', callback);
  btn.disabled = false;

  return btn;
}
