DIST_DIR=dist
DIST_ZIP:=$(DIST_DIR)/bookmarklets-context-menu.zip

.PHONY: dist
dist: $(DIST_ZIP)

.PHONY: clean
clean:
	rm -r $(DIST_DIR)

$(DIST_ZIP): _locales background.js LICENSE manifest.json options README.md icons popup
	mkdir -p $$(dirname $@)
	zip -r -9 $@ $^ -x "*.DS_Store" -x "*.git"
