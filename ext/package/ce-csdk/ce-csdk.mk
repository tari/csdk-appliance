CE_CSDK_VERSION = 13.0
CE_CSDK_SOURCE = CEdev-linux.tar.gz
CE_CSDK_SITE = https://github.com/CE-Programming/toolchain/releases/download/v$(CE_CSDK_VERSION)
define CE_CSDK_INSTALL_TARGET_CMDS
	mkdir $(TARGET_DIR)/CEdev
	cp -r $(@D)/* $(TARGET_DIR)/CEdev
endef

$(eval $(generic-package))
