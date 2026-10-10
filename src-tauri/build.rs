fn main() {
    #[cfg(all(windows, target_env = "gnu"))]
    {
        println!("cargo:rustc-link-arg=-Wl,--exclude-all-symbols");
    }
    tauri_build::build()
}
