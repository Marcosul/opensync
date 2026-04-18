// Evita abrir terminal extra no Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    opensync_desktop_lib::run();
}
