EZ80_LLVM_VERSION = 1d6267604fabcc7caf67ab759bb38c9a086a7213
EZ80_LLVM_SITE = $(call github,CE-programming,llvm-project,$(EZ80_LLVM_VERSION))

HOST_EZ80_LLVM_DEPENDENCIES = host-python3 host-llvm-cmake
EZ80_LLVM_DEPENDENCIES = host-ez80-llvm
EZ80_LLVM_SUPPORTS_IN_SOURCE_BUILD = NO

EZ80_LLVM_SUBDIR = llvm

# Options mostly borrowed from buildroot's upstream llvm.mk
EZ80_LLVM_CONF_OPTS += -DCMAKE_MODULE_PATH=$(HOST_DIR)/lib/cmake/llvm
EZ80_LLVM_CONF_OPTS += -DLLVM_COMMON_CMAKE_UTILS=$(HOST_DIR)/lib/cmake/llvm

EZ80_LLVM_CONF_OPTS += -DLLVM_ENABLE_PROJECTS=clang
EZ80_LLVM_CONF_OPTS += -DLLVM_TARGETS_TO_BUILD= -DLLVM_EXPERIMENTAL_TARGETS_TO_BUILD=Z80
HOST_EZ80_LLVM_CONF_OPTS += -DLLVM_TARGETS_TO_BUILD= -DLLVM_EXPERIMENTAL_TARGETS_TO_BUILD=Z80

EZ80_LLVM_CONF_OPTS += -DLLVM_HOST_TRIPLE=$(GNU_TARGET_NAME)
EZ80_LLVM_CONF_OPTS += -DLLVM_CCACHE_BUILD=$(if $(BR2_CCACHE),ON,OFF)

EZ80_LLVM_CONF_OPTS += -DBUILD_SHARED_LIBS=OFF
EZ80_LLVM_CONF_OPTS += -DLLVM_BUILD_LLVM_DYLIB=ON
EZ80_LLVM_CONF_OPTS += -DLLVM_LINK_LLVM_DYLIB=ON
EZ80_LLVM_CONF_OPTS += -DCMAKE_CROSSCOMPILING=1
EZ80_LLVM_CONF_OPTS += -DCMAKE_BUILD_TYPE=Release

EZ80_LLVM_MAKE_OPTS = clang llvm-link
define EZ80_LLVM_INSTALL_TARGET_CMDS
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/clang $(TARGET_DIR)/bin/ez80-clang
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/llvm-link $(TARGET_DIR)/bin/ez80-link
	$(INSTALL) -m755 -t $(TARGET_DIR)/lib \
		$(@D)/llvm/buildroot-build/lib/libLLVM-15.so \
		$(@D)/llvm/buildroot-build/lib/libclang-cpp.so.15
endef

# Unlike upstream LLVM, build our own tablegen because we have an older
# version of LLVM than upstream and they seem to be incompatible.
HOST_EZ80_LLVM_MAKE_OPTS = llvm-tblgen clang-tblgen clang llvm-link
HOST_EZ80_LLVM_CONF_OPTS += -DLLVM_ENABLE_PROJECTS=clang
HOST_EZ80_LLVM_CONF_OPTS += -DCMAKE_BUILD_TYPE=Release
HOST_EZ80_LLVM_CONF_OPTS += -DBUILD_SHARED_LIBS=OFF
define HOST_EZ80_LLVM_INSTALL_CMDS
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/llvm-tblgen $(HOST_DIR)/bin/ez80-llvm-tblgen
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/clang-tblgen $(HOST_DIR)/bin/ez80-clang-tblgen
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/clang $(HOST_DIR)/bin/ez80-clang
	$(INSTALL) -m755 $(@D)/llvm/buildroot-build/bin/llvm-link $(HOST_DIR)/bin/ez80-link
endef
EZ80_LLVM_CONF_OPTS += -DLLVM_TABLEGEN=$(HOST_DIR)/bin/ez80-llvm-tblgen
EZ80_LLVM_CONF_OPTS += -DCLANG_TABLEGEN=$(HOST_DIR)/bin/ez80-clang-tblgen

$(eval $(cmake-package))
$(eval $(host-cmake-package))
