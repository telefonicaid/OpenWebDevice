GIT ?= git

OWD_APPS ?= $(abspath apps)
GAIA_PATH ?= $(abspath gaia)
GAIA_APPS ?= $(GAIA_PATH)/apps
OUT_DIR ?= $(abspath out)
OUT_DIR_APPS ?= $(OUT_DIR)/apps

all: install-owd

sync-develop:
	$(GIT) checkout develop
	$(GIT) pull origin develop
	$(GIT) submodule sync
	$(GIT) submodule update --init

sync-master:
	$(GIT) checkout master
	$(GIT) pull origin master
	$(GIT) submodule sync
	$(GIT) submodule update --init

.PHONY: out
out:
	@echo "Creating output dir..."; \
	rm -rf $(GAIA_PATH)/profile; \
	if [ ! -d $(OUT_DIR) ]; \
	then \
		mkdir $(OUT_DIR); \
	fi; \
	cp -r gaia/* $(OUT_DIR)/;

.PHONY: owd-apps
owd-apps: out
	@echo "Moving OWD apps to Gaia..."
	@cd $(OWD_APPS); \
	for d in `find * -maxdepth 0 -type d` ;\
	do \
		if [ -f $$d/manifest.webapp ]; \
		then \
			echo $$d; \
			if [ -d $(GAIA_APPS)/$$d ]; \
			then \
				rm -rf $(OUT_DIR_APPS)/$$d; \
			fi; \
			cp -r $(OWD_APPS)/$$d $(OUT_DIR_APPS); \
		fi \
	done

install-owd: owd-apps
	$(MAKE) -C $(OUT_DIR) install-gaia
