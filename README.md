**⚠️ This addon don't work because <abbr title="Content Security Policy">CSP</abbr> don't allow to use `source-hash` for javascript URIs:**

> if at least one [nonce-source](https://www.w3.org/TR/CSP2/#nonce_source) or [hash-source](https://www.w3.org/TR/CSP2/#allowed-script-sources) is present in the list of [allowed script sources](https://www.w3.org/TR/CSP2/#allowed-script-sources):
> - [...]
> - Whenever the user agent would execute script contained in a javascript URL, instead the user agent MUST NOT execute the script, and MUST [report a violation](https://www.w3.org/TR/CSP2/#report-a-violation).

— [Content Security Policy Level 2](https://www.w3.org/TR/CSP2/#directive-script-src)


> The inline script restrictions imposed by CSP include script valued attributes (commonly used for DOM Level 0 event handlers, e.g. onclick); hash-source and nonce-source cannot help you with these.  Currently CSP does not provide mechanisms to apply directives to such script valued attributes but let’s see what the future brings!

— [CSP for the web we have | Mozilla Security Blog](https://blog.mozilla.org/security/2014/10/04/csp-for-the-web-we-have/)

We can't use `'unsafe-inline'` because it will break the security policy defined by the website, by allowing inline script too widely.

Limitation: [Edge don't support bookmarks WebExtension API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/bookmarks#Browser_compatibility) and [asynchronous event listeners in WebExtension API are not supported everywhere](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/onHeadersReceived#Browser_compatibility)

Note: WebDeveloper tools network tab display original header (as defined before addon rewrite it).

Note: Does browsers have a internal limit (client side) for header length?
