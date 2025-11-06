CSDK_SERVER_VERSION = 1.0.0
CSDK_SERVER_SETUP_TYPE = poetry

define CSDK_SERVER_INSTALL_INIT_SYSV
	install -D -m755 -t /etc/init.d $(@D)/S99csdk-server.sh
endef

$(eval $(python-package))
