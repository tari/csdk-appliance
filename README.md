### Use defconfig

```
make BR2_EXTERNAL=csdk-appliance/ext defconfig v86_defconfig
```

### Update defconfig

```
make savedefconfig BR2_DEFCONFIG=../ext/configs/v86_defconfig
```

### Kernel configuration

```
make linux-menuconfig
```

And to update the defconfig (writing to `BR2_LINUX_KERNEL_CUSTOM_CONFIG_FILE`):

```
make linux-update-defconfig
```
