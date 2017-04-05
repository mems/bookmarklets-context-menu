DIST_ZIP=bookmarklets-context-menu.zip

.PHONY: dist
dist: $(DIST_ZIP)

.PHONY: clean
clean:
	rm $(DIST_ZIP)

$(DIST_ZIP): _locales background.js LICENSE manifest.json options README.md icons popup
	zip -r -9 $@ $^ -x "*.DS_Store" -x "*.git"