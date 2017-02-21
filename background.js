"use strict";

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8");

const HASH_ALGORITHMS = new Map([
	["sha256", {byteLength: 32, cryptoID: "SHA-256"}],
	["sha384", {byteLength: 48, cryptoID: "SHA-384"}],
	["sha512", {byteLength: 64, cryptoID: "SHA-512"}],
]);

const DEFAULT_SOURCE_HASH_ALGO = "sha256";// see HASH_ALGORITHMS

// Use search({}) to get all bookmark nodes instead of tree traversal (using browser.bookmarks.getTree() + https://en.wikipedia.org/wiki/Tree_traversal)
let gettingBookmarkletSourceHashes = browser.bookmarks.search({}).then(filterBookmarklets).then(bookmarklets => getBookmarkletSourceHashes(bookmarklets, DEFAULT_SOURCE_HASH_ALGO));
let randomBytes = new Uint8Array(HASH_ALGORITHMS.get(DEFAULT_SOURCE_HASH_ALGO).byteLength);// will be filled with random bytes to generate fake source hashes

// See https://tools.ietf.org/html/rfc5234#appendix-B.1
// and https://www.w3.org/TR/CSP2/#source-list-syntax
const CSP_HEADER = "Content-Security-Policy"
const WSP = /[ \t]+/;// space or horizontal space
const EMPTY_TOKEN = /^[ \t]*$/;
/*
^
[\t ]*                                        // *WSP
([a-zA-Z0-9\-]+)                              // directive-name
(?:[\t ]([\t\x20-\x2b\x2d-\x3A\x3C-\x7E]*))?  // [ WSP directive-value ]
$
*/
const CSP_DIRECTIVE_TOKEN = /^[\t ]*([a-zA-Z0-9\-]+)(?:[\t ]([\t\x20-\x2b\x2d-\x3A\x3C-\x7E]*))?$/;
const CSP_SCRIPT_SRC = "script-src";
const CSP_DEFAULT_SRC = "default-src";
// Some keywords:
const CSP_SRC_NONE = "'none'";
const CSP_UNSAFE_INLINE = "'unsafe-inline'";

/**
 * Get source hash (as it's used in CSP) from hash bytes (generated from a digest function
 * @see https://www.w3.org/TR/CSP2/#hash_source
 */
function getSourceHashFromHashBytes(hashBytes, algo = "sha512"){
	hashBytes = new Uint8Array(hashBytes);
	let hashAlgo = HASH_ALGORITHMS.get(algo);
	if(!hashAlgo){
		throw new Error(`Unsupported hash algorithm "${algo}"`);
	}
	
	if(hashBytes.length != hashAlgo.byteLength){
		throw new Error(`Invalid hash length: ${hashBytes.length}B (required: ${hashAlgo.byteLength}B)`);
	}
	
	let valueChars = hashBytes.reduce((chars, byte) => (chars += String.fromCharCode(byte), chars), "");// to UTF-8
	let base64Value = btoa(valueChars);
	return "'" + algo + "-" + base64Value + "'";// "'" hash-algo "-" base64-value "'"
}

/**
 * Get source hash from source
 * @param source String Source text to get hash
 * @param algo Hash algorithm. All CSP2 allowed algorithms: "sha256" / "sha384" / "sha512". See https://www.w3.org/TR/CSP2/#hash_algo
 * @example getSourceHash("alert('Hello, world.');"); // resolve as "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='"
 * @returns Promise
 */
function getSourceHash(source, algo = "sha512"){
	let hashAlgo = HASH_ALGORITHMS.get(algo);
	if(!hashAlgo){
		throw new Error(`Unsupported hash algorithm "${algo}"`);
	}
	
	let sourceBytes = utf8Encoder.encode(source);
	return crypto.subtle.digest(hashAlgo.cryptoID, sourceBytes).then(valueBuffer => getSourceHashFromHashBytes(valueBuffer, algo));
}

/**
 * Get only bookmarklets (starting with javascript protocol)
 */
function filterBookmarklets(bookmarkNodes){
	let bookmarkletNodes = [];
	for(let node of bookmarkNodes){
		let url = node.url;
		if(url && url.startsWith("javascript:")){
			bookmarkletNodes.push(node);
		}
	}
	return bookmarkletNodes;
}

/**
 * Get source hashes of given bookmarks and the algorithm to use
 * @param bookmarklets Array
 * @param algo String
 * @see https://html.spec.whatwg.org/multipage/browsers.html#navigating-across-documents:javascript-protocol
 * @returns Promise Resolved with an new array of hashes
 */
function getBookmarkletSourceHashes(bookmarklets, algo = "sha512"){
	let hashesPromises = [];
	for(let bookmarklet of bookmarklets){
		let url = bookmarklet.url;
		let source = "";
		// folder or non "javascript:" URI = empty source
		if(url && url.startsWith("javascript:")){
			source = decodeURIComponent(url.slice(11));
		}
		
		hashesPromises.push(getSourceHash(source, algo));
	}
	//hashesPromises.push(getSourceHash("alert('Hello, world.');", algo));
	return Promise.all(hashesPromises);
}

/**
 * Get bookmarklet + random source hashes
 * @returns Array The provided sourceHashes array with new random hashes (see count) added to the end
 */
