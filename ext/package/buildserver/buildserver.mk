BUILDSERVER_VERSION = 1.0.0
BUILDSERVER_SITE = $(BR2_EXTERNAL_CSDK_APPLIANCE_PATH)/../sdkserver
BUILDSERVER_SITE_METHOD = local
BUILDSERVER_SETUP_TYPE = poetry

define BUILDSERVER_INSTALL_INIT_SYSV
	$(INSTALL) -m 0755 -D $(@D)/S99buildserver.sh $(TARGET_DIR)/etc/init.d/S99buildserver.sh
endef

$(eval $(python-package))
