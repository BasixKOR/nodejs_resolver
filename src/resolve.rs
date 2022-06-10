use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::plugin::{
    AliasFieldPlugin, ExportsFieldPlugin, ImportsFieldPlugin, MainFieldPlugin, MainFilePlugin,
    Plugin,
};
use crate::{
    description::PkgFileInfo, Resolver, ResolverInfo, ResolverResult, ResolverStats, MODULE,
};

impl Resolver {
    pub(crate) fn append_ext_for_path(path: &Path, ext: &str) -> PathBuf {
        let str = if ext.is_empty() { "" } else { "." };
        PathBuf::from(&format!("{}{str}{ext}", path.display()))
    }

    pub(crate) fn resolve_as_file(&self, info: ResolverInfo) -> ResolverStats {
        let path = info.get_path();
        if !(*self.options.enforce_extension.as_ref().unwrap_or(&false)) && path.is_file() {
            ResolverStats::Success(ResolverResult::Info(
                info.with_path(path).with_target(self, ""),
            ))
        } else {
            for extension in &self.options.extensions {
                let path = if info.request.target.is_empty() {
                    Resolver::append_ext_for_path(&info.path, extension)
                } else {
                    let str = if extension.is_empty() { "" } else { "." };
                    info.path
                        .join(format!("{}{str}{extension}", info.request.target))
                };
                if path.is_file() {
                    return ResolverStats::Success(ResolverResult::Info(
                        info.with_path(path).with_target(self, ""),
                    ));
                }
            }

            ResolverStats::Resolving(info)
        }
    }

    pub(crate) fn resolve_as_dir(&self, info: ResolverInfo) -> ResolverStats {
        let dir = info.get_path();
        if !dir.is_dir() {
            return ResolverStats::Error((Resolver::raise_tag(), info));
        }
        let pkg_info_wrap = match self.load_pkg_file(&dir) {
            Ok(pkg_info) => pkg_info,
            Err(err) => return ResolverStats::Error((err, info)),
        };

        let info = info.with_path(dir).with_target(self, "");
        MainFieldPlugin::new(&pkg_info_wrap)
            .apply(self, info)
            .and_then(|info| MainFilePlugin::new(&pkg_info_wrap).apply(self, info))
    }

    pub(crate) fn resolve_as_modules(&self, info: ResolverInfo) -> ResolverStats {
        let original_dir = info.path.clone();
        let module_path = original_dir.join(MODULE);

        let stats = if module_path.is_dir() {
            let target = &info.request.target;
            let pkg_info = match self.load_pkg_file(&module_path.join(&**target)) {
                Ok(pkg_info) => pkg_info,
                Err(err) => return ResolverStats::Error((err, info)),
            };
            let info = info.with_path(module_path);
            self.get_real_target(info, &pkg_info)
                .and_then(|info| self.resolve_as_file(info))
                .and_then(|info| {
                    let stats = self.resolve_as_dir(info);
                    if stats.is_success() {
                        stats
                    } else {
                        ResolverStats::Resolving(stats.extract_info())
                    }
                })
        } else {
            ResolverStats::Resolving(info)
        }
        .and_then(|info| {
            if let Some(parent_dir) = original_dir.parent() {
                self.resolve_as_modules(info.with_path(parent_dir.to_path_buf()))
            } else {
                ResolverStats::Resolving(info)
            }
        });

        match stats {
            ResolverStats::Success(success) => ResolverStats::Success(success),
            ResolverStats::Resolving(info) => ResolverStats::Error((Resolver::raise_tag(), info)),
            ResolverStats::Error(err) => ResolverStats::Error(err),
        }
    }

    pub(crate) fn deal_imports_exports_field_plugin(
        &self,
        info: ResolverInfo,
        pkg_info: &Arc<PkgFileInfo>,
    ) -> ResolverStats {
        ExportsFieldPlugin::new(pkg_info)
            .apply(self, info)
            .and_then(|info| ImportsFieldPlugin::new(pkg_info).apply(self, info))
    }

    /// TODO: remove this function
    pub(crate) fn get_real_target(
        &self,
        info: ResolverInfo,
        pkg_info: &Option<Arc<PkgFileInfo>>,
    ) -> ResolverStats {
        if let Some(pkg_info) = pkg_info {
            // Should deal `exports` and `imports` firstly.
            self.deal_imports_exports_field_plugin(info, pkg_info)
                .and_then(|info| AliasFieldPlugin::new(pkg_info).apply(self, info))
        } else {
            ResolverStats::Resolving(info)
        }
    }
}
