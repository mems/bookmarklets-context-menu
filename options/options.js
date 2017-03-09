const PREF_FLAT_CONTEXT_MENU = "flatContextMenu";

function saveOptions(event) {
	event.preventDefault();
	
	browser.storage.local.set({
		[PREF_FLAT_CONTEXT_MENU]: document.getElementById("flatContextMenu").checked
	});
}

/**
 * Localize a string
 * Return ?? if the translation missing (Firefox)
 */
function l10nString(value){
	return value.replace(/__MSG_(.+)__/g, (match, group1) => browser.i18n.getMessage(group1));
}

/**
 * Localize a document. Search and replace in all text nodes and attributes
 */
function l10nDocument(document){
	document.normalize();// merge all adjacent text nodes
	let nodeIterator = document.createNodeIterator(
		document.documentElement,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
		node => node.nodeType == Node.ELEMENT_NODE && node.hasAttributes() || node.nodeType == Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
	);
	while(nodeIterator.nextNode()){
		let node = nodeIterator.referenceNode;
		
		if(node.nodeType == Node.TEXT_NODE){
			node.nodeValue = l10nString(node.nodeValue);
			continue;
		}
		
		if(node.nodeType == Node.ELEMENT_NODE){
			Array.from(node.attributes).forEach(attr => {
				let value = attr.value;
				let newValue = l10nString(value);
				if(newValue == value){
					return;
				}
				
				node.setAttribute(attr.name, newValue);
			});
			continue;
		}
	}
}

// DOM is ready
function domReady() {
	l10nDocument(document);
	
	document.getElementById("form").addEventListener("submit", saveOptions);
	browser.storage.local.get(PREF_FLAT_CONTEXT_MENU)
		.then(storage => {
			let input = document.getElementById("flatContextMenu");
			input.disabled = false;
			input.checked = Boolean(storage[PREF_FLAT_CONTEXT_MENU]);

			document.getElementById("submit").disabled = false;
		});
}

document.addEventListener("DOMContentLoaded", domReady);