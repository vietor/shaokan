use serde::Serialize;
use std::fs;
use std::path::{PathBuf};

#[derive(Serialize)]
struct MdFile {
    name: String,
    path: String,
}

#[tauri::command]
fn list_md_files(dir: String) -> Result<Vec<MdFile>, String> {
    let path = PathBuf::from(&dir);
    if !path.exists() {
        return Err(format!("dir_not_found:{}", dir));
    }
    if !path.is_dir() {
        return Err(format!("not_a_dir:{}", dir));
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
            if let Some(ext) = p.extension() {
                if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
                    files.push(MdFile {
                        name: p.file_name()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default(),
                        path: p.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

#[tauri::command]
fn read_md_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    Ok(PathBuf::from(home).join("Documents").to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_md_files,
            read_md_file,
            get_home_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