function addRandomSourceHashes(sourceHashes, algo = "sha512", count = 10){
	let hashAlgo = HASH_ALGORITHMS.get(algo);
	if(!hashAlgo){
		throw new Error(`Unsupported hash algorithm "${algo}"`);
	}
	
	if(randomBytes.length != hashAlgo.byteLength){
		throw new Error(`randomBytes length don't match algo: ${randomBytes.length}B (required: ${hashAlgo.byteLength}B)`);
	}
	
	for(let i = 0; i < count; i++){
		crypto.getRandomValues(randomBytes);// fill with random to fake a hash bytes
		sourceHashes.push(getSourceHashFromHashBytes(randomBytes, algo));
	}
	
	return sourceHashes;
}

/**
 * Suffle array elements. Aka randomize, random permutation. Use Fisher–Yates shuffle
 * @see https://bost.ocks.org/mike/shuffle/
 * @see https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
 * @returns Array The provided array with all elements shuffled
 */
function shuffle(array) {
	let index = array.length;
	
	// While there remain elements to shuffle…
	while (index) {
		// Pick a remaining element…
		let destIndex = Math.floor(Math.random() * index--);
		
		// And swap it with the current element.
		let current = array[index];
		array[index] = array[destIndex];
		array[destIndex] = current;
	}
	
	return array;
}

/*
 * Rewrite the CSP header.
 * @see https://www.w3.org/TR/CSP2/#policy-syntax
 * @see https://tools.ietf.org/html/rfc5234 RFC 5234 - Augmented BNF for Syntax Specifications: ABNF
 */
function rewriteCSPHeader(details){
	let responseHeaders = details.responseHeaders;
	let cspHeaderNameLower = CSP_HEADER.toLowerCase();
	let cspHeader = responseHeaders.find(header => header.name.toLowerCase() == cspHeaderNameLower);// Find the first CSP header, case insensitive
	let response = {responseHeaders};
	
	// Ignore the rest if no CSP header is founded
	if(!cspHeader){
		return response;
	}
	
	return gettingBookmarkletSourceHashes.then(sourceHashes => {
		// If no hashes, ignore below
		if(sourceHashes.length == 0){
			return response;
		}
		
		// Add random hashes + suffle
		sourceHashes = shuffle(addRandomSourceHashes(sourceHashes, DEFAULT_SOURCE_HASH_ALGO, Math.round(Math.random() * 50)));
		
		let value = cspHeader.value;//or cspHeader.binaryValue?
		let directives = value.split(";").reduce((directives, token) => {
			// Don't generate parse error
		
			// Empty token, skip
			if(EMPTY_TOKEN.test(token)){
				return directives;
			}
		
			let directiveParseResult = CSP_DIRECTIVE_TOKEN.exec(token);
			// Invalid directive
			if(!directiveParseResult){
				return directives;
			}
		
			let [, directiveName = "", directiveValue = ""] = directiveParseResult;
			directiveName = directiveName.toLowerCase();
		
			if(directiveName != "" && !directives.has(directiveName)){
				directives.set(directiveName, directiveValue);
			}
			
			return directives;
		}, new Map());
	
		// If script-src is not define, should use the same value as default-src https://www.w3.org/TR/CSP2/#directive-default-src
		if(!directives.has(CSP_SCRIPT_SRC)){
			// Ignore below, because both default-src and script-src are not defined (ex: "content-security-policy: upgrade-insecure-requests"), means all sources are allowed
			if(!directives.has(CSP_DEFAULT_SRC)){
				return response;
			}
			
			directives.set(CSP_SCRIPT_SRC, directives.get(CSP_DEFAULT_SRC) || "");
		}
	
		// Parse script-src source list
		let sourceList = new Set(directives.get(CSP_SCRIPT_SRC).split(WSP));
		sourceList.delete("");// remove empty sources (because start and/or end with WSP)
		sourceList.delete(CSP_SRC_NONE);// remove none source, because we have sources
		let hasHashOrNonce;// if at least one hash or one nonce if defined
		{
			let prefixes = ["'nonce-"];
			HASH_ALGORITHMS.forEach((value, key) => prefixes.push(`'${key}-`));
			
			hasHashOrNonce = !!Array.from(sourceList).find(source => prefixes.find(prefix => source.startsWith(prefix)));
		}
		
		// Some keywords allow javascript scheme
		// If both unsafe-inline and a nonce or a hash are defined, all inline scripts must have a nonce or a hash,
		// see https://www.w3.org/TR/CSP2/#directive-script-src
		if(sourceList.has(CSP_UNSAFE_INLINE) && !hasHashOrNonce){
			return response;
		}
	
		// Append all hashes to script-src directive source list
		for(let sourceHash of sourceHashes){
			sourceList.add(sourceHash);
		}
	
		directives.set(CSP_SCRIPT_SRC, Array.from(sourceList).join(" "));// update script-src directive
		let directiveList = [];
		directives.forEach((value, name) => directiveList.push(`${name} ${value}`));//reduce map to array
		
		console.info(`CSP update for ${details.url}:\n${cspHeader.value}\n→\n${directiveList.join(";")}`);
		
		cspHeader.value = directiveList.join(";");// update the CSP header's value
	
		return response;
	});
}

/*
Add rewriteCSPHeader as a listener to onHeadersReceived, only for the target page.
Make it "blocking" so we can modify the response headers.
*/
browser.webRequest.onHeadersReceived.addListener(
	rewriteCSPHeader,
	{
		urls: ["*://*/*"],
		types: ["main_frame", "sub_frame"]/*What about SVGs?*/
	},
	["blocking", "responseHeaders"]
);