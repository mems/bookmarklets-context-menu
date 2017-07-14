![Firefox capture of Bookmarklets context menu: Context menu opened with a folder and a bookmarklet "Copy page as Markdown link"](capture_firefox_desktop.png)

This extension is available for [Firefox (via AMO)](https://addons.mozilla.org/firefox/addon/bookmarklets-context-menu/)

## Why use Bookmarklets context menu

[Current browsers' implementations of bookmarklets are broken](#why-current-browsers-implementations-of-bookmarklets-are-broken): bookmarklet are executed as author's script, but should be executed as user's scripts (with higher pivileges).

To circumvent this restrictions, the extension _Bookmarklets context menu_ create a context menu with all bookmarklets available from user's bookmarks and executed it on demand as [content script](https://developer.mozilla.org/Add-ons/WebExtensions/Content_scripts). This allow access to a secured isolated environement, with higher privileges than author's scripts.

<!--
This context is defined as:

- `this` (global) is an extended `Window` object, include a small subset of WebExtension APIs and [DOM object `wrappedJSObject` property](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts#Accessing_page_script_objects_from_content_scripts): `const Sandbox = {browser, chrome, ...window}`
- `self` is the same as `window`, the top frame's global object
-->

Note: **CSP still applied to subresources** (like scripts, styles, medias, etc.). That means with a super strict CSP "none", you can't use any additional scripts, styles nor medias.

If you need to load a resource, create an iframe with an "unique origin" ([`allow-same-origin` disabled](https://developer.mozilla.org/docs/Web/HTML/Element/iframe#attr-sandbox)):

	// On a page with a strict CSP like `default-src 'self'`	
	let iframe = document.createElement("iframe");
	iframe.srcdoc = `<html><head><script src="https://code.jquery.com/jquery-latest.min.js"></script></head><body><script>$(document.body).text("Hello from jQuery")</script><img src="https://fr.wikipedia.org/static/images/project-logos/enwiki.png" alt="Wikipedia logo"></body></html></iframe>`;
	iframe.sandbox = "allow-scripts";
	document.body.appendChild(iframe);

If the page block the context menu, you can use the browser action of context menu:

![Firefox capture of Bookmarklets context menu: Browser action highlighted](capture_firefox_browser_action.png)

## Why current browsers' implementations of bookmarklets are broken?

> consider users over authors over implementors over specifiers over theoretical purity.

— [HTML Design Principles](https://www.w3.org/TR/html-design-principles/#priority-of-constituencies)

With current implementation, bookmarklet usage is restricted because bookmarklets are not executed as privileged scripts, but as author's script.
That means bookmarklet are subject to security measures like <abbr title="Content Security Policy">CSP</abbr> and <abbr title="Cross-Origin Resource Sharing">CORS</abbr> which make it difficulte to use or impossible in some cases.

See also [Wiki pages](https://github.com/mems/bookmarklets-context-menu/wiki)

## Limitations of this extension

This doesn't fix broken implementations. It's just an alternative.

- work well on Firefox Desktop, untested on Chrome and any other browser
- [Edge don't support bookmarks WebExtension API](https://developer.mozilla.org/Add-ons/WebExtensions/API/bookmarks#Browser_compatibility)
- options UI looks ugly, see [1275287 - Implement `chrome_style` in options V2 API.](https://bugzilla.mozilla.org/show_bug.cgi?id=1275287)

## Permissions required

The following permissions are used by the extension:

- `bookmarks`: read the bookmark tree to get all bookmarklets
- `contextMenus`: create context menus based on bookmarklets founded in bookmarks
- `activeTab`: execute bookmarklet script in the active tab
- `clipboardWrite` and `clipboardRead`: allow to use [`document.execCommand('cut'/'copy'/'paste')`](https://developer.mozilla.org/Add-ons/WebExtensions/Interact_with_the_clipboard) in bookmarklets
- `storage`: store some preferences like "flat context menu"
- `<all_urls>`: allow bookmarklets to perform `fetch()` or `XMLHttpRequest` without crossdomain limitations

## How to write a bookmarklet

**It's not recommended to use external resources.** But if you need external resources instead of load if with link, script or media tags (which are affected by CSP and CORS), use `fetch()` or `XMLHttpRequest`, and inject it with blob URI, data URI or inline (`style` and `script` tags). **Always load it with HTTPS.**

If the result of the bookmarklet is other than `undefined` (`void 0`), it will be used as HTML source of a new document opened in the same tab: `javascript:"<span style='text-decoration:underline'>Underlined text</span>"`

An example of a bookmarklet that copy the document's title (`document.title`):

	javascript:(s=>{let%20d=document,l=e=>{d.removeEventListener("copy",l);e.preventDefault();e.clipboardData.setData("text/plain",s);};if(d.activeElement.tagName=="IFRAME"){let%20s=d.createElement("span");s.tabIndex=-1;s.style.position="fixed";d.body.appendChild(s);s.focus();s.remove()}d.addEventListener("copy",l);d.execCommand("copy");a.focus()})(document.title)

An example of a bookmarklet that copy the page as [Markdown link](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet#links):

	javascript:{let%20d=document,u=d.URL,t="head%20title,h1,h2".split(",").map(s=>d.querySelector(s)).reduce((a,e)=>a||e&&e.textContent.replace(/\s+/g,"%20").trim(),"")||u,z=u.replace(/\(/g,"%2528").replace(/\)/g,"%2529"),l=e=>{let%20c=e.clipboardData,s=c.setData.bind(c);d.removeEventListener("copy",l);e.preventDefault();c.clearData();s("text/x-moz-url",u);s("text/uri-list",u);s("text/html",`<a%20href="${u}">${t.replace(/[&<>"']/g,m=>`&${{"&":"amp","<":"lt",">":"gt",'"':"quot","'":"apos"}[m]};`)}</a>`);s("text/plain",t==u?z:`[${t.replace(/([<>\[\]])/g,"\\$1")}](${z})`)};if(d.activeElement.tagName=="IFRAME"){let%20s=d.createElement("span");s.tabIndex=-1;s.style.position="fixed";d.body.appendChild(s);s.focus();s.remove()}d.addEventListener("copy",l);d.execCommand("copy");void(0)}

If you need `document.execCommand()`, be sure there is no iframe focused:

	// execCommand will not been executed if an iframe is focused
	if(document.activeElement.tagName == "IFRAME"){
		let focusable = document.createElement("span");
		focusable.tabIndex = -1;// focusable
		focusable.setAttribute("aria-hidden", "true");// will not be announced by AT
		focusable.style.position = "fixed";
		document.body.appendChild(focusable);
		focusable.focus();// force focus, but will not scroll into view, because it have fixed position
		focusable.remove();// remove focus, without force to scroll into view to an other element
	}
	let listener = event => {
		document.removeEventListener("copy", listener);// one time listener
		// Do whaterver you want. Exemple: in copy event, use event.clipboardData
	};
	document.addEventListener("copy", listener);
	document.execCommand("copy");// will dispatch copy event
