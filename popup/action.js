"use strict";

var browser = browser || chrome;//for Chrome

// Note: insertAdjacentHTML is considered unsafe by AMO when concatenated with variables

// panelListItemTemplate
{
	/*
	<div class="panel-list-item">
		<div class="text">${label}</div>
	</div>`
	*/
	let root = document.createElement("div");
	root.classList.add("panel-list-item");
	let text = document.createElement("div");
	text.classList.add("text");
	root.appendChild(text);
	const panelListItemTemplate = root;
}

// panelTemplate
{
	/*
	<div class="panel">
		<div class="panel-section panel-section-list"></div>
	</div>
	*/
	let root = document.createElement("div");
	root.classList.add("panel");
	let section = document.createElement("div");
	section.classList.add("panel-section", "panel-section-list");
	root.appendChild(section);
	const panelTemplate = root;
}

// separatorTemplate
{
	/*
	<div class="panel-section-separator"></div>
	*/
	let root = document.createElement("div");
	root.classList.add("panel-section-separator");
	const separatorTemplate = root;
}


function createPanelListItem(label){
	let element = panelListItemTemplate.cloneNode();
	element.querySelector(".text").textContent = label;
	
	return element;
}

function createPanel(){
	let element = panelTemplate.cloneNode();
	
	return element;
}

function createSeparator(){
	let element = separatorTemplate.cloneNode();
	
	return element;
}

function logRejection(context, reason){
	console.log(`${context} promise has been rejected: ${reason}`);
}

/**
 * Create all context menu for the given bookmarklet tree
 */
function createAllContextMenuItems(bookmarklets, flat = false){
	let body = document.body;
	let node;
	// Remove all remains context menu
	while (node = body.firstChild) {
		node.remove();
	}
	
	// Create pannel
	body.appendChild(createPanel());
	let parent = body.lastChild.querySelector(".panel-section-list")
	
	let bookmarkletsRoot = bookmarklets[0];
	// If no bookmarklets
	if(!bookmarkletsRoot || bookmarkletsRoot instanceof backgroundWindow.BookmarkletFolder && bookmarkletsRoot.children.length == 0){
		parent.appendChild(createPanelListItem(browser.i18n.getMessage("contextMenuItemEmpty")));
		return;
	}
	
	// If only one folder (or folder group) list direcly its children
	if(bookmarkletsRoot instanceof backgroundWindow.BookmarkletFolder){
		createContextMenuItemsList(bookmarkletsRoot.children, parent, flat);
	} else {
		createContextMenuItems(bookmarkletsRoot, parent, flat);
	}
}

/**
 * Create a context menu entry for the given bookmarklet
 */
function createContextMenuItems(bookmarklet, parentContextMenu, flat = false){
	// If a folder of bookmarklets
	if(bookmarklet instanceof backgroundWindow.BookmarkletFolder){
		let parent = parentContextMenu;
		let children = bookmarklet.children;
		
		if(children.length == 0){
			return;
		}
		
		if(!flat){
			// TODO, add panel?
			parentContextMenu.appendChild(createPanelListItem(bookmarklet.title));
			parent = parentContextMenu.lastChild;
		}
		
		createContextMenuItemsList(children, parent, flat);
		
		return;
	}
	
	parentContextMenu.appendChild(createPanelListItem(bookmarklet.title));
	parentContextMenu.lastChild.addEventListener("click", contextMenuItemClick.bind(null, bookmarklet));
}

/**
 * Create context menu entries for an array of bookmarklets
 */
function createContextMenuItemsList(bookmarklets, parent, flat){
	bookmarklets.forEach((bookmarklet, index, bookmarklets) => {
		// if not first one and is folder or the previous is a folder
		if(index > 0 && (bookmarklet instanceof backgroundWindow.BookmarkletFolder || bookmarklets[index - 1] instanceof backgroundWindow.BookmarkletFolder)){
			parent.appendChild(createSeparator());
		}
		
		createContextMenuItems(bookmarklet, parent, flat)
	});
}

function contextMenuItemClick(bookmarklet, event){
	// don't use connect port here to be sure only privilegied scripts of this extension can use it (no other addon or bookmarklet/content script)
	backgroundWindow.executeBookmarklet(bookmarklet);
	window.close();
}

// DOMContentLoaded promise
let domContentLoaded = new Promise(resolve => {
	if(document.readyState === "interactive" || document.readyState === "complete"){
		resolve(true);
		return;
	}
	
	document.addEventListener("DOMContentLoaded", event => resolve(true));
});

let backgroundWindow = null;

Promise.all([domContentLoaded, browser.runtime.getBackgroundPage()]).then(([domContentLoaded, pageWindow]) => {
	backgroundWindow = pageWindow;
	//return Promise.all(pageWindow.gettingBookmarkletTree, pageWindow.gettingFlatPref).then(([bookmarklets, flat]) => createAllContextMenuItems(bookmarklets, flat));
	return pageWindow.gettingBookmarkletTree.then(bookmarklets => createAllContextMenuItems(bookmarklets, true));// TODO support non flat tree
}, logRejection.bind(null, "get background page"));
