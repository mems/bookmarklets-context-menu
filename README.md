## Why use Bookmarklets context menu

[Current browsers' implementations of bookmarklets are broken](#why-current-browsers-implementations-of-bookmarklets-are-broken): bookmarklet are executed as author's script, but should be executed as user's scripts (with higher pivileges).

To circumvent restrictions, the extenxion _Bookmarklets context menu_ create a context menu with all bookmarklets available from user's bookmarks and executed it on demand as [content script](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts). This allow an access to a secured isolated environement, with higher privileges than author's scripts.

This context is defined as:

- `this` (global) is an extended `Window` object, include a small subset of WebExtension APIs and [DOM object `wrappedJSObject` property](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts#Accessing_page_script_objects_from_content_scripts): `Sandbox{browser, chrome, ...window}`
- `self` is the same as `window`, the top frame's global object

## Why current browsers' implementations of bookmarklets are broken?

> consider users over authors over implementors over specifiers over theoretical purity.

— [HTML Design Principles](https://www.w3.org/TR/html-design-principles/#priority-of-constituencies)

With current implementation, bookmarklet usage is restricted because bookmarklets are not executed as privileged scripts, but as author's script.
That means bookmarklet are subject to security measures like <abbr title="Content Security Policy">CSP</abbr> and <abbr title="Cross-Origin Resource Sharing">CORS</abbr> which make it use difficile or impossible in some cases.

See also [Wiki pages](https://github.com/mems/bookmarklets-context-menu/wiki)

## Limitations of this extension

This doesn't fix broken implementations. It's just an alternative.

- work well on Firefox Desktop, untested on Chrome and any other browser
- [Edge don't support bookmarks WebExtension API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/bookmarks#Browser_compatibility)
- options UI looks ugly, see [1275287 - Implement `chrome_style` in options V2 API.](https://bugzilla.mozilla.org/show_bug.cgi?id=1275287)

## Permissions required

The following permissions are used by the extension:

- `bookmarks`: read the bookmark tree to get all bookmarklets
- `contextMenus`: create context menus based on bookmarklets founded in bookmarks
- `activeTab`: execute bookmarklet script in the active tab
- `clipboardWrite`: allow to use [`document.execCommand('cut'/'copy')`](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Interact_with_the_clipboard) in bookmarklets
- `storage`: store some preferences like "flat context menu"
- `<all_urls>`: allow bookmarklets to perform `fetch()` or `XMLHttpRequest` without crossdomain limitations

## How to write a bookmarklet

**It's not recommended to use external resources.** But if you need external resources instead of load if with link, script or media tags (which are affected by CSP and CORS), use `fetch()` or `XMLHttpRequest`, and inject it with blob URI, data URI or inline (`style` and `script` tags). **Always load it with HTTPS.**

If the result of the bookmarklet is other than `undefined` (`void 0`), it will be used as HTML source of a new document opened in the same tab: `javascript:"<span style='text-decoration:underline'>Underlined text</span>"`

An example of a bookmarklet that copy the document's title (`document.title`):

	javascript:(s=>{let%20d=document,a=d.activeElement,l=e=>{d.removeEventListener("copy",l);e.preventDefault();e.clipboardData.setData("text/plain",s);};d.body.focus();d.addEventListener("copy",l);d.execCommand("copy");a.focus()})(document.title)
