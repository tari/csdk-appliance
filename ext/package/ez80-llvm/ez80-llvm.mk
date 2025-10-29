EZ80_LLVM_VERSION = 005a99ce2569373524bd881207aa4a1e98a2b238
EZ80_LLVM_SITE = $(call github,jacobly0,llvm-project,$(EZ80_LLVM_VERSION))

# TODO: patch include/llvm/ADT/SmallVector.h to include <cstdint>

HOST_EZ80_LLVM_DEPENDENCIES = host-python3 host-llvm-cmake
EZ80_LLVM_DEPENDENCIES = host-ez80-llvm
EZ80_LLVM_SUPPORTS_IN_SOURCE_BUILD = NO

EZ80_LLVM_SUBDIR = llvm

# Options mostly borrowed from buildroot's upstream llvm.mk
EZ80_LLVM_CONF_OPTS += -DCMAKE_MODULE_PATH=$(HOST_DIR)/lib/cmake/llvm
EZ80_LLVM_CONF_OPTS += -DLLVM_COMMON_CMAKE_UTILS=$(HOST_DIR)/lib/cmake/llvm

EZ80_LLVM_CONF_OPTS += -DLLVM_ENABLE_PROJECTS=clang
EZ80_LLVM_CONF_OPTS += -DLLVM_TARGETS_TO_BUILD= -DLLVM_EXPERIMENTAL_TARGETS_TO_BUILD=Z80

EZ80_LLVM_CONF_OPTS += -DLLVM_HOST_TRIPLE=$(GNU_TARGET_NAME)
EZ80_LLVM_CONF_OPTS += -DLLVM_CCACHE_BUILD=$(if $(BR2_CCACHE),ON,OFF)

#EZ80_LLVM_CONF_OPTS += -DLLVM_CONFIG_PATH=$(HOST_DIR)/bin/llvm-config
# ..then it explodes due to library deps
EZ80_LLVM_CONF_OPTS += -DBUILD_SHARED_LIBS=OFF
EZ80_LLVM_CONF_OPTS += -DLLVM_BUILD_LLVM_DYLIB=ON
EZ80_LLVM_CONF_OPTS += -DLLVM_LINK_LLVM_DYLIB=ON
EZ80_LLVM_CONF_OPTS += -DCMAKE_CROSSCOMPILING=1
EZ80_LLVM_CONF_OPTS += -DCMAKE_BUILD_TYPE=Release

EZ80_LLVM_MAKE_OPTS = clang
define EZ80_LLVM_INSTALL_TARGET_CMDS
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/clang-15 $(TARGET_DIR)/bin/ez80-clang
	$(INSTALL) -m755 -t $(TARGET_DIR)/lib \
		$(@D)/llvm/buildroot-build/lib/libLLVM-15git.so \
		$(@D)/llvm/buildroot-build/lib/libclang-cpp.so.15git
endef

# Unlike upstream LLVM, build our own tablegen because we have an older
# version of LLVM than upstream and they seem to be incompatible.
HOST_EZ80_LLVM_MAKE_OPTS = llvm-tblgen clang-tblgen
HOST_EZ80_LLVM_CONF_OPTS += -DLLVM_ENABLE_PROJECTS=clang
HOST_EZ80_LLVM_CONF_OPTS += -DCMAKE_BUILD_TYPE=Release
HOST_EZ80_LLVM_CONF_OPTS += -DBUILD_SHARED_LIBS=OFF
define HOST_EZ80_LLVM_INSTALL_CMDS
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/llvm-tblgen $(HOST_DIR)/bin/ez80-llvm-tblgen
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/clang-tblgen $(HOST_DIR)/bin/ez80-clang-tblgen
endef
EZ80_LLVM_CONF_OPTS += -DLLVM_TABLEGEN=$(HOST_DIR)/bin/ez80-llvm-tblgen
EZ80_LLVM_CONF_OPTS += -DCLANG_TABLEGEN=$(HOST_DIR)/bin/ez80-clang-tblgen

$(eval $(cmake-package))
$(eval $(host-cmake-package))
