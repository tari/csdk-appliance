CSDK_SERVER_VERSION = 9fc2046f2ed9510722a0023a700e78a94829f0f4
CSDK_SERVER_SITE = https://gitlab.com/cemetech/csdk/-/archive/$(CSDK_SERVER_VERSION)
CSDK_SERVER_SOURCE = csdk-$(CSDK_SERVER_VERSION).tar.bz2

CSDK_SERVER_SETUP_TYPE = poetry

$(eval $(python-package))