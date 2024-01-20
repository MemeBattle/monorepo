use assert_fs::{prelude::*, TempDir};
use predicates::prelude::*;
#[cfg(not(target_os = "windows"))]
use rexpect::session::{spawn_command, PtySession};
use std::{error::Error, process::Command};

trait Expectations {
  fn exp_title(&mut self, title: &str) -> Result<(), Box<dyn Error>>;
}

impl Expectations for PtySession {
  fn exp_title(&mut self, title: &str) -> Result<(), Box<dyn Error>> {
    self.exp_string(&format!("Confirm title: {}", title))?;
    self.exp_regex("\\s*")?;
    Ok(())
  }
}

#[cfg(not(target_os = "windows"))]
fn setup_command() -> Result<(Command, TempDir), Box<dyn Error>> {
  let temp_dir = assert_fs::TempDir::new()?;

  let bin_path = assert_cmd::cargo::cargo_bin("mems_post");
  let fake_editor_path = std::env::current_dir()?
    .join("tests")
    .join("fake-editor.sh");

  if !fake_editor_path.exists() {
    panic!("fake-editor.sh does not exist")
  }

  let mut cmd = Command::new(bin_path);
  cmd
    .env("EDITOR", fake_editor_path.into_os_string())
    .env("DIR", temp_dir.path())
    .env("NO_COLOR", "true");

  Ok((cmd, temp_dir))
}

#[test]
fn test_help() {
  assert_cmd::Command::cargo_bin("mems_post")
    .unwrap()
    .arg("--help")
    .assert()
    .success()
    .stderr("");
}

#[test]
fn test_create_help() {
  assert_cmd::Command::cargo_bin("mems_post")
    .unwrap()
    .arg("create")
    .arg("--help")
    .assert()
    .success()
    .stderr("");
}

#[cfg(not(target_os = "windows"))]
#[test]
fn test_create_with_title() -> Result<(), Box<dyn Error>> {
  let (mut cmd, temp_dir) = setup_command()?;
  cmd.arg("create").arg("-t").arg("atitle");

  let mut process = spawn_command(cmd, Some(3000))?;

  process.exp_title("atitle")?;
  process.send_line("Y")?;
  process.exp_eof()?;

  temp_dir
    .child("atitle.md")
    .assert(predicate::path::exists());

  Ok(())
}

#[cfg(not(target_os = "windows"))]
#[test]
fn test_create_with_written_title() -> Result<(), Box<dyn Error>> {
  let (mut cmd, temp_dir) = setup_command()?;
  cmd.arg("create").arg("-t").arg("testing");

  let mut process = spawn_command(cmd, Some(3000))?;

  process.exp_title("testing")?;
  process.send_line("Y")?;
  process.exp_eof()?;

  temp_dir
    .child("testing.md")
    .assert(predicate::path::exists());

  Ok(())
}
