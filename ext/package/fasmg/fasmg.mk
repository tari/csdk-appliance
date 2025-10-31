FASMG_VERSION = 20251007
FASMG_SOURCE = fasmg.ktge.zip
FASMG_SITE = https://flatassembler.net

define FASMG_EXTRACT_CMDS
	$(UNZIP) -d $(@D) $(FASMG_DL_DIR)/$(FASMG_SOURCE)
endef
HOST_FASMG_EXTRACT_CMDS = $(FASMG_EXTRACT_CMDS)

define FASMG_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m755 $(@D)/fasmg $(TARGET_DIR)/bin/fasmg
endef

define HOST_FASMG_INSTALL_CMDS
	$(INSTALL) -D -m755 $(@D)/fasmg $(HOST_DIR)/bin/fasmg
endef

$(eval $(generic-package))
$(eval $(host-generic-package))
