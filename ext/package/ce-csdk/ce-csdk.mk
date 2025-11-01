CE_CSDK_VERSION = v13.0
CE_CSDK_SITE_METHOD = git
CE_CSDK_SITE = https://github.com/CE-programming/toolchain.git
CE_CSDK_GIT_SUBMODULES = YES
CE_CSDK_DEPENDENCIES = host-ez80-llvm host-fasmg

define CE_CSDK_BUILD_CMDS
	$(MAKE) $(TARGET_CONFIGURE_OPTS) GIT_SHA=$(CE_CSDK_VERSION) VERSION_STRING=$(CE_CSDK_VERSION) CEDEV_VERSION=$(CE_CSDK_VERSION) -C $(@D) all
endef

define CE_CSDK_INSTALL_TARGET_CMDS
	$(MAKE) DESTDIR=$(TARGET_DIR) PREFIX=CEdev -C $(@D) install
	ln -sf /usr/bin/ez80-clang $(TARGET_DIR)/CEdev/bin/ez80-clang
	ln -sf /usr/bin/ez80-link $(TARGET_DIR)/CEdev/bin/ez80-link
	ln -sf /usr/bin/fasmg $(TARGET_DIR)/CEdev/bin/fasmg
	echo 'export PATH="$${PATH}:/CEdev/bin"' >$(TARGET_DIR)/etc/profile.d/cedev.sh
endef

$(eval $(generic-package))
