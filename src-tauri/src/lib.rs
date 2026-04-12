use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::sync::Mutex;
use std::time::Duration;

struct BackendChild(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Spawn the Python backend sidecar
            let shell = app.shell();
            let sidecar = shell
                .sidecar("facetrack-server")
                .expect("failed to create sidecar command");

            let (mut rx, child) = sidecar.spawn().expect("failed to spawn backend sidecar");

            // Log sidecar output in a background thread
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            log::info!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            log::info!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(status) => {
                            log::info!("[backend] terminated with {:?}", status);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            // Store child so we can kill it on exit
            app.manage(BackendChild(Mutex::new(Some(child))));

            // Wait for backend to be ready (poll /health)
            log::info!("Waiting for backend to start...");
            let client = reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap();

            for i in 0..30 {
                match client.get("http://127.0.0.1:8000/health").send() {
                    Ok(resp) if resp.status().is_success() => {
                        log::info!("Backend ready after {} attempts", i + 1);
                        break;
                    }
                    _ => {
                        if i == 29 {
                            log::error!("Backend failed to start after 30 attempts");
                        }
                        std::thread::sleep(Duration::from_millis(500));
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the backend sidecar when the window closes
                if let Some(state) = window.try_state::<BackendChild>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            log::info!("Killing backend sidecar...");
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
