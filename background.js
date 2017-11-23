"use strict";

var browser = browser || chrome;//for Chrome

const CONTEXT_MENU_ITEM_ROOT_ID = "root";
const CONTEXT_MENU_ITEM_EMPTY_ID = "empty";
const CONTEXT_MENU_ITEM_UNTITLED = browser.i18n.getMessage("contextMenuItemUntitled");
const FOLDERS_GROUP_TITLES_SEP = " ▸ ";
const BOOKMARK_TREE_CHANGES_EVENTS = ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"];
const BOOKMARK_TREE_CHANGES_DELAY = 1000;//ms
const PREF_FLAT_CONTEXT_MENU = "flatContextMenu";
let invalidBookmarklets = new Set();

//browser.runtime.lastError

class Bookmarklet{
	constructor(source = "", title = ""){
		this.source = source;
		this.title = title;
	}
}

class BookmarkletFolder{
	constructor(children = [], title = ""){
		this.children = children;
		this.title = title;
	}
}

class BookmarkletFolderGroup extends BookmarkletFolder{
	constructor(folders = [], children = [], title = ""){
		super(children, title);
		this.folders = folders;
	}
}

// export for action popup
window.Bookmarklet = Bookmarklet;
window.BookmarkletFolder = BookmarkletFolder;
window.BookmarkletFolderGroup = BookmarkletFolderGroup;

function logRejection(context, reason){
	console.log(`${context} promise has been rejected: ${reason}`);
}

/**
 * Create bookmarklet tree from given bookmark
 * @returns {Bookmarklet|BookmarkletFolder|BookmarkletFolderGroup|null}
 */
function getBookmarkletTree(bookmark){
	let title = bookmark.title || CONTEXT_MENU_ITEM_UNTITLED;
	
	// If not a folder
	if(!bookmark.children){
		let url = bookmark.url;
		if(url && url.startsWith("javascript:")){
			let source;
			try{
				source = decodeURIComponent(url.slice(11))
			}
			catch(error){
				// error instanceof URIError)
				// Show this error only once
				if(!invalidBookmarklets.has(url)){
					invalidBookmarklets.add(url);
					console.warn(`The bookmark "${title}" contains invalid percent-encoding sequence.`);
				}
			}
			
			if(source){
				return new Bookmarklet(source, title);
			}
		}
		
		return null;
	}
	
	let children = bookmark.children.map(getBookmarkletTree).filter(value => value !== null);
	if(children.length == 0){
		return null;
	}
	
	let folder = new BookmarkletFolder(children, title);
	
	// Nested folders
	if(children.length == 1 && children[0] instanceof BookmarkletFolder){
		let solitaryFolder = children[0];
		
		// Already a group
		if(solitaryFolder instanceof BookmarkletFolderGroup){
			folder.children[0] = solitaryFolder.folders[0];// fix the tree
			solitaryFolder.folders.unshift(folder);// group that folder too
			solitaryFolder.title = solitaryFolder.folders.map(folder => folder.title).join(FOLDERS_GROUP_TITLES_SEP);
			return solitaryFolder;
		}
		
		return new BookmarkletFolderGroup([folder, solitaryFolder], solitaryFolder.children, folder.title + FOLDERS_GROUP_TITLES_SEP + solitaryFolder.title);
	}
	
	return folder;
}

/**
 * Handle context menu click event
 * Will execute corresponding bookmarklet script
 * @see executeBookmarkletSource()
 */
function contextMenuItemClick(bookmarklet, data, tab){
	executeBookmarklet(bookmarklet, tab);
}

/**
 * Execute bookmarklet script, without javascript:
 */
