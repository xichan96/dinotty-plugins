use std::env;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{self, Command};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn cli_path() -> Result<PathBuf, String> {
    let executable =
        env::current_exe().map_err(|error| format!("could not locate launcher: {error}"))?;
    let directory = executable
        .parent()
        .ok_or_else(|| "launcher has no parent directory".to_string())?;
    let cli = directory.join("cli");
    if !cli.is_file() {
        return Err(format!("CLI script not found at {}", cli.display()));
    }
    Ok(cli)
}

fn main() {
    let cli = match cli_path() {
        Ok(path) => path,
        Err(message) => {
            eprintln!("session-browser: {message}");
            process::exit(1);
        }
    };

    let status = Command::new("node")
        .creation_flags(CREATE_NO_WINDOW)
        .arg(&cli)
        .args(env::args_os().skip(1))
        .status();

    match status {
        Ok(status) => process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("session-browser: could not start node for {}: {error}", cli.display());
            process::exit(1);
        }
    }
}