function executeBookmarklet(bookmarklet){
	let code = bookmarklet.source;
	let escapedCodeForDbQuotes = code.replace(/(\\|")/g, "\\$1").replace(/\n/g, "\\n");//escaped code for injection in double quotes string (one line)

	// The code can be an Expression or a Statment(s). The last instruction value will be used as return value
	// Undeclared variables are always global in sloppy mode
	// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
	// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/var
	
	// Firefox allow to execute code in 2 different contexts: content script or page. But the last one could be forbidden by the CSP
	// https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts#Using_eval()_in_content_scripts
	
	let contentScript = `
	{
		// Hide all global properties/function should not be available like .chrome or .browser WebExtension APIs
		window.chrome = window.browser = undefined;
		if(typeof chrome != "undefined") chrome = undefined;
		if(typeof browser != "undefined") browser = undefined;
		
		// Declare function to import scripts
		// See browser.tabs.executeScript()
		/*
		function importScripts(urls...){
			for(let url of urls)
			//code = xhr/fetch(url)
			//eval(code)
		}
		*/
		// See browser.tabs.insertCSS() and browser.tabs.removeCSS()
		/*
		function importStyles(urls...){
			
		}
		*/

		// Catch syntax error or any other API or custom errors
		let value;
		try{
			// Note: Chrome doesn't have secured scope https://developer.chrome.com/extensions/content_scripts#execution-environment
			// Use strict mode to catch undeclared variable
			value = eval("${escapedCodeForDbQuotes}\\n//# sourceURL=javascript:${encodeURIComponent(code)}");
		}catch(error){
			eval(\`console.log("Bookmarklet error:\\\\n%o", error);\\n//# sourceURL=javascript:${encodeURIComponent(code)}\`);
		}
	
		// Handle returned value
		if(value !== undefined){
			stop();// stop the document loading to allow document.write to erase the current DOM
			var doc = wrappedJSObject.document;//document as unsecure
			doc.open();
			doc.write(value);
			doc.close();
			history.pushState("", null, "");// For Firefox, allow to go to the original page 
			//location = \`data:text/html;charset=utf-8,\${encodeURIComponent(value)}\`;
		}
	}
	`;
	
	/*
	executeScript can be rejected for host mismatch: "Error: No window matching {"matchesHost":[]}"
	or privileged URIs like: chrome://* or *://addons.mozilla.org/
	(or script syntaxe)
	See https://bugzilla.mozilla.org/show_bug.cgi?id=1310082
	
	executeScript can be rejected for script error (syntax or privilege)
	*/
	return browser.tabs.executeScript({
		code: contentScript,
		runAt: "document_start"
	}).catch(logRejection.bind(null, "bookmarklet execution"));
}

/**
 * Create all context menu for the given bookmarklet tree
 */
function createAllContextMenuItems(bookmarklets, flat = false){
	// Remove all remains context menu
	browser.contextMenus.removeAll();
	
	let bookmarkletsRoot = bookmarklets[0];
	// add root context menu
	let parentID = browser.contextMenus.create({
		id: CONTEXT_MENU_ITEM_ROOT_ID,
		title: browser.i18n.getMessage("contextMenuItemRoot"),
		contexts: ["all"]
	});

	// If no bookmarklets
	if(!bookmarkletsRoot || bookmarkletsRoot instanceof BookmarkletFolder && bookmarkletsRoot.children.length == 0){
		browser.contextMenus.create({
			id: CONTEXT_MENU_ITEM_EMPTY_ID,
			title: browser.i18n.getMessage("contextMenuItemEmpty"),
			parentId: parentID,
			contexts: ["all"]
		});
		return;
	}

	// If only one folder (or folder group) list direcly its children
	if(bookmarkletsRoot instanceof BookmarkletFolder){
		createContextMenuItemsList(bookmarkletsRoot.children, parentID, flat);
	} else {
		createContextMenuItems(bookmarkletsRoot, parentID, flat);
	}
}

/**
 * Create a context menu entry for the given bookmarklet
 */
function createContextMenuItems(bookmarklet, parentContextMenuID, flat = false){
	// If a folder of bookmarklets
	if(bookmarklet instanceof BookmarkletFolder){
		let parentID = parentContextMenuID;
		let children = bookmarklet.children;
		
		if(!flat){
			parentID = browser.contextMenus.create({
				title: bookmarklet.title,
				parentId: parentContextMenuID,
				contexts: ["all"]
			});
		}
		
		createContextMenuItemsList(children, parentID, flat);
		
		return;
	}
	
	browser.contextMenus.create({
		title: bookmarklet.title,
		parentId: parentContextMenuID,
		onclick: contextMenuItemClick.bind(null, bookmarklet),
		contexts: ["all"]
	});
}

/**
 * Create context menu entries for an array of bookmarklets
 */
function createContextMenuItemsList(bookmarklets, parentID, flat){
	bookmarklets.forEach((bookmarklet, index, bookmarklets) => {
		// if not first one and is folder or the previous is a folder
		if(index > 0 && (bookmarklet instanceof BookmarkletFolder || bookmarklets[index - 1] instanceof BookmarkletFolder)){
			browser.contextMenus.create({
				type: "separator",
				parentId: parentID,
				contexts: ["all"]
			});
		}
		
		createContextMenuItems(bookmarklet, parentID, flat)
	});
}

/**
 * Build or rebuild the context menu
 * @returns Promise
 */
function updateContextMenu(){
	return Promise.all([gettingBookmarkletTree, gettingFlatPref]).then(([bookmarklets, flat]) => createAllContextMenuItems(bookmarklets, flat), logRejection.bind(null, "update context menu"));
}

/**
 * Get the bookmarklet tree
 * @returns Promise
 */
function getBookmarkletTreePromise(){
	return browser.bookmarks.getTree().then(bookmarks => [getBookmarkletTree(bookmarks[0])], logRejection.bind(null, "get bookmarklets tree"));
}

/**
 * Bookmark tree events handler throttle / debounce function
 */
function updateDebounced(){
	if(updateTimeoutID){
		// Wait to update timeout
		return;
	}
	
	updateTimeoutID = setTimeout(() => {
		updateTimeoutID = 0;
		gettingBookmarkletTree = getBookmarkletTreePromise();// update bookmarklet tree
		updateContextMenu();
	}, BOOKMARK_TREE_CHANGES_DELAY);
}

let updateTimeoutID = 0;
// Promise for flat context menu perference
var gettingFlatPref = browser.storage.local.get(PREF_FLAT_CONTEXT_MENU).then(result => Boolean(result[PREF_FLAT_CONTEXT_MENU]), logRejection.bind(null, "get preferences"));
// Promise for bookmarklet tree. The first time is set, enable browser action
var gettingBookmarkletTree = getBookmarkletTreePromise().then(bookmarklets => (browser.browserAction.enable(), bookmarklets));

// Inert context menu (disabled). Wait bookmarks retrival
browser.contextMenus.create({
	id: CONTEXT_MENU_ITEM_ROOT_ID,
	title: browser.i18n.getMessage("contextMenuItemRoot"),
	contexts: ["all"],
	enabled: false
});
// Disable browser action. Wait bookmarks retrival
browser.browserAction.disable();

// Add bookmark tree changes event listeners
// Don't handle onImportBegan and onImportEnded, but because we debounce (delay) update, it should be fine
{
	const bookmarks = browser.bookmarks;
	for(let event of BOOKMARK_TREE_CHANGES_EVENTS){
		// Event not supported
		if(typeof bookmarks[event] === "undefined" || typeof bookmarks[event].addListener !== "function"){
			continue;
		}
		
		bookmarks[event].addListener(updateDebounced);
	}
}

// Listen preferences changes
browser.storage.onChanged.addListener((changes, areaName) => {
	// Ignore all others storage areas
	if(areaName != "local"){
		return;
	}
	
	let flatPrefChange = changes[PREF_FLAT_CONTEXT_MENU];
	if(flatPrefChange && flatPrefChange.oldValue != flatPrefChange.newValue){
		gettingFlatPref = Promise.resolve(Boolean(flatPrefChange.newValue));
		update();
	}
});

// Start
updateContextMenu();
